# tools-proxy: allowlist-only request relay for the local lab workbench.
# Listens on 8770 inside the lab network (no internet egress). Stdlib only.
import base64
import binascii
import json
import os
import threading
import time
from collections import deque
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

PNP_ORIGINS = {o for o in os.environ.get(
    "PNP_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if o}

METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}

# The parsed host:port must match an entry exactly; only then is the request
# sent to the fixed internal target. Nothing in Host headers or paths can
# change where the connection goes.
ALLOWED = {
    ("localhost", 10001): ("php", 80), ("127.0.0.1", 10001): ("php", 80),
    ("localhost", 10002): ("python", 8000), ("127.0.0.1", 10002): ("python", 8000),
    ("localhost", 10003): ("spring", 8080), ("127.0.0.1", 10003): ("spring", 8080),
    ("localhost", 10010): ("attacker", 8000), ("127.0.0.1", 10010): ("attacker", 8000),
    ("php", 80): ("php", 80),
    ("python", 80): ("python", 8000), ("python", 8000): ("python", 8000),
    ("spring", 80): ("spring", 8080), ("spring", 8080): ("spring", 8080),
    ("attacker", 80): ("attacker", 8000), ("attacker", 8000): ("attacker", 8000),
}

# Hop-by-hop / framing headers are always set by the proxy, never forwarded.
SKIP_HEADERS = {
    "host", "content-length", "transfer-encoding", "connection", "keep-alive",
    "proxy-authenticate", "proxy-authorization", "te", "trailer", "trailers",
    "upgrade",
}

MAX_JSON = 2 * 1024 * 1024      # request envelope
MAX_BODY = 1024 * 1024          # upstream request body
MAX_RESULT = 200 * 1024         # captured response body (single)
MAX_BATCH = 4 * 1024            # captured response body (batch)
MAX_HEADERS = 50
MAX_HEADER_BYTES = 16 * 1024
RATE_PER_MINUTE = 300           # upstream requests, bursts counted too

_rate = deque()
_rate_lock = threading.Lock()


def reserve_upstream(n):
    now = time.monotonic()
    with _rate_lock:
        while _rate and now - _rate[0] > 60:
            _rate.popleft()
        if len(_rate) + n > RATE_PER_MINUTE:
            return False
        _rate.extend([now] * n)
        return True


class BadRequest(Exception):
    def __init__(self, status, error, message):
        super().__init__(message)
        self.status, self.error, self.message = status, error, message


def parse_request(data):
    try:
        payload = json.loads(data)
    except ValueError as exc:
        raise BadRequest(400, "bad-json", str(exc))
    if not isinstance(payload, dict):
        raise BadRequest(400, "bad-json", "request must be a JSON object")

    method = str(payload.get("method", "")).upper()
    if method not in METHODS:
        raise BadRequest(400, "bad-method", "method not allowed")

    url = payload.get("url")
    if not isinstance(url, str):
        raise BadRequest(400, "bad-url", "url must be a string")
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in url):
        raise BadRequest(400, "bad-url", "control characters are not allowed in url")
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port if parsed.port is not None else 80
    except ValueError as exc:
        raise BadRequest(400, "bad-url", str(exc))
    if parsed.scheme.lower() != "http" or host is None:
        raise BadRequest(400, "bad-url", "only http URLs are allowed")
    if "@" in parsed.netloc or parsed.username or parsed.password:
        raise BadRequest(403, "forbidden", "URL is not in the allowlist")
    target = ALLOWED.get((host.lower(), port))
    if target is None:
        raise BadRequest(403, "forbidden", "URL is not in the allowlist")

    headers = payload.get("headers") or []
    if not isinstance(headers, list) or len(headers) > MAX_HEADERS:
        raise BadRequest(400, "bad-headers", "headers must be a list of at most 50 pairs")
    clean = []
    total = 0
    for pair in headers:
        if (not isinstance(pair, (list, tuple)) or len(pair) != 2
                or not all(isinstance(x, str) for x in pair)):
            raise BadRequest(400, "bad-headers", "each header must be [name, value]")
        name, value = pair
        total += len(name) + len(value)
        if "\r" in name or "\n" in name or "\r" in value or "\n" in value:
            raise BadRequest(400, "bad-headers", "CR/LF not allowed in headers")
        if name.lower() in SKIP_HEADERS:
            continue
        clean.append((name, value))
    if total > MAX_HEADER_BYTES:
        raise BadRequest(400, "bad-headers", "headers exceed 16KB")

    body_b64 = payload.get("body_b64")
    if body_b64 is None:
        body_b64 = ""
    if not isinstance(body_b64, str):
        raise BadRequest(400, "bad-body", "body_b64 must be a base64 string")
    try:
        body = base64.b64decode(body_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise BadRequest(400, "bad-body", f"body_b64 is not valid base64: {exc}")
    if len(body) > MAX_BODY:
        raise BadRequest(413, "too-large", "body exceeds 1MB")

    count = payload.get("count", 1)
    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 30:
        raise BadRequest(400, "bad-count", "count must be an integer between 1 and 30")

    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    user_host = next((v for n, v in clean if n.lower() == "host"), None)
    forward = [(n, v) for n, v in clean if n.lower() != "host"]

    return {
        "method": method, "path": path, "headers": forward, "body": body,
        "count": count, "target": target,
        "host_header": user_host if user_host is not None else parsed.netloc,
    }


def send_upstream(req):
    host, port = req["target"]
    conn = HTTPConnection(host, port, timeout=15)
    started = time.monotonic()
    conn.putrequest(req["method"], req["path"], skip_host=True, skip_accept_encoding=True)
    conn.putheader("Host", req["host_header"])
    for name, value in req["headers"]:
        conn.putheader(name, value)
    conn.putheader("Content-Length", str(len(req["body"])))
    conn.endheaders(req["body"] if req["body"] else None)
    resp = conn.getresponse()
    ttfb_ms = round((time.monotonic() - started) * 1000)
    raw = resp.read(MAX_RESULT + 1)
    elapsed_ms = round((time.monotonic() - started) * 1000)
    result = {
        "status": resp.status, "reason": resp.reason,
        "headers": [[n, v] for n, v in resp.getheaders()],
        "body": raw, "elapsed_ms": elapsed_ms, "ttfb_ms": ttfb_ms,
    }
    conn.close()
    return result


def single_result(req):
    try:
        up = send_upstream(req)
    except Exception as exc:
        raise BadRequest(502, "upstream", str(exc))
    truncated = len(up["body"]) > MAX_RESULT
    body = up["body"][:MAX_RESULT]
    return {
        "status": up["status"], "reason": up["reason"],
        "headers": up["headers"],
        "body_b64": base64.b64encode(body).decode("ascii"),
        "truncated": truncated, "size": len(up["body"]),
        "elapsed_ms": up["elapsed_ms"], "ttfb_ms": up["ttfb_ms"],
    }


def batch_result(req):
    barrier = threading.Barrier(req["count"])
    entries = [None] * req["count"]

    def worker(i):
        started = None
        try:
            barrier.wait()
            started = time.monotonic()
            up = send_upstream(req)
            entries[i] = {
                "index": i, "_started": started, "elapsed_ms": up["elapsed_ms"],
                "status": up["status"], "headers": up["headers"],
                "body_b64": base64.b64encode(up["body"][:MAX_BATCH]).decode("ascii"),
                "size": len(up["body"]),
            }
        except Exception as exc:
            entries[i] = {
                "index": i, "_started": started if started is not None else time.monotonic(),
                "elapsed_ms": round((time.monotonic() - started) * 1000) if started else 0,
                "status": None, "headers": [], "body_b64": "", "size": 0,
                "error": str(exc),
            }

    threads = [threading.Thread(target=worker, args=(i,), daemon=True) for i in range(req["count"])]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    done = [e for e in entries if e is not None]
    if len(done) < req["count"]:
        for i, e in enumerate(entries):
            if e is None:
                entries[i] = {"index": i, "_started": time.monotonic(), "elapsed_ms": 0,
                              "status": None, "headers": [], "body_b64": "", "size": 0,
                              "error": "timeout"}
    base = min(e["_started"] for e in entries)
    results = []
    for e in entries:
        started = e.pop("_started")
        e["start_ms"] = round((started - base) * 1000)
        results.append(e)
    last_end = max(base + e["start_ms"] / 1000 + e["elapsed_ms"] / 1000 for e in results)
    return {"ok": True, "results": results, "total_ms": round((last_end - base) * 1000)}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        self.reply(404, {"ok": False, "error": "not-found", "message": "Not found"})

    def do_POST(self):
        if self.path != "/request":
            return self.reply(404, {"ok": False, "error": "not-found", "message": "Not found"})
        try:
            if (self.headers.get("Origin") not in PNP_ORIGINS
                    or self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json"):
                raise BadRequest(403, "forbidden", "Origin or Content-Type not allowed")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise BadRequest(400, "bad-length", "invalid Content-Length")
            if length < 0:
                raise BadRequest(400, "bad-length", "invalid Content-Length")
            if length > MAX_JSON:
                raise BadRequest(413, "too-large", "request exceeds 2MB")
            req = parse_request(self.rfile.read(length))
            if not reserve_upstream(req["count"]):
                raise BadRequest(429, "rate-limit", "too many upstream requests")
            if req["count"] == 1:
                return self.reply(200, {"ok": True, "result": single_result(req)})
            return self.reply(200, batch_result(req))
        except BadRequest as exc:
            return self.reply(exc.status, {"ok": False, "error": exc.error, "message": exc.message})
        except Exception as exc:
            return self.reply(500, {"ok": False, "error": "internal", "message": str(exc)})


ThreadingHTTPServer(("0.0.0.0", 8770), Handler).serve_forever()
