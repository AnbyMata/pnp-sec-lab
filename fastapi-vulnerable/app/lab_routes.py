import re
import threading
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import requests
import pymysql
import os
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from .mini_rainbow import digest, lookup

router = APIRouter(prefix="/lab")
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
events = deque(maxlen=256)
event_lock = threading.Lock()
receiver = None


class Receiver(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/observe":
            self.send_error(404)
            return
        token = parse_qs(parsed.query).get("token", [""])[0][:80]
        with event_lock:
            events.append({"token": token, "time": datetime.now(timezone.utc).isoformat(), "method": "GET"})
        # The SSRF caller must not expose this response body.
        body = b"PRIVATE_CALLBACK_BODY"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def start_receiver():
    global receiver
    receiver = ThreadingHTTPServer(("127.0.0.1", 9001), Receiver)
    threading.Thread(target=receiver.serve_forever, daemon=True).start()


def stop_receiver():
    if receiver:
        receiver.shutdown()
        receiver.server_close()


def render(request, **context):
    return templates.TemplateResponse("lab.html", {"request": request, "session": request.session, **context})


@router.get("/dom", response_class=HTMLResponse)
def dom(request: Request):
    return render(request, mode="dom", title="DOM XSS", description="URL의 # 뒤에 있는 값을 브라우저가 innerHTML로 처리합니다. 주소의 fragment는 서버에 전송되지 않습니다.")


@router.get("/blind", response_class=HTMLResponse)
def blind(request: Request, url: str = "", token: str = "blind-demo"):
    message = "요청할 주소를 입력하세요."
    if url:
        try:
            if urlparse(url).scheme not in ("http", "https"):
                raise ValueError("HTTP 또는 HTTPS 주소를 입력하세요.")
            # Deliberate SSRF: only transport success is exposed, never the body.
            response = requests.get(url, timeout=4, stream=True)
            response.close()
            message = "서버에서 요청을 전송했습니다. 대상의 응답 본문은 표시하지 않습니다. 기록 화면에서 token을 확인하세요."
        except (requests.RequestException, ValueError) as error:
            message = "요청 실패: " + str(error)
    return render(request, mode="blind", title="Blind SSRF", description="서버의 외부 요청을 별도 내부 수신기의 기록으로 확인합니다. 수신기는 이 컨테이너의 127.0.0.1:9001에서만 실행됩니다.", url=url, token=token[:80], message=message)


@router.get("/callbacks", response_class=HTMLResponse)
def callbacks(request: Request, token: str = "blind-demo"):
    with event_lock:
        rows = [dict(row) for row in events if row["token"] == token]
    return render(request, mode="callbacks", title="내부 요청 기록", description="수신기에 실제로 도착한 요청입니다. 최근 256개까지만 메모리에 보관하며 서버 재시작 시 지워집니다.", token=token[:80], rows=rows)


@router.get("/rainbow", response_class=HTMLResponse)
def rainbow(request: Request, hash: str = "", admin_id: int = 1):
    conn = pymysql.connect(host=os.getenv("DB_HOST", "db"), port=int(os.getenv("DB_PORT", "3306")), user=os.getenv("DB_USER", "mooncat"), password=os.getenv("DB_PASSWORD", "mooncat123"), database=os.getenv("DB_NAME", "WebTest"), charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id,username,password_hash,hash_algorithm FROM lab_admin_members WHERE id=%s", (admin_id,))
            admin = cursor.fetchone()
    finally:
        conn.close()
    target = hash.lower().strip() if hash else (admin["password_hash"] if admin else "")
    result = None
    error = ""
    if target:
        if not re.fullmatch(r"[0-9a-f]{32}", target):
            error = "32자리 MD5 해시를 입력하세요."
        else:
            result = lookup(target)
    if not admin and not hash:
        error = "실습 관리자 계정을 찾을 수 없습니다."
    return render(request, mode="rainbow", title="레인보우 테이블", description="별도 관리자 멤버 테이블 lab_admin_members의 솔트 없는 MD5 해시를 조회하고, 미리 생성한 해시·축약 체인에서 원문 후보를 찾습니다. 후보는 cat00~cat99이며 이 계정은 실습 전용입니다.", target=target, result=result, error=error, sample=digest("cat07"), admin=admin, admin_id=admin_id)
