import os
import hmac
import shutil
import base64
import time
from collections import deque
from contextvars import ContextVar
from datetime import datetime, timezone
from itertools import count
from pathlib import Path
from urllib.parse import urlparse

import pymysql
import requests
from fastapi import FastAPI, Form, Request, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Mooncat Atelier")
app.add_middleware(SessionMiddleware, secret_key=os.getenv("PNP_SESSION_SECRET", "mooncat-secret-1234"), same_site="lax")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory=BASE_DIR / "templates")
from .challenge_flags import flag_for
SQLI_FLAG = flag_for("sqli-login", "SQLI_LAB_FLAG", "PNP{lab_flag_not_configured}")
IDOR_FLAG = flag_for("idor-profile", "IDOR_LAB_FLAG", "PNP{lab_flag_not_configured}")
TRAVERSAL_FLAG = flag_for("path-traversal", "TRAVERSAL_LAB_FLAG", "PNP{lab_flag_not_configured}")
XSS_FLAG = flag_for("reflected-xss", "XSS_LAB_FLAG", "PNP{lab_flag_not_configured}")
SSRF_FLAG = flag_for("ssrf-oracle", "SSRF_LAB_FLAG", "PNP{lab_flag_not_configured}")
PNP_MODE = os.getenv("PNP_MODE", "dev")
from .lab_routes import router as lab_router, start_receiver, stop_receiver
from .server_challenges import router as server_router, initialize as initialize_challenges, FLAGS as SERVER_FLAGS
app.include_router(lab_router)
app.include_router(server_router)
from .shop import router as shop_router
app.include_router(shop_router)
app.add_event_handler("startup", initialize_challenges)
app.add_event_handler("startup", start_receiver)
app.add_event_handler("shutdown", stop_receiver)


def db():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "db"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "mooncat"),
        password=os.getenv("DB_PASSWORD", "mooncat123"),
        database=os.getenv("DB_NAME", "WebTest"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


# DEV ONLY (PNP_MODE != "prod"): records executed SQL verbatim, which can
# include student passwords typed into the intentionally vulnerable forms.
# The buffer never leaves the lab network and /lab/querylog returns 404 in prod.
QUERY_LOG = deque(maxlen=50)
QUERY_SEQ = count(1)

# Request path/method for the log entry; set by middleware below. Sync DB
# helpers run in FastAPI's thread pool, which copies contextvars — the value
# set here is visible inside fetch_one/fetch_all/execute ("" when absent).
REQUEST_CTX = ContextVar("request_ctx", default=None)


@app.middleware("http")
async def request_context(request: Request, call_next):
    REQUEST_CTX.set({"path": request.url.path, "method": request.method})
    return await call_next(request)


def log_event(kind: str, **fields):
    # Shared event buffer for query + non-query events. Logging failures must
    # never change endpoint behaviour.
    if PNP_MODE == "prod":
        return
    try:
        ctx = REQUEST_CTX.get()
        if ctx and ctx["path"] == "/lab/echo":
            return
        entry = {
            "seq": next(QUERY_SEQ),
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "kind": kind,
            "path": ctx["path"] if ctx else "",
            "method": ctx["method"] if ctx else "",
        }
        entry.update(fields)
        # detail is user-controlled (file name / URL) — keep it a short string.
        # query entries keep full `sql` verbatim, so only `detail` is bounded.
        if isinstance(entry.get("detail"), str):
            entry["detail"] = entry["detail"][:300]
        QUERY_LOG.append(entry)
    except Exception:
        pass


def log_query(sql: str, rows=None, error=None):
    log_event(
        "query",
        time=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        sql=sql,
        rows=rows,
        error=error,
    )


def fetch_one(sql: str):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            row = cur.fetchone()
        log_query(sql, rows=1 if row else 0)
        return row
    except Exception as exc:
        log_query(sql, error=str(exc))
        raise
    finally:
        conn.close()


def fetch_all(sql: str):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        log_query(sql, rows=len(rows))
        return rows
    except Exception as exc:
        log_query(sql, error=str(exc))
        raise
    finally:
        conn.close()


def execute(sql: str):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            result = cur.lastrowid
        log_query(sql, rows=cur.rowcount)
        return result
    except Exception as exc:
        log_query(sql, error=str(exc))
        raise
    finally:
        conn.close()


def page(request: Request, template: str, **context):
    context.update({"request": request, "session": request.session})
    return templates.TemplateResponse(template, context)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/lab/querylog")
def lab_querylog(paths: str = "", limit: int = 5, kinds: str = ""):
    # DEV ONLY: plaintext event/query log (see QUERY_LOG comment); disabled in prod.
    if PNP_MODE == "prod":
        raise HTTPException(status_code=404, detail="Not found")
    entries = list(QUERY_LOG)
    if kinds:
        wanted_kinds = set(k for k in kinds.split(",") if k)
        entries = [e for e in entries if e.get("kind") in wanted_kinds]
    if not paths:
        return {"entries": entries[-20:][::-1], "total": len(entries)}
    wanted = set(paths.split(","))
    filtered = [e for e in entries if e["path"] in wanted]
    limit = max(1, min(20, limit))
    return {"entries": filtered[-limit:][::-1], "total": len(filtered)}


@app.api_route("/lab/echo", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def lab_echo(request: Request):
    # DEV ONLY target for the request workbench (W1); disabled in prod.
    if PNP_MODE == "prod":
        raise HTTPException(status_code=404, detail="Not found")
    body = await request.body()
    return {
        "method": request.method,
        "path": request.url.path,
        "query": request.url.query,
        "headers": dict(request.headers),
        "body_len": len(body),
        "body_b64": base64.b64encode(body[: 64 * 1024]).decode("ascii"),
        "received_at": time.time(),
    }


@app.get("/lab/session")
def lab_session(request: Request):
    user_id = request.session.get("user_id")
    return {"authenticated": bool(user_id), "user_id": user_id}


@app.get("/admin", response_class=HTMLResponse)
def admin_lab(request: Request):
    if request.session.get("user_id") != "admin":
        raise HTTPException(status_code=403, detail="관리자 계정으로 로그인해야 합니다")
    return page(request, "admin.html", flag=SQLI_FLAG)


@app.post("/lab/challenges/sqli-login/verify")
async def verify_sqli_flag(request: Request):
    if not SQLI_FLAG:
        raise HTTPException(status_code=404, detail="이 환경에서는 해당 플래그가 비활성화되어 있습니다")
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 요청입니다")
    flag = data.get("flag") if isinstance(data, dict) else None
    if not isinstance(flag, str) or len(flag) > 200:
        raise HTTPException(status_code=400, detail="잘못된 플래그입니다")
    return {"correct": hmac.compare_digest(flag.strip().encode("utf-8"), SQLI_FLAG.encode("utf-8"))}


@app.post("/lab/challenges/{challenge_id}/verify")
async def verify_lab_flag(challenge_id: str, request: Request):
    flags = {
        **SERVER_FLAGS,
        "idor-profile": IDOR_FLAG,
        "path-traversal": TRAVERSAL_FLAG,
        "reflected-xss": XSS_FLAG,
        "ssrf-oracle": SSRF_FLAG,
    }
    expected = flags.get(challenge_id)
    if not expected:
        raise HTTPException(status_code=404, detail="알 수 없는 챌린지입니다")
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 요청입니다")
    flag = data.get("flag") if isinstance(data, dict) else None
    if not isinstance(flag, str) or len(flag) > 200:
        raise HTTPException(status_code=400, detail="잘못된 플래그입니다")
    return {"correct": hmac.compare_digest(flag.strip().encode("utf-8"), expected.encode("utf-8"))}


@app.get("/lab/profile")
def lab_profile(request: Request, user_id: str = ""):
    # Deliberate IDOR: login is required, but ownership is not checked.
    if not request.session.get("user_id"):
        raise HTTPException(status_code=401, detail="먼저 로그인하세요")
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, nickname, email FROM member_modern WHERE user_id=%s", (user_id,))
            user = cur.fetchone()
    finally:
        conn.close()
    if not user:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다")
    result = {"profile": user, "viewer": request.session["user_id"]}
    if user_id == "admin" and IDOR_FLAG:
        result["lab_note"] = IDOR_FLAG
    return result


@app.get("/lab/file", response_class=PlainTextResponse)
def lab_file(name: str = "welcome.txt"):
    # Deliberate traversal within a synthetic lab directory; never expose real files.
    root = (BASE_DIR / "lab_files").resolve()
    target = (root / "public" / name).resolve()
    if not target.is_relative_to(root):
        log_event("file", detail=name, ok=False, note="denied")
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    if not target.is_file():
        log_event("file", detail=name, ok=False, note="not-found")
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    content = target.read_text(encoding="utf-8")
    log_event("file", detail=name, ok=True, note="ok")
    if target == (root / "private" / "note.txt") and TRAVERSAL_FLAG:
        content += f"\n{TRAVERSAL_FLAG}\n"
    return content


@app.get("/lab/xss-preview", response_class=HTMLResponse)
def xss_preview(message: str = ""):
    # Deliberate reflected XSS for this local lab only.
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><title>방명록 미리보기</title>"
        "<h1>방명록 미리보기</h1><p>입력한 문장이 그대로 표시됩니다.</p>"
        f"<div class='message'>{message}</div>"
        + (f"<!-- review-note: {XSS_FLAG} -->" if XSS_FLAG else "")
    )


@app.get("/lab/internal-note", response_class=PlainTextResponse)
def internal_note(request: Request):
    if request.headers.get("X-PNP-Lab-Oracle") != "1":
        raise HTTPException(status_code=403, detail="실습용 내부 경로입니다")
    return f"internal note: {SSRF_FLAG}"


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return page(request, "nebula-home.html")


@app.get("/store", response_class=HTMLResponse)
def store(request: Request):
    return page(request, "store.html")


@app.get("/login", response_class=HTMLResponse)
def login_form(request: Request, error: str = ""):
    return page(request, "login.html", error=error)


@app.post("/login")
def login(request: Request, user_id: str = Form(""), password: str = Form("")):
    sql = f"SELECT * FROM member_modern WHERE user_id='{user_id}' AND password='{password}'"
    user = fetch_one(sql)
    if not user:
        return page(request, "login.html", error="아이디 또는 비밀번호를 확인해 주세요.")
    request.session["user_id"] = user["user_id"]
    request.session["nickname"] = user["nickname"]
    return RedirectResponse("/", status_code=303)


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)


@app.get("/register", response_class=HTMLResponse)
def register_form(request: Request):
    return page(request, "register.html", error="")


@app.post("/register")
def register(
    request: Request,
    user_id: str = Form(""),
    name: str = Form(""),
    password: str = Form(""),
    nickname: str = Form(""),
    age: str = Form("0"),
    email: str = Form(""),
):
    nickname = nickname or name
    existing = fetch_one(f"SELECT * FROM member_modern WHERE user_id='{user_id}'")
    if existing:
        return page(request, "register.html", error="이미 사용 중인 아이디예요.")
    execute(
        "INSERT INTO member_modern (user_id,password,name,nickname,age,email,created_at) VALUES "
        f"('{user_id}','{password}','{name}','{nickname}',{age or 0},'{email}',NOW())"
    )
    return RedirectResponse("/login", status_code=303)


@app.get("/profile", response_class=HTMLResponse)
def profile(request: Request):
    if not request.session.get("user_id"):
        return RedirectResponse("/login", status_code=303)
    user = fetch_one(f"SELECT * FROM member_modern WHERE user_id='{request.session['user_id']}'")
    return page(request, "profile.html", user=user)


@app.post("/profile")
def update_profile(
    request: Request,
    nickname: str = Form(""),
    age: str = Form("0"),
    email: str = Form(""),
    password: str = Form(""),
):
    user_id = request.session.get("user_id", "")
    sql = f"UPDATE member_modern SET nickname='{nickname}', age={age or 0}, email='{email}'"
    if password:
        sql += f", password='{password}'"
    sql += f" WHERE user_id='{user_id}'"
    execute(sql)
    request.session["nickname"] = nickname
    return RedirectResponse("/profile?updated=1", status_code=303)


@app.get("/profile/nickname")
def change_nickname(request: Request, nickname: str = ""):
    user_id = request.session.get("user_id", "")
    execute(f"UPDATE member_modern SET nickname='{nickname}' WHERE user_id='{user_id}'")
    request.session["nickname"] = nickname
    return RedirectResponse("/profile?updated=1", status_code=302)


@app.get("/board", response_class=HTMLResponse)
def board(request: Request, field: str = "subject", keyword: str = ""):
    columns = {"subject": "subject", "content": "content", "author": "author"}
    column = columns.get(field, "subject")
    if keyword:
        posts = fetch_all(
            f"SELECT * FROM board_modern WHERE {column} LIKE '%{keyword}%' ORDER BY id DESC"
        )
    else:
        posts = fetch_all("SELECT * FROM board_modern ORDER BY id DESC")
    return page(request, "board.html", posts=posts, keyword=keyword, field=field)


@app.get("/board/write", response_class=HTMLResponse)
def write_form(request: Request):
    return page(request, "write.html")


@app.post("/board/write")
def write_post(
    request: Request,
    author: str = Form(""),
    password: str = Form(""),
    email: str = Form(""),
    subject: str = Form(""),
    content: str = Form(""),
    allow_html: str = Form("F"),
    attachment: UploadFile | None = File(None),
):
    filename = ""
    file_size = 0
    if attachment and attachment.filename:
        filename = Path(attachment.filename).name
        target = UPLOAD_DIR / filename
        with target.open("wb") as out:
            shutil.copyfileobj(attachment.file, out)
        file_size = target.stat().st_size
    post_id = execute(
        "INSERT INTO board_modern (author,password,email,subject,content,allow_html,filename,file_size,created_at) VALUES "
        f"('{author}','{password}','{email}','{subject}','{content}','{allow_html}','{filename}',{file_size},NOW())"
    )
    return RedirectResponse(f"/board/{post_id}", status_code=303)


@app.get("/board/{post_id}", response_class=HTMLResponse)
def board_view(request: Request, post_id: str):
    try:
        execute(f"UPDATE board_modern SET view_count=view_count+1 WHERE id={post_id}")
    except Exception:
        pass
    post = fetch_one(f"SELECT * FROM board_modern WHERE id={post_id}")
    return page(request, "view.html", post=post, post_id=post_id)


@app.post("/board/{post_id}/delete")
def delete_post(post_id: str, password: str = Form("")):
    post = fetch_one(
        f"SELECT id,filename FROM board_modern WHERE id={post_id} AND password='{password}'"
    )
    if post:
        execute(f"DELETE FROM board_modern WHERE id={post_id}")
        if post.get("filename"):
            target = UPLOAD_DIR / post["filename"]
            if target.is_file():
                target.unlink()
    return RedirectResponse("/board", status_code=303)


@app.get("/oracle", response_class=HTMLResponse)
def oracle_form(request: Request, url: str = ""):
    result = ""
    error = ""
    if url:
        try:
            response = requests.get(url, timeout=4, headers={"X-PNP-Lab-Oracle": "1"})
            result = response.text[:5000]
            log_event("http-out", detail=url, ok=True, note=f"status {response.status_code}")
        except Exception as exc:
            error = str(exc)
            log_event("http-out", detail=url, ok=False, note=error[:200])
    return page(request, "oracle.html", url=url, result=result, error=error)
