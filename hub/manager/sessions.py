"""Time-limited, browser-owned Docker labs. No user-supplied Docker arguments."""
import hashlib
import copy
from pathlib import Path
from recipes import RECIPES, FLAGS, TARGETS, services_for
import hmac
from contextlib import contextmanager
import json
import os
import re
import secrets
import sqlite3
import subprocess
import threading
import time

HOUR = 3600
SITE_REVISION = 3
TOKEN = re.compile(r"^[a-f0-9]{48}$")


class SessionError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Sessions:
    def __init__(self, database, runner=None, clock=time.time):
        self.database, self.clock = database, clock
        self.lock = threading.RLock()
        self.lifecycle_lock = threading.RLock()
        self.jobs = {}  # sid -> action; never run up and down for the same session together.
        self.create_workers = max(1, int(os.getenv('PNP_CREATE_WORKERS', '2')))
        self.cleanup_workers = max(1, int(os.getenv('PNP_CLEANUP_WORKERS', '2')))
        self.runner = runner or self.docker
        self.limit = int(os.getenv('PNP_MAX_SESSIONS', '5'))
        self.domain = os.getenv('PNP_LAB_DOMAIN', 'labs.localhost').lower()
        self.scheme = os.getenv('PNP_LAB_SCHEME', 'http')
        self.port = os.getenv('PNP_LAB_PORT', '8000')
        if not re.fullmatch(r'[a-z0-9.-]+', self.domain) or self.scheme not in ('http', 'https'):
            raise ValueError('Invalid lab domain/scheme')
        os.makedirs(os.path.dirname(os.path.abspath(database)), exist_ok=True)
        key_path = os.path.join(os.path.dirname(os.path.abspath(database)), 'secret.key')
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as key_file:
                key_file.write(secrets.token_bytes(32))
        except FileExistsError:
            pass
        with open(key_path, 'rb') as key_file:
            self.secret = key_file.read()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, expires REAL NOT NULL, created REAL NOT NULL)')
            if 'challenge' not in {row[1] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute("ALTER TABLE sessions ADD COLUMN challenge TEXT NOT NULL DEFAULT ''")
            if 'target' not in {row[1] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute("ALTER TABLE sessions ADD COLUMN target TEXT NOT NULL DEFAULT 'python'")
            if 'revision' not in {row[1] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute("ALTER TABLE sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
            if 'max_expires' not in {row[1] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute("ALTER TABLE sessions ADD COLUMN max_expires REAL NOT NULL DEFAULT 0")
                db.execute("UPDATE sessions SET max_expires=created+?, expires=MIN(expires, created+?)", (2 * HOUR, 2 * HOUR))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def owner_key(owner):
        return hashlib.sha256(owner.encode()).hexdigest()

    def session_secret(self, sid):
        return hmac.new(self.secret, sid.encode(), hashlib.sha256).hexdigest()

    def db_root_secret(self, sid):
        return hmac.new(self.secret, ('db-root:' + sid).encode(), hashlib.sha256).hexdigest()

    def compose_env(self, sid):
        return dict(os.environ, PNP_SESSION_ID=sid, PNP_SESSION_SECRET=self.session_secret(sid), PNP_DB_ROOT_PASSWORD=self.db_root_secret(sid))

    def compose_path(self, sid):
        assert TOKEN.fullmatch(sid)
        return str(Path(self.database).parent / 'compose' / (sid + '.json'))

    def compose_config(self, row, template):
        recipe = RECIPES[row['challenge']]
        config = copy.deepcopy(template)
        target = row.get('target', 'python')
        selected = set(services_for(row['challenge'], target))
        if os.getenv('PNP_MODE', 'dev') == 'prod':
            selected.discard('shell')
        config['services'] = {k: v for k, v in config['services'].items() if k in selected}
        volumes = set()
        for service in config['services'].values():
            service.pop('build', None)
            dependencies = service.get('depends_on', {})
            service['depends_on'] = {k: v for k, v in dependencies.items() if k in selected} if isinstance(dependencies, dict) else [k for k in dependencies if k in selected]
            volumes.update(v.split(':')[0] for v in service.get('volumes', []))
        config['volumes'] = {k: v for k, v in config.get('volumes', {}).items() if k in volumes}
        if target == 'python':
            env = config['services']['python']['environment']
            for flag in FLAGS.values():
                if flag != FLAGS[row['challenge']]:
                    env.pop(flag, None)
            env.update(PNP_CHALLENGE_ID=row['challenge'])
        return config

    def docker(self, sid, action):
        assert TOKEN.fullmatch(sid)
        env = self.compose_env(sid)
        config_path = self.compose_path(sid)
        if action == 'up':
            with self.connect() as db:
                row = dict(db.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone())
            template = json.loads(Path('/workspace/hub/session.compose.yml').read_text(encoding='utf-8'))
            Path(config_path).parent.mkdir(exist_ok=True)
            Path(config_path).write_text(json.dumps(self.compose_config(row, template)), encoding='utf-8')
        if not Path(config_path).exists():
            config_path = '/workspace/hub/session.compose.yml'  # Cleanup pre-migration environments.
        command = ['docker', 'compose', '-f', config_path, '-p', 'pnp-session-' + sid]
        args = ['up', '-d', '--no-build', '--wait', '--wait-timeout', '180'] if action == 'up' else ['down', '--volumes', '--remove-orphans', '--timeout', '10']
        result = subprocess.run(command + args, env=env, capture_output=True, text=True, timeout=240)
        if result.returncode:
            if action == 'up':
                diagnostics = subprocess.run(command + ['logs', '--no-color', '--tail', '25', 'db'], env=env, capture_output=True, text=True, timeout=15)
                print('Lab database startup diagnostics: ' + diagnostics.stdout[-5000:], flush=True)
            raise RuntimeError('Lab orchestration failed: ' + result.stderr[-1500:])
        if action == 'down':
            Path(self.compose_path(sid)).unlink(missing_ok=True)

    def current(self, owner):
        with self.lock, self.connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE owner=? ORDER BY created DESC, rowid DESC LIMIT 1", (self.owner_key(owner),)).fetchone()
        return dict(row) if row else None

    def public(self, row):
        now = self.clock()
        if not row:
            return {'state': 'idle', 'serverTime': now}
        state = 'expired' if row['expires'] <= now and row['state'] in ('ready', 'starting') else row['state']
        result = {'state': state, 'expiresAt': row['expires'], 'maxExpiresAt': row['max_expires'], 'serverTime': now, 'challengeId': row['challenge'], 'target': row['target']}
        if state == 'ready':
            port = ':' + self.port if self.port else ''
            result['targets'] = {name: f"{self.scheme}://{name}-{row['id']}.{self.domain}{port}" for name in (row['target'],)}
        return result

    def start(self, owner, challenge, target='python'):
        if challenge not in RECIPES or target not in TARGETS:
            raise SessionError(400, '지원하지 않는 챌린지입니다.')
        with self.lock, self.connect() as db:
            row = self.current(owner)
            if row and row['revision'] == SITE_REVISION and row['challenge'] == challenge and row['target'] == target and row['state'] in ('queued', 'starting', 'ready') and row['expires'] > self.clock():
                return self.public(row)
            owner_key = self.owner_key(owner)
            count = db.execute("SELECT COUNT(DISTINCT owner) FROM sessions WHERE state != 'stopped'").fetchone()[0]
            occupied = db.execute("SELECT 1 FROM sessions WHERE owner=? AND state != 'stopped'", (owner_key,)).fetchone()
            if not occupied and count >= self.limit:
                raise SessionError(429, '실습 서버가 가득 찼습니다. 잠시 후 다시 시도해 주세요.')
            db.execute("UPDATE sessions SET state='stopped' WHERE owner=? AND state='queued'", (owner_key,))
            db.execute("UPDATE sessions SET state='deleting' WHERE owner=? AND state IN ('ready','starting')", (owner_key,))
            now, sid = self.clock(), secrets.token_hex(24)
            db.execute('INSERT INTO sessions (id,owner,state,expires,created,challenge,target,revision,max_expires) VALUES (?,?,?,?,?,?,?,?,?)', (sid, owner_key, 'queued', now + HOUR, now, challenge, target, SITE_REVISION, now + 2 * HOUR))
        self.sweep()
        return self.public(self.current(owner))

    def provision(self, sid):
        with self.lifecycle_lock:
            if sid not in self.jobs and sum(v == 'up' for v in self.jobs.values()) < self.create_workers:
                self._dispatch(sid, 'up')

    def _dispatch(self, sid, action):
        self.jobs[sid] = action
        threading.Thread(target=self._job, args=(sid, action), daemon=True).start()

    def _job(self, sid, action):
        succeeded = False
        try:
            if action == 'up':
                self._provision(sid)
            else:
                self.runner(sid, 'down')
                with self.lock, self.connect() as db:
                    db.execute("UPDATE sessions SET state='stopped' WHERE id=? AND state IN ('deleting','failed')", (sid,))
            succeeded = True
        except Exception as error:
            print(error, flush=True)  # Failed cleanup stays pending for the next sweep.
        finally:
            with self.lifecycle_lock:
                self.jobs.pop(sid, None)
                if succeeded:
                    self._sweep()  # Clean canceled creations and start newly unblocked work promptly.

    def _provision(self, sid):
        try:
            with self.connect() as db:
                row = db.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
                if not row or row['state'] != 'starting' or row['expires'] <= self.clock():
                    return
            self.runner(sid, 'up')
            with self.lock, self.connect() as db:
                db.execute("UPDATE sessions SET state='ready' WHERE id=? AND state='starting' AND expires>?", (sid, self.clock()))
        except Exception as error:
            print(error, flush=True)
            with self.lock, self.connect() as db:
                db.execute("UPDATE sessions SET state='failed' WHERE id=? AND state='starting'", (sid,))

    def extend(self, owner, challenge=None, target=None):
        with self.lock, self.connect() as db:
            row = self.current(owner)
            if challenge and row and row['challenge'] != challenge:
                raise SessionError(409, '다른 챌린지의 실습 환경입니다.')
            if target and row and row['target'] != target:
                raise SessionError(409, '다른 버전의 실습 환경입니다.')
            if not row or row['state'] != 'ready' or row['expires'] <= self.clock():
                raise SessionError(409, '실행 중인 실습만 연장할 수 있습니다.')
            if row['expires'] >= row['max_expires']:
                raise SessionError(409, '실습 시간은 최대 2시간까지 연장할 수 있습니다.')
            expires = min(row['expires'] + HOUR, row['max_expires'])
            db.execute('UPDATE sessions SET expires=? WHERE id=?', (expires, row['id']))
        return self.public(self.current(owner))

    def stop(self, owner, challenge=None, target=None):
        with self.lock, self.connect() as db:
            row = self.current(owner)
            if challenge and row and row['challenge'] != challenge:
                raise SessionError(409, '다른 챌린지의 실습 환경입니다.')
            if target and row and row['target'] != target:
                raise SessionError(409, '다른 버전의 실습 환경입니다.')
            if row and row['state'] != 'stopped':
                db.execute("UPDATE sessions SET state='deleting' WHERE id=?", (row['id'],))
        self.sweep()
        return self.public(self.current(owner))

    def active(self, owner=None, sid=None):
        with self.lock, self.connect() as db:
            row = db.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone() if sid else self.current(owner)
        if not row or row['state'] != 'ready' or row['expires'] <= self.clock():
            raise SessionError(410, '실습이 종료되었습니다. 챌린지에서 실습을 다시 시작해 주세요.')
        return dict(row)

    def sweep(self):
        with self.lifecycle_lock:
            self._sweep()

    def _sweep(self):
        with self.lock, self.connect() as db:
            db.execute("UPDATE sessions SET state='deleting' WHERE expires<=? AND state IN ('starting','ready')", (self.clock(),))
            # A restart during startup must never leave an untracked allocation running.
            rows = db.execute("SELECT id FROM sessions WHERE state IN ('deleting','failed')").fetchall()
        for row in rows:
            if sum(v == 'down' for v in self.jobs.values()) >= self.cleanup_workers:
                break
            if row['id'] not in self.jobs:
                self._dispatch(row['id'], 'down')

        with self.lock, self.connect() as db:
            queued = db.execute("SELECT * FROM sessions WHERE state='queued' ORDER BY created, rowid").fetchall()
        for row in queued:
            if sum(v == 'up' for v in self.jobs.values()) >= self.create_workers:
                break
            with self.lock, self.connect() as db:
                blocked = db.execute("SELECT 1 FROM sessions WHERE owner=? AND id!=? AND state!='stopped'", (row['owner'], row['id'])).fetchone()
                if blocked:
                    continue
                now = self.clock()
                changed = db.execute("UPDATE sessions SET state='starting', expires=?, max_expires=? WHERE id=? AND state='queued'", (now + HOUR, now + 2 * HOUR, row['id'])).rowcount
            if changed:
                self._dispatch(row['id'], 'up')

    def recover(self):
        with self.lock, self.connect() as db:
            db.execute("UPDATE sessions SET state='deleting' WHERE state='starting' OR (state!='stopped' AND (challenge='' OR revision!=?))", (SITE_REVISION,))

    def worker(self):
        self.recover()
        while True:
            self.sweep()
            time.sleep(10)
