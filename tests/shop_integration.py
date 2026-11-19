"""Run inside the Python container; creates and removes isolated test accounts."""
import uuid
from concurrent.futures import ThreadPoolExecutor
import requests
from app.shop import connection

BASES = {'php': 'http://php', 'python': 'http://127.0.0.1:8000', 'spring': 'http://spring:8080'}
HEADERS = {'X-Nebula-Shop': '1'}

def login(base, kind, uid):
    session = requests.Session()
    path = '/member/member_login_check.php' if kind == 'php' else '/login'
    data = {'user_id': uid, 'user_pw': 'shop-test-password'} if kind == 'php' else {'user_id' if kind == 'python' else 'userId': uid, 'password': 'shop-test-password'}
    response = session.post(base + path, data=data, timeout=15)
    assert response.status_code == 200, response.text[:500]
    assert session.get(base + '/api/store/wallet', timeout=10).status_code == 200
    return session

def call(session, base, path, expected=200, data=None, headers=HEADERS):
    response = session.get(base + '/api/store/' + path, timeout=10) if data is None else session.post(base + '/api/store/' + path, json=data, headers=headers, timeout=10)
    assert response.status_code == expected, (base, path, response.status_code, response.text[:500])
    return response.json()

created = []
try:
    for kind, base in BASES.items():
        uid = 'sc_' + uuid.uuid4().hex[:10]
        created.append(uid)
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute('INSERT INTO member_modern(user_id,password,name,nickname,age,email,created_at) VALUES(%s,%s,%s,%s,20,%s,NOW())', (uid, 'shop-test-password', uid, '상점테스트', 'shop@example.test'))
            conn.commit()
        anon = requests.Session()
        assert len(call(anon, base, 'catalog')['products']) == 3
        assert call(anon, base, 'catalog/lumina')['price'] == 2400
        call(anon, base, 'wallet', 401)
        call(anon, base, 'purchase', 401, {'planet_id': 'lumina'})
        session = login(base, kind, uid)
        assert call(session, base, 'wallet')['balance'] == 10000
        call(session, base, 'purchase', 403, {'planet_id': 'lumina'}, {})
        call(session, base, 'quote', 400, {'planet_id': 'lumina', 'coupon': 'BAD'})
        call(session, base, 'purchase', 404, {'planet_id': 'missing'})
        quote = call(session, base, 'quote', data={'planet_id': 'lumina', 'coupon': 'NEBULA10'})
        assert quote['total'] == 2160
        assert call(session, base, 'wallet')['balance'] == 10000
        order = call(session, base, 'purchase', data={'planet_id': 'lumina', 'coupon': 'NEBULA10', 'price': 1, 'total': 1})
        assert order['total'] == 2160 and int(order['order_id']) > 0
        assert call(session, base, 'wallet')['balance'] == 7840
        call(session, base, 'purchase', 409, {'planet_id': 'lumina'})
        call(session, base, 'purchase', 409, {'planet_id': 'aurelia', 'coupon': 'NEBULA10'})
        # All runtimes share the same wallet and purchase history for this account.
        for peer, peerbase in BASES.items():
            other = login(peerbase, peer, uid)
            assert call(other, peerbase, 'wallet')['balance'] == 7840
            assert call(other, peerbase, 'inventory')['orders'][0]['planet_id'] == 'lumina'
        def purchase(_):
            response = requests.post(base + '/api/store/purchase', cookies=session.cookies, headers=HEADERS, json={'planet_id': 'celestia'}, timeout=15)
            return response.status_code
        with ThreadPoolExecutor(2) as pool:
            statuses = sorted(pool.map(purchase, range(2)))
            assert statuses == [200, 409], (kind, statuses)
        assert call(session, base, 'wallet')['balance'] == 6240
        assert len(call(session, base, 'orders')['orders']) == 2
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute('UPDATE nebula_wallet SET balance=100 WHERE user_id=%s', (uid,))
            conn.commit()
        call(session, base, 'purchase', 409, {'planet_id': 'aurelia'})
        assert call(session, base, 'wallet')['balance'] == 100
        print(kind + ': PASS (catalog, auth, quote, purchase, coupon, shared account, concurrency, insufficient funds)', flush=True)
finally:
    with connection() as conn:
        with conn.cursor() as cur:
            for uid in created:
                cur.execute('DELETE FROM nebula_orders WHERE user_id=%s', (uid,))
                cur.execute('DELETE FROM nebula_wallet WHERE user_id=%s', (uid,))
                cur.execute('DELETE FROM member_modern WHERE user_id=%s', (uid,))
        conn.commit()
