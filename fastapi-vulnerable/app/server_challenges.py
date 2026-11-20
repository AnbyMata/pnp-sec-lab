"""Shared test environment for the three additional Server-side challenges."""
import hmac
from .challenge_flags import flag_for
import os
import secrets
from pathlib import Path

import pymysql
from pymongo import MongoClient
from pymongo.errors import OperationFailure
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/lab")
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
FLAGS = {key: flag_for(key, env, f"PNP{{{secrets.token_hex(20)}}}") for key, env in {
    "auth-recovery": "AUTH_LAB_FLAG", "upload-filter": "UPLOAD_LAB_FLAG", "nosql-login": "NOSQL_LAB_FLAG"
}.items()}
mongo = MongoClient(os.getenv("MONGO_URI", "mongodb://mongo:27017"), serverSelectionTimeoutMS=5000, connect=False)


def connection():
    return pymysql.connect(host=os.getenv("DB_HOST", "db"), user=os.getenv("DB_USER", "mooncat"),
        password=os.getenv("DB_PASSWORD", "mooncat123"), database=os.getenv("DB_NAME", "WebTest"),
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=True)


def initialize():
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("CREATE TABLE IF NOT EXISTS lab_recovery_accounts (id INT PRIMARY KEY, username VARCHAR(40) UNIQUE NOT NULL, reset_token VARCHAR(80) NOT NULL)")
            cursor.execute("INSERT IGNORE INTO lab_recovery_accounts VALUES (1,'admin','reset-1'),(2,'student','reset-2')")
    mongo.pnp_test.accounts.update_one({"username": "admin"}, {"$setOnInsert": {"password": secrets.token_urlsafe(32), "role": "admin"}}, upsert=True)


def page(request, mode, **context):
    return templates.TemplateResponse("server-challenge.html", {"request": request, "session": request.session, "mode": mode, **context})


@router.get("/auth-recovery", response_class=HTMLResponse)
def recovery(request: Request):
    return page(request, "auth", message="", flag="")


@router.post("/auth-recovery", response_class=HTMLResponse)
def recover(request: Request, username: str = Form("student"), token: str = Form("")):
    # Deliberate predictable reset token; SQL itself is parameterized.
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT username,reset_token FROM lab_recovery_accounts WHERE username=%s", (username,))
            account = cursor.fetchone()
    if not token:
        message = "본인(student) 재설정 링크의 토큰: reset-2" if username == "student" else "재설정 링크를 해당 계정으로 전송했습니다."
        return page(request, "auth", message=message, flag="")
    success = account and hmac.compare_digest(token.encode(), account["reset_token"].encode())
    return page(request, "auth", message="재설정 토큰이 확인되었습니다." if success else "토큰이 일치하지 않습니다.",
        flag=FLAGS["auth-recovery"] if success and username == "admin" else "")


@router.get("/upload-filter", response_class=HTMLResponse)
def upload_form(request: Request):
    return page(request, "upload", message="", flag="")


@router.post("/upload-filter", response_class=HTMLResponse)
async def upload(request: Request, attachment: UploadFile = File(...)):
    content = await attachment.read(65537)
    if len(content) > 65536:
        return page(request, "upload", message="64KB 이하의 파일을 사용하세요.", flag="")
    # Deliberate trust in client-supplied MIME. Files are never executed.
    if attachment.content_type not in {"image/png", "image/jpeg"}:
        return page(request, "upload", message="PNG 또는 JPEG 이미지만 업로드할 수 있습니다.", flag="")
    directory = Path("/tmp/pnp-challenge-uploads")
    directory.mkdir(exist_ok=True)
    files = sorted(directory.iterdir(), key=lambda item: item.stat().st_mtime)
    for old in files[:-99]:
        old.unlink(missing_ok=True)
    (directory / secrets.token_hex(16)).write_bytes(content)
    bypass = (attachment.filename or "").lower().endswith(".html") and b"<html" in content.lower()
    return page(request, "upload", message="업로드가 허용되었습니다. 파일은 실행되지 않는 테스트 저장소에 저장했습니다.",
        flag=FLAGS["upload-filter"] if bypass else "")


@router.get("/nosql-login", response_class=HTMLResponse)
def nosql_form(request: Request):
    return page(request, "nosql", message="", flag="")


@router.post("/nosql-login")
async def nosql_login(request: Request):
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(400, "올바른 JSON을 보내세요.")
    if not isinstance(data, dict) or not all(key in data for key in ("username", "password")):
        raise HTTPException(400, "username과 password가 필요합니다.")
    # Deliberate operator injection: nested objects are passed to MongoDB.
    try:
        account = mongo.pnp_test.accounts.find_one({"username": data["username"], "password": data["password"]})
    except OperationFailure:
        raise HTTPException(400, "지원하지 않는 검색 조건입니다.")
    if not account:
        return {"authenticated": False, "message": "인증에 실패했습니다."}
    return {"authenticated": True, "username": account["username"], **({"flag": FLAGS["nosql-login"]} if FLAGS["nosql-login"] else {})}

