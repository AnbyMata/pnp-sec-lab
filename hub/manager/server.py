import json, subprocess, re, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
SERVICES = {"php", "python", "spring", "db"}
PNP_MODE = os.environ.get("PNP_MODE", "dev")
def run(args):
    try:
        p = subprocess.run(["docker", "compose", *args], text=True, capture_output=True, timeout=90)
        return p.returncode == 0, (p.stdout + p.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, str(e)
class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == "/api/config": return self.reply(200, {"mode": PNP_MODE, "tools": {"shell": PNP_MODE != "prod", "attacker": PNP_MODE != "prod"}})
        if self.path != "/api/status": return self.reply(404, {"error":"Not found"})
        ok, output = run(["ps", "--all", "--format", "json"])
        if not ok: return self.reply(500, {"error":output})
        try:
            rows = json.loads(output) if output.startswith("[") else [json.loads(x) for x in output.splitlines() if x.strip()]
            self.reply(200, {"services":{x["Service"]:x.get("State", "unknown") for x in rows if x.get("Service") in SERVICES}})
        except (ValueError, KeyError) as e: self.reply(500, {"error":str(e)})
    def do_POST(self):
        if self.path not in ("/api/service", "/api/shell", "/api/sql"): return self.reply(404, {"error":"Not found"})
        # prod: shell, SQL console and service control (docker.sock) stay off server-side, not just hidden in the UI.
        if PNP_MODE == "prod": return self.reply(403, {"error":"Disabled in prod mode"})
        if self.headers.get("Origin") not in ("http://localhost:8000", "http://127.0.0.1:8000") or self.headers.get("Content-Type", "").split(";")[0] != "application/json": return self.reply(403, {"error":"Forbidden"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 4096: return self.reply(413, {"error":"Too large"})
            data = json.loads(self.rfile.read(length))
            if self.path == "/api/sql":
                database, sql = data["database"], data["sql"]
                if database != "WebTest" or not isinstance(sql, str) or not sql.strip() or len(sql) > 3000: return self.reply(400, {"error":"Invalid database or SQL"})
                result = subprocess.run(["docker", "compose", "exec", "-T", "-e", "MYSQL_PWD=labreader", "db", "mariadb", "--user=labreader", "--table", database], input=sql, text=True, capture_output=True, timeout=20)
                return self.reply(200, {"output": (result.stdout + result.stderr)[:50000], "exit_code": result.returncode})
            if self.path == "/api/shell":
                command = data["command"]
                if not isinstance(command, str) or not command.strip() or len(command) > 3000: return self.reply(400, {"error":"Invalid command"})
                original = command
                targets = {"10001": "php:80", "10002": "python:8000", "10003": "spring:8080"}
                command = re.sub(r"http://(?:localhost|127\.0\.0\.1):(10001|10002|10003)(?![0-9])", lambda match: "http://" + targets[match.group(1)], command)
                result = subprocess.run(["docker", "compose", "exec", "-T", "shell", "timeout", "15", "bash", "-c", command], text=True, capture_output=True, timeout=20)
                notice = ("실습 서버 주소로 변환해 실행했습니다:\n$ " + command + "\n\n") if command != original else ""
                return self.reply(200, {"output": notice + (result.stdout + result.stderr)[:50000], "exit_code": result.returncode})
            service, action = data["service"], data["action"]
            if service not in SERVICES or action not in ("start", "stop"): return self.reply(400, {"error":"Invalid service or action"})
            ok, output = run([action, service]); self.reply(200 if ok else 500, {"output":output})
        except (ValueError, KeyError, TypeError) as e: self.reply(400, {"error":str(e)})
        except (OSError, subprocess.TimeoutExpired) as e: self.reply(500, {"error":str(e)})
ThreadingHTTPServer(("0.0.0.0", 8765), Handler).serve_forever()
