"""NEBULA shop JSON API. Uses the shared training database."""
import os
import pymysql
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/store")
PRODUCTS = [
    dict(id="lumina", name="루미나", price=2400, description="푸른 대기 위로 빛나는 끝없는 오로라.", kind="빛의 행성"),
    dict(id="aurelia", name="아우렐리아", price=3800, description="황금빛 고리 너머 펼쳐지는 새로운 지평.", kind="고리의 행성"),
    dict(id="celestia", name="셀레스티아", price=1600, description="푸른 얼음 아래 잠든 별의 기억.", kind="얼음의 행성"),
]

def connection():
    return pymysql.connect(host=os.getenv("DB_HOST", "db"), port=int(os.getenv("DB_PORT", "3306")), user=os.getenv("DB_USER", "mooncat"), password=os.getenv("DB_PASSWORD", "mooncat123"), database=os.getenv("DB_NAME", "WebTest"), charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=False)

def user(request):
    uid = request.session.get("user_id")
    if not uid:
        raise HTTPException(401, "로그인이 필요합니다.")
    return uid

def product(pid):
    for p in PRODUCTS:
        if p["id"] == pid:
            return {**p, "image": f"/static/planet-{pid}.png"}
    raise HTTPException(404, "행성을 찾을 수 없습니다.")

@router.get("/catalog")
def catalog():
    return {"products": [product(p["id"]) for p in PRODUCTS]}

@router.get("/catalog/{pid}")
def detail(pid: str):
    return product(pid)

@router.get("/wallet")
def wallet(request: Request):
    uid = user(request)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO nebula_wallet(user_id) VALUES(%s) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)", (uid,))
            cur.execute("SELECT balance FROM nebula_wallet WHERE user_id=%s", (uid,))
            result = cur.fetchone()
        conn.commit()
    return {**result, "currency": "CR"}

@router.get("/orders")
@router.get("/inventory")
def history(request: Request):
    uid = user(request)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id,planet_id,total,coupon,created_at FROM nebula_orders WHERE user_id=%s ORDER BY id DESC", (uid,))
            orders = cur.fetchall()
    return {"orders": [{**o, "created_at": str(o["created_at"]), "product": product(o["planet_id"])} for o in orders]}

@router.post("/quote")
@router.post("/purchase")
async def checkout(request: Request):
    uid = user(request)
    if request.headers.get("x-nebula-shop") != "1":
        raise HTTPException(403, "상점 요청 헤더가 필요합니다.")
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(400, "JSON 요청을 확인해 주세요.")
    if not isinstance(data, dict) or not isinstance(data.get("planet_id"), str) or not isinstance(data.get("coupon", ""), str):
        raise HTTPException(400, "구매 정보를 확인해 주세요.")
    p = product(data["planet_id"])
    coupon = data.get("coupon", "").strip().upper()
    if coupon and coupon != "NEBULA10":
        raise HTTPException(400, "사용할 수 없는 쿠폰입니다.")
    total = p["price"] * (90 if coupon else 100) // 100
    with connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO nebula_wallet(user_id) VALUES(%s) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)", (uid,))
                cur.execute("SELECT balance FROM nebula_wallet WHERE user_id=%s FOR UPDATE", (uid,))
                balance = cur.fetchone()["balance"]
                cur.execute("SELECT id FROM nebula_orders WHERE user_id=%s AND planet_id=%s", (uid, p["id"]))
                if cur.fetchone():
                    raise HTTPException(409, "이미 보유한 행성입니다.")
                if coupon:
                    cur.execute("SELECT id FROM nebula_orders WHERE user_id=%s AND coupon=%s", (uid, coupon))
                    if cur.fetchone():
                        raise HTTPException(409, "이미 사용한 쿠폰입니다.")
                if balance < total:
                    raise HTTPException(409, "크레딧 잔액이 부족합니다.")
                result = {"planet_id": p["id"], "price": p["price"], "discount": p["price"] - total, "total": total, "balance_after": balance - total}
                if request.url.path.endswith("/purchase"):
                    cur.execute("UPDATE nebula_wallet SET balance=balance-%s WHERE user_id=%s", (total, uid))
                    cur.execute("INSERT INTO nebula_orders(user_id,planet_id,total,coupon) VALUES(%s,%s,%s,%s)", (uid, p["id"], total, coupon or None))
                    result["order_id"] = cur.lastrowid
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise
