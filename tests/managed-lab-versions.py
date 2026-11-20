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


def request(path, method='GET', data=None, owner=True, host='localhost:18766', origin='http://localhost:18766'):
    global cookie
    conn = http.client.HTTPConnection('nginx', 80, timeout=40)
    headers = {'Host': host, 'Origin': origin, 'Content-Type': 'application/json'}
    if owner:
        headers['Cookie'] = cookie
    conn.request(method, path, json.dumps(data) if data is not None else None, headers)
    response = conn.getresponse()
    if response.getheader('Set-Cookie') and host == 'localhost:18766':
        cookie = response.getheader('Set-Cookie').split(';')[0]
    body = response.read()
    status = response.status
    conn.close()
    return status, body


def state():
    code, body = request('/api/lab-sessions')
    assert code == 200, (code, body)
    return json.loads(body)


previous = None
payload = None
try:
    for target, entry, css in [('php', '/member/member_login.php', '/shared/style.css'), ('spring', '/login', '/style.css')]:
        payload = {'challengeId': 'sqli-login', 'target': target}
        assert request('/api/lab-sessions/start', 'POST', payload)[0] == 200
        for attempt in range(120):
            lease = state()
            if lease['state'] == 'ready':
                break
            assert lease['state'] in ('queued', 'starting'), lease
            if attempt % 10 == 0: print('Waiting for ' + target, flush=True)
            time.sleep(2)
        else: raise AssertionError('startup timed out')
        assert lease['target'] == target and set(lease['targets']) == {target}
        host = urlsplit(lease['targets'][target]).netloc
        assert request(entry, host=host, owner=False)[0] == 200
        code, style = request(css, host=host, owner=False)
        assert code == 200 and b'.site-header' in style
        with sqlite3.connect('/state/sessions.sqlite') as db:
            sid = db.execute("SELECT id FROM sessions WHERE state='ready'").fetchone()[0]
        project = 'com.docker.compose.project=pnp-session-' + sid
        services = set(subprocess.check_output(['docker','ps','--filter','label=' + project,'--format','{{.Label "com.docker.compose.service"}}'],text=True).split())
        assert services == {target, 'db', 'gateway'}, services
        if previous: assert request('/login', host=previous, owner=False)[0] == 410
        assert request('/api/lab-sessions/start', 'POST', payload)[0] == 200
        assert state()['expiresAt'] == lease['expiresAt']
        code, response = request('/api/lab-sessions/extend','POST',payload)
        assert code == 200 and json.loads(response)['expiresAt'] == lease['expiresAt'] + 3600
        assert request('/api/lab-sessions/stop','POST',{'challengeId':'sqli-login','target':'python'})[0] == 409
        if target == 'php':
            result = subprocess.check_output(['docker','compose','-f','/state/compose/'+sid+'.json','-p','pnp-session-'+sid,'exec','-T','php','php','-r','require "/var/www/html/dbconn.php"; if(!mysql_query("SELECT COUNT(*) FROM member")) exit(1); echo "db-ok";'],env=dict(os.environ,PNP_SESSION_ID=sid))
            assert b'db-ok' in result
        print('PASS '+target+': selected server + DB + gateway, CSS, reuse, +1h, target ownership',flush=True)
        previous = host
finally:
    if payload: request('/api/lab-sessions/stop','POST',payload)
