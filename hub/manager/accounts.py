"""Portal accounts and revocable, server-side login sessions."""
import hashlib, hmac, os, re, secrets, sqlite3, time
import ipaddress
import socket
from http.cookies import SimpleCookie
from contextlib import contextmanager
from sessions import SessionError
from account_schema import migrate_users
from pathlib import Path

class Accounts:
    def __init__(self, path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.path = path
        with self.db() as db:
            migrated=migrate_users(db)
            db.execute('CREATE TABLE IF NOT EXISTS logins (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS auth_failures (action TEXT NOT NULL, address TEXT NOT NULL, username TEXT NOT NULL, at REAL NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS failure_address ON auth_failures(action,address,at)')
        if migrated:
            with self.db() as db: db.execute('VACUUM')
        Path(self.path).with_name('email-secret.key').unlink(missing_ok=True)
    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db: yield db
        finally: db.close()
    @staticmethod
    def digest(password, salt):
        return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    def authenticate(self, token):
        with self.db() as db:
            row = db.execute('SELECT users.id,username,nickname,role FROM logins JOIN users ON users.id=logins.user_id WHERE token=? AND expires>? AND active=1', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            return dict(row) if row else None
    def check_limit(self, action, address, username):
        with self.db() as db:
            db.execute('DELETE FROM auth_failures WHERE at<=?', (time.time()-900,))
            total, pair = db.execute('SELECT COUNT(*), COALESCE(SUM(username=?),0) FROM auth_failures WHERE action=? AND address=?', (username,action,address)).fetchone()
        if total >= 100 or pair >= 10:
            raise SessionError(429, '이 접속 주소에서 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.')
    def failure(self, action, address, username):
        with self.db() as db:
            db.execute('INSERT INTO auth_failures VALUES (?,?,?,?)', (action,address,username,time.time()))
    def submit(self, action, data, address):
        username = data.get('username', '')
        password = data.get('password', '')
        if not isinstance(username, str) or not isinstance(password, str):
            raise SessionError(400, '아이디와 비밀번호를 확인해 주세요.')
        username = username.strip().lower()
        if not re.fullmatch(r'[a-z0-9_.-]{3,32}', username) or len(password)>128:
            raise SessionError(400, '아이디는 영문·숫자·밑줄·점·하이픈 3~32자로 입력해 주세요.')
        self.check_limit(action,address,username)
        if action == 'signup':
            nickname = data.get('nickname', '')
            if not isinstance(nickname,str) or not 2<=len(nickname.strip())<=30 or len(password)<10:
                raise SessionError(400, '닉네임은 2~30자, 비밀번호는 10~128자로 입력해 주세요.')
            salt = secrets.token_hex(16)
            encoded = self.digest(password,salt)
            try:
                with self.db() as db:
                    from admin import consume_invite
                    uid=secrets.token_hex(24)
                    consume_invite(db,data.get('inviteCode'),uid)
                    db.execute('INSERT INTO users (id,username,nickname,salt,password) VALUES (?,?,?,?,?)',(uid,username,nickname.strip(),salt,encoded))
            except SessionError:
                self.failure(action,address,username)
                raise
            except sqlite3.IntegrityError:
                self.failure(action,address,username)
                raise SessionError(409, '이미 사용 중인 아이디입니다.')
        with self.db() as db:
            row = db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
        encoded = self.digest(password, row['salt'] if row else '00'*16)
        if not row or not hmac.compare_digest(encoded,row['password']) or not row['active']:
            self.failure(action,address,username)
            raise SessionError(401, '아이디 또는 비밀번호가 올바르지 않습니다.')
        token = secrets.token_hex(32)
        with self.db() as db:
            db.execute('DELETE FROM auth_failures WHERE action=? AND address=? AND username=?',(action,address,username))
            db.execute('DELETE FROM logins WHERE expires<=?',(time.time(),))
            db.execute('INSERT INTO logins VALUES (?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),row['id'],time.time()+604800))
        return token

ACCOUNTS = Accounts(os.getenv('PNP_ACCOUNT_DB', '/state/accounts.sqlite'))
from progress import initialize
initialize(ACCOUNTS)
from admin import initialize as initialize_admin
initialize_admin(ACCOUNTS)

class AccountHTTP:
    def client_ip(self):
        # Only the configured proxy service can supply the overwritten header.
        peer = ipaddress.ip_address(self.client_address[0])
        proxy = os.getenv('PNP_AUTH_PROXY_HOST', '')
        trusted = set()
        if proxy:
            try:
                trusted = {ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(proxy, None, type=socket.SOCK_STREAM)}
            except OSError:
                pass  # Fail closed: ignore headers when the proxy cannot be resolved.
        if peer in trusted:
            try:
                return str(ipaddress.ip_address(self.headers.get('X-Pnp-Client-IP','')))
            except ValueError:
                pass
        return str(peer)
    def login_token(self):
        cookies = SimpleCookie()
        try: cookies.load(self.headers.get('Cookie',''))
        except Exception: return ''
        return cookies['pnp_session'].value if 'pnp_session' in cookies else ''
    def account(self):
        return ACCOUNTS.authenticate(self.login_token())
    def account_cookie(self):
        if hasattr(self,'auth_cookie'):
            secure = '; Secure' if os.getenv('PNP_COOKIE_SECURE','false')=='true' else ''
            self.send_header('Set-Cookie',f'pnp_session={self.auth_cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={604800 if self.auth_cookie else 0}{secure}')
    def account_request(self):
        from session_http import ORIGINS
        import json
        if not self.path.startswith('/api/auth/'):
            return False
        try:
            if self.path == '/api/auth/me' and self.command=='GET':
                self.reply(200, {'user':self.account()}); return True
            action = self.path.removeprefix('/api/auth/')
            if self.command!='POST' or action not in ('signup','login','logout'):
                raise SessionError(404,'Not found')
            if self.headers.get('Origin') not in ORIGINS or self.headers.get('Content-Type','').split(';')[0]!='application/json':
                raise SessionError(403,'Forbidden')
            length = int(self.headers.get('Content-Length','0'))
            if not 0<length<=4096: raise SessionError(400,'Invalid request')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data,dict): raise SessionError(400,'Invalid request')
            if action=='logout':
                with ACCOUNTS.db() as db:
                    db.execute('DELETE FROM logins WHERE token=?',(hashlib.sha256(self.login_token().encode()).hexdigest(),))
                self.auth_cookie=''
            else:
                old = self.login_token()
                self.auth_cookie=ACCOUNTS.submit(action,data,self.client_ip())
                with ACCOUNTS.db() as db:
                    db.execute('DELETE FROM logins WHERE token=?',(hashlib.sha256(old.encode()).hexdigest(),))
            self.reply(200,{'user':ACCOUNTS.authenticate(self.auth_cookie) if self.auth_cookie else None})
        except SessionError as e: self.reply(e.status,{'error':e.message})
        except (ValueError,TypeError): self.reply(400,{'error':'Invalid request'})
        return True
