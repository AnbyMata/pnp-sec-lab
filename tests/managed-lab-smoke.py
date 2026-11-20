"""Run INSIDE a dedicated test manager container; creates then destroys one test lab.

Requires portal nginx at nginx:80, Origin http://localhost:18766 and its own /state.
Never run against a production manager: expiry is accelerated by editing the test DB.
"""
import http.client
import json
import os
import sqlite3
import subprocess
import time
from urllib.parse import urlsplit

cookie = ''


def request(path, method='GET', data=None, owner=True, host='localhost:18766', origin='http://localhost:18766', lab_cookie=None):
    global cookie
    conn = http.client.HTTPConnection('nginx', 80, timeout=40)
    headers = {'Host': host, 'Origin': origin, 'Content-Type': 'application/json'}
    if owner:
        headers['Cookie'] = cookie
    if lab_cookie:
        headers['Cookie'] = lab_cookie
    conn.request(method, path, json.dumps(data) if data is not None else None, headers)
    response = conn.getresponse()
    if response.getheader('Set-Cookie') and host == 'localhost:18766':
        cookie = response.getheader('Set-Cookie').split(';')[0]
    body = response.read()
    status = response.status
    conn.close()
    return status, body


def lab_post(path, host, body, content_type):
    conn = http.client.HTTPConnection('nginx', 80, timeout=40)
    conn.request('POST', path, body, {'Host': host, 'Content-Type': content_type})
    response = conn.getresponse()
    result = (response.status, response.read(), (response.getheader('Set-Cookie') or '').split(';')[0])
    conn.close()
    return result


def state():
    code, body = request('/api/lab-sessions')
    assert code == 200, (code, body)
    return json.loads(body)


import sys
sys.path.insert(0, '/')
from recipes import RECIPES, FLAGS


def wait_ready():
    for attempt in range(120):
        lease = state()
        if lease['state'] == 'ready':
            return lease
        assert lease['state'] in ('queued', 'starting'), lease
        if attempt % 10 == 0:
            print('Waiting for isolated challenge readiness...', flush=True)
        time.sleep(2)
    raise AssertionError('startup timed out')


def project_services(sid):
    project = 'com.docker.compose.project=pnp-session-' + sid
    return set(subprocess.check_output(['docker', 'ps', '-a', '--filter', 'label=' + project, '--format', '{{.Label "com.docker.compose.service"}}'], text=True).split())


assert json.loads(request('/api/config')[1])['managedLabs']
assert request('/api/lab-sessions/start', 'POST', {'challengeId': 'unknown'})[0] == 400
assert request('/api/lab-sessions/start', 'POST', {'challengeId': 'sqli-login'}, origin='https://evil.example')[0] == 403
previous = None
try:
    for challenge in os.getenv('PNP_TEST_CHALLENGES', 'sqli-login,ssrf-oracle,nosql-login,auth-recovery,upload-filter,path-traversal').split(','):
        payload = {'challengeId': challenge}
        assert request('/api/lab-sessions/start', 'POST', payload)[0] == 200
        lease = wait_ready()
        assert lease['challengeId'] == challenge
        assert set(lease['targets']) == {'python'}
        assert 3300 < lease['expiresAt'] - lease['serverTime'] <= 3600
        with sqlite3.connect('/state/sessions.sqlite') as db:
            sid = db.execute("SELECT id FROM sessions WHERE state='ready'").fetchone()[0]
        expected = set(RECIPES[challenge]['services'])
        assert project_services(sid) == expected, (challenge, project_services(sid), expected)
        if previous:
            assert not project_services(previous[0]), 'previous allocation still running'
            assert request('/health', host=previous[1], owner=False)[0] == 410
        host = urlsplit(lease['targets']['python']).netloc
        assert request(RECIPES[challenge]['entry'], host=host, owner=False)[0] == 200
        code, css = request('/static/style.css', host=host, owner=False)
        assert code == 200 and b'.site-header' in css
        code, body = request('/api/challenges/' + challenge + '/verify', 'POST', {'flag': os.environ[FLAGS[challenge]]})
        assert code == 200 and json.loads(body)['correct'], (challenge, code)
        other = 'ssrf-oracle' if challenge == 'sqli-login' else 'sqli-login'
        assert request('/api/challenges/' + other + '/verify', 'POST', {'flag': 'x'})[0] == 409
        assert request('/oracle' if challenge == 'sqli-login' else '/login', host=host, owner=False)[0] == 200
        assert request('/api/challenges/' + challenge + '/verify', 'POST', {'flag': 'x'}, owner=False)[0] == 410
        for page in ('/', '/store', '/board', '/oracle', '/login', '/lab/auth-recovery', '/lab/nosql-login', '/lab/upload-filter', '/lab/dom', '/lab/rainbow', '/lab/callbacks'):
            assert request(page, host=host, owner=False)[0] == 200, (challenge, page)
        assert request('/lab/challenges/' + other + '/verify', 'POST', {'flag': ''}, host=host, owner=False)[0] == 404
        code, content = request('/lab/file?name=../private/note.txt', host=host, owner=False)
        assert code == 200 and (os.environ['TRAVERSAL_LAB_FLAG'].encode() in content) == (challenge == 'path-traversal')
        code, content = request('/oracle?url=http://127.0.0.1:8000/lab/internal-note', host=host, owner=False)
        assert code == 200 and (os.environ['SSRF_LAB_FLAG'].encode() in content) == (challenge == 'ssrf-oracle')
        code, content = request('/lab/xss-preview', host=host, owner=False)
        assert code == 200 and b'review-note:' not in content and b'lab_flag_not_configured' not in content
        code, content = request('/lab/nosql-login', 'POST', {'username': 'admin', 'password': {'$ne': None}}, host=host, owner=False)
        assert code == 200 and json.loads(content)['authenticated']
        assert ('flag' in json.loads(content)) == (challenge == 'nosql-login')
        from urllib.parse import urlencode
        code, content, lab_cookie = lab_post('/login', host, urlencode({'user_id': "admin'-- ", 'password': 'x'}), 'application/x-www-form-urlencoded')
        assert code == 303 and lab_cookie
        code, content = request('/admin', host=host, owner=False, lab_cookie=lab_cookie)
        assert code == 200 and (os.environ['SQLI_LAB_FLAG'].encode() in content) == (challenge == 'sqli-login')
        code, content, _ = lab_post('/lab/auth-recovery', host, urlencode({'username': 'admin', 'token': 'reset-1'}), 'application/x-www-form-urlencoded')
        assert code == 200 and (os.environ['AUTH_LAB_FLAG'].encode() in content) == (challenge == 'auth-recovery')
        upload_body = b'--pnp-test\r\nContent-Disposition: form-data; name="attachment"; filename="probe.html"\r\nContent-Type: image/png\r\n\r\n<html>probe</html>\r\n--pnp-test--\r\n'
        code, content, _ = lab_post('/lab/upload-filter', host, upload_body, 'multipart/form-data; boundary=pnp-test')
        assert code == 200 and (os.environ['UPLOAD_LAB_FLAG'].encode() in content) == (challenge == 'upload-filter')
        # Only the fixed flag for this challenge is injected into the application.
        names = subprocess.check_output(['docker', 'ps', '--filter', 'label=com.docker.compose.project=pnp-session-' + sid, '--filter', 'label=com.docker.compose.service=python', '--format', '{{.ID}}'], text=True).strip()
        env = json.loads(subprocess.check_output(['docker', 'inspect', '--format', '{{json .Config.Env}}', names], text=True))
        flag_names = {v.split('=', 1)[0] for v in env} & set(FLAGS.values())
        assert flag_names == {FLAGS[challenge]}
        if challenge == 'ssrf-oracle':
            code, result = request('/oracle?url=http://127.0.0.1:8000/lab/internal-note', host=host, owner=False)
            assert code == 200 and os.environ['SSRF_LAB_FLAG'].encode() in result
        if challenge == 'path-traversal':
            code, result = request('/lab/file?name=../private/note.txt', host=host, owner=False)
            assert code == 200 and os.environ['TRAVERSAL_LAB_FLAG'].encode() in result
        if challenge == 'sqli-login':
            code, result = request('/api/shell', 'POST', {'command': 'curl -s http://localhost:10002/health'})
            assert code == 200 and 'ok' in json.loads(result)['output']
        else:
            assert request('/api/shell', 'POST', {'command': 'true'})[0] == 403
        code, body = request('/api/lab-sessions/extend', 'POST', payload)
        assert code == 200 and json.loads(body)['expiresAt'] == lease['expiresAt'] + 3600
        assert request('/api/lab-sessions/start', 'POST', payload)[0] == 200
        assert state()['targets'] == lease['targets'], 'same challenge did not reuse allocation'
        previous = (sid, host)
        print(f'PASS {challenge}: {len(expected)} containers, common site, only selected fixed flag, grade isolation, reuse, +1h', flush=True)
    with sqlite3.connect('/state/sessions.sqlite') as db:
        db.execute("UPDATE sessions SET expires=? WHERE state='ready'", (time.time() - 1,))
    assert request('/health', host=host, owner=False)[0] == 410
    assert request('/api/lab-sessions/extend', 'POST', payload)[0] == 409
    for _ in range(30):
        if state()['state'] == 'stopped':
            break
        time.sleep(2)
    else:
        raise AssertionError('cleanup timed out')
    assert not project_services(sid)
    project = 'com.docker.compose.project=pnp-session-' + sid
    assert not subprocess.check_output(['docker', 'volume', 'ls', '-q', '--filter', 'label=' + project]).strip()
    print('PASS: automatic expiry, no remaining containers or volumes', flush=True)
finally:
    current = state()
    if current.get('challengeId'):
        request('/api/lab-sessions/stop', 'POST', {'challengeId': current['challengeId']})
