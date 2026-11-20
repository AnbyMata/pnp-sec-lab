import http.client
import json
import os
import re
import threading
from urllib.parse import urlsplit

from sessions import SessionError, Sessions
from recipes import RECIPES, TARGETS, services_for

ENABLED = os.getenv('PNP_MANAGED_LABS', 'false').lower() == 'true'
LABS = Sessions(os.getenv('PNP_SESSION_DB', '/state/sessions.sqlite')) if ENABLED else None
ORIGINS = {origin.strip() for origin in os.getenv('PNP_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000').split(',') if origin.strip()}
if ENABLED:
    threading.Thread(target=LABS.worker, daemon=True).start()


class SessionHTTP:
    def owner(self):
        user = self.account()
        if not user:
            raise SessionError(401, '로그인이 필요합니다.')
        return 'account:' + user['id']

    def lab_host_request(self):
        if not ENABLED:
            return False
        host = self.headers.get('Host', '').split(':')[0].lower()
        match = re.fullmatch(r'(python|php|spring)-([a-f0-9]{48})\.' + re.escape(LABS.domain), host)
        if not match:
            return False
        try:
            row = LABS.active(sid=match[2])
            if match[1] != row['target']:
                raise SessionError(404, '이 챌린지에서 실행하지 않는 서버입니다.')
            self.lab_proxy(row, match[1], self.path)
        except SessionError as error:
            self.reply(error.status, {'error': error.message})
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Invalid request'})
        except Exception as error:
            print(error, flush=True)
            self.reply(502, {'error': '실습 환경에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'})
        return True

    def session_request(self):
        if self.lab_host_request(): return True
        if not ENABLED:
            if self.path.startswith('/api/attacker/'):
                self.lab_proxy(None, 'attacker', '/' + self.path[len('/api/attacker/'):], 'attacker', 8001)
                return True
            if self.path == '/api/tools/request':
                self.lab_proxy(None, 'tools-proxy', '/request', 'tools-proxy', 8770)
                return True
            if self.path.startswith('/api/challenges/') or self.path.startswith('/api/lab/'):
                path = '/lab/' + self.path[len('/api/'):]
                if self.path.startswith('/api/lab/'):
                    path = '/lab/' + self.path[len('/api/lab/'):]
                self.lab_proxy(None, 'python', path, 'python', 8000)
                return True
            return False
        try:
            if self.path.startswith('/api/attacker/') or self.path == '/api/tools/request':
                raise SessionError(403, '공용 도구는 개인 실습 환경에서 사용할 수 없습니다.')
            if self.path.startswith('/api/lab-sessions'):
                if self.path != '/api/lab-sessions' and self.path not in ('/api/lab-sessions/start', '/api/lab-sessions/extend', '/api/lab-sessions/stop'):
                    raise SessionError(404, 'Not found')
                if self.command == 'GET' and self.path == '/api/lab-sessions':
                    self.reply(200, LABS.public(LABS.current(self.owner())))
                    return True
                if self.command != 'POST':
                    raise SessionError(405, 'Method not allowed')
                if self.headers.get('Origin') not in ORIGINS or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise SessionError(403, 'Forbidden')
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 1024:
                    raise SessionError(413, 'Too large')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict) or data.get('challengeId') not in RECIPES:
                    raise SessionError(400, '올바른 챌린지 ID가 필요합니다.')
                if data.get('target', 'python') not in TARGETS:
                    raise SessionError(400, '지원하지 않는 실습 버전입니다.')
                owner = self.owner()
                action = self.path.rsplit('/', 1)[-1]
                if action not in ('start', 'extend', 'stop'):
                    raise SessionError(404, 'Not found')
                self.reply(200, getattr(LABS, action)(owner, data['challengeId'], data.get('target', 'python')))
                return True
            if self.path.startswith('/api/challenges/') or self.path.startswith('/api/lab/'):
                if self.command == 'POST' and self.headers.get('Origin') not in ORIGINS:
                    raise SessionError(403, 'Forbidden')
                row = LABS.active(owner=self.owner())
                verify = re.fullmatch(r'/api/challenges/([^/]+)/verify', urlsplit(self.path).path)
                if verify and verify[1] != row['challenge']:
                    raise SessionError(409, '현재 실행 중인 챌린지의 플래그만 제출할 수 있습니다.')
                if row['target'] != 'python':
                    raise SessionError(409, '최종 플래그 채점과 서버 로그는 Python 실습에서 제공합니다.')
                path = '/lab/' + self.path[len('/api/'):]
                if self.path.startswith('/api/lab/'):
                    path = '/lab/' + self.path[len('/api/lab/'):]
                self.lab_proxy(row, 'python', path)
                return True
            if self.path == '/api/shell' and self.command == 'POST':
                if os.getenv('PNP_MODE', 'dev') == 'prod':
                    raise SessionError(403, 'Disabled in prod mode')
                if self.headers.get('Origin') not in ORIGINS or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise SessionError(403, 'Forbidden')
                row = LABS.active(owner=self.owner())
                if 'shell' not in services_for(row['challenge'], row['target']):
                    raise SessionError(403, '이 챌린지에는 터미널이 없습니다.')
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 4096:
                    raise SessionError(413, 'Too large')
                command = json.loads(self.rfile.read(length)).get('command')
                if not isinstance(command, str) or not command.strip() or len(command) > 3000:
                    raise SessionError(400, 'Invalid command')
                targets = {'10001': 'php:80', '10002': 'python:8000', '10003': 'spring:8080'}
                command = re.sub(r'http://(?:localhost|127\.0\.0\.1):(10001|10002|10003)(?![0-9])', lambda m: 'http://' + targets[m[1]], command)
                import subprocess
                result = subprocess.run(['docker', 'compose', '-f', LABS.compose_path(row['id']), '-p', 'pnp-session-' + row['id'], 'exec', '-T', 'shell', 'timeout', '15', 'bash', '-c', command], env=LABS.compose_env(row['id']), text=True, capture_output=True, timeout=20)
                self.reply(200, {'output': (result.stdout + result.stderr)[:50000], 'exit_code': result.returncode})
                return True
        except SessionError as error:
            self.reply(error.status, {'error': error.message})
            return True
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Invalid request'})
            return True
        except Exception as error:
            print(error, flush=True)
            self.reply(502, {'error': '실습 환경에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'})
            return True
        return False

    def lab_proxy(self, row, target, path, upstream=None, port=80):
        if not path.startswith('/') or path.startswith('//') or self.headers.get('Transfer-Encoding'):
            raise SessionError(400, 'Invalid request')
        length = int(self.headers.get('Content-Length', '0'))
        if length < 0 or length > 2 * 1024 * 1024:
            raise SessionError(413, 'Too large')
        body = self.rfile.read(length) if length else None
        skip = {'connection', 'transfer-encoding', 'content-length', 'x-lab-target', 'proxy-connection', 'upgrade', 'keep-alive'}
        headers = {k: v for k, v in self.headers.items() if k.lower() not in skip}
        headers['X-Lab-Target'] = target
        if ENABLED:
            headers['X-Forwarded-Proto'] = LABS.scheme
        portal_api = ENABLED and self.path.startswith('/api/') and not self.headers.get('Host', '').split(':')[0].endswith('.' + LABS.domain)
        if portal_api:
            headers.pop('Cookie', None)
        conn = http.client.HTTPConnection(upstream or 'pnp-gateway-' + row['id'], port, timeout=30)
        try:
            conn.request(self.command, path, body, headers)
            response = conn.getresponse()
            # Bound response memory; never expose an unbounded stream through the control service.
            content = response.read(8 * 1024 * 1024 + 1)
            if len(content) > 8 * 1024 * 1024:
                raise SessionError(502, 'Response too large')
            verify = re.fullmatch(r'/api/challenges/([^/]+)/verify', urlsplit(self.path).path)
            if portal_api and verify and self.command == 'POST' and response.status == 200:
                result = json.loads(content)
                if result.get('correct') is True:
                    from accounts import ACCOUNTS
                    from progress import record
                    user = self.account()
                    if not user: raise SessionError(401, '로그인이 필요합니다.')
                    record(ACCOUNTS, user['id'], 'challenge', verify[1])
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in skip | {'server', 'date'} and not (portal_api and key.lower() == 'set-cookie'):
                    if ENABLED and key.lower() == 'set-cookie' and (LABS.scheme == 'https' or LABS.domain.endswith('.localhost')):
                        # Cross-site embedded labs need partitioned cookies in modern browsers.
                        value = re.sub(r';\s*SameSite=[^;]*', '', value, flags=re.I)
                        if not re.search(r';\s*Secure(?:;|$)', value, re.I):
                            value += '; Secure'
                        if not re.search(r';\s*Partitioned(?:;|$)', value, re.I):
                            value += '; Partitioned'
                        value += '; SameSite=None'
                    self.send_header(key, value)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(content)
        finally:
            conn.close()
