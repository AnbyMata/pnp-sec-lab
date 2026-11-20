"""Server-authorized account management and operator-only admin bootstrap."""
import json
import time
import secrets
import hashlib
from sessions import SessionError
from progress import LESSONS
from recipes import RECIPES

def initialize(store):
    with store.db() as db:
        db.execute('CREATE TABLE IF NOT EXISTS admin_events (actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, at REAL NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS signup_invites (id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, created REAL NOT NULL, expires REAL NOT NULL, issuer TEXT NOT NULL, used_by TEXT, revoked INTEGER NOT NULL DEFAULT 0)')

def consume_invite(db, code, uid):
    if not isinstance(code,str) or not 20<=len(code)<=100: raise SessionError(400,'현장에서 받은 가입 코드를 입력해 주세요.')
    changed=db.execute('UPDATE signup_invites SET used_by=? WHERE digest=? AND used_by IS NULL AND revoked=0 AND expires>?',(uid,hashlib.sha256(code.strip().encode()).hexdigest(),time.time())).rowcount
    if not changed: raise SessionError(400,'가입 코드가 유효하지 않거나 이미 사용되었습니다.')

def invites(store, actor, data=None):
    with store.db() as db:
        db.execute('BEGIN IMMEDIATE');require_admin(db,actor)
        if data is None:
            return {'invites':[dict(row) for row in db.execute('SELECT id,created,expires,issuer,used_by,revoked FROM signup_invites ORDER BY created DESC LIMIT 200')]}
        if data.get('action')=='issue':
            days=data.get('days',7)
            if type(days) is not int or not 1<=days<=30: raise SessionError(400,'유효기간은 1~30일로 지정해 주세요.')
            code=secrets.token_urlsafe(18);iid=secrets.token_hex(12);now=time.time()
            db.execute('INSERT INTO signup_invites (id,digest,created,expires,issuer) VALUES (?,?,?,?,?)',(iid,hashlib.sha256(code.encode()).hexdigest(),now,now+days*86400,actor))
            db.execute('INSERT INTO admin_events VALUES (?,?,?,?)',(actor,iid,'invite-issue',now))
            return {'code':code,'id':iid,'expires':now+days*86400}
        if data.get('action')=='revoke' and isinstance(data.get('id'),str):
            if not db.execute('UPDATE signup_invites SET revoked=1 WHERE id=? AND used_by IS NULL',(data['id'],)).rowcount: raise SessionError(409,'폐기할 수 없는 코드입니다.')
            db.execute('INSERT INTO admin_events VALUES (?,?,?,?)',(actor,data['id'],'invite-revoke',time.time()))
            return {'ok':True}
        raise SessionError(400,'Invalid request')

def require_admin(db, uid):
    row=db.execute('SELECT role,active FROM users WHERE id=?',(uid,)).fetchone()
    if not row or row['role']!='admin' or not row['active']: raise SessionError(403,'관리자 권한이 필요합니다.')

def members(store, actor):
    with store.db() as db:
        require_admin(db,actor)
        users=[dict(row) for row in db.execute('SELECT id,username,nickname,role,active FROM users ORDER BY nickname,id')]
        rows=db.execute('SELECT user_id,kind,item FROM progress ORDER BY updated,item').fetchall()
    records={u['id']:{'completedLessons':[],'startedLessons':[],'solvedChallenges':[]} for u in users}
    for row in rows:
        key={'lesson':'completedLessons','started':'startedLessons','challenge':'solvedChallenges'}.get(row['kind'])
        if row['user_id'] in records and key and row['item'] in (RECIPES if row['kind']=='challenge' else LESSONS): records[row['user_id']][key].append(row['item'])
    return {'lessonTotal':len(LESSONS),'challengeTotal':len(RECIPES),'users':[{**u,**records[u['id']]} for u in users]}

def change(store, actor, data):
    uid=data.get('userId'); action=data.get('action')
    if not isinstance(uid,str) or action not in ('role','active','delete'): raise SessionError(400,'Invalid request')
    with store.db() as db:
        db.execute('BEGIN IMMEDIATE'); require_admin(db,actor)
        if uid==actor: raise SessionError(409,'본인 계정의 권한·상태 변경 및 삭제는 할 수 없습니다.')
        row=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        if not row: raise SessionError(404,'계정을 찾을 수 없습니다.')
        if action=='role':
            if data.get('value') not in ('admin','member'): raise SessionError(400,'Invalid role')
            db.execute('UPDATE users SET role=? WHERE id=?',(data['value'],uid))
        elif action=='active':
            if type(data.get('value')) is not bool: raise SessionError(400,'Invalid state')
            db.execute('UPDATE users SET active=? WHERE id=?',(int(data['value']),uid))
        else:
            db.execute('DELETE FROM progress WHERE user_id=?',(uid,))
            db.execute('DELETE FROM users WHERE id=?',(uid,))
        db.execute('DELETE FROM logins WHERE user_id=?',(uid,))
        db.execute('INSERT INTO admin_events VALUES (?,?,?,?)',(actor,uid,action+':'+str(data.get('value','')),time.time()))
    return uid if action=='delete' or (action=='active' and data['value'] is False) else None

class AdminHTTP:
    def admin_request(self):
        if not self.path.startswith('/api/admin/'): return False
        from accounts import ACCOUNTS
        from session_http import ORIGINS, LABS, ENABLED
        try:
            user=self.account()
            if not user: raise SessionError(401,'로그인이 필요합니다.')
            if user['role']!='admin': raise SessionError(403,'관리자 권한이 필요합니다.')
            if self.command=='GET' and self.path=='/api/admin/users':
                self.reply(200,members(ACCOUNTS,user['id']))
            elif self.command=='GET' and self.path=='/api/admin/invites':
                self.reply(200,invites(ACCOUNTS,user['id']))
            elif self.command=='POST' and self.path in ('/api/admin/users','/api/admin/invites'):
                if self.headers.get('Origin') not in ORIGINS or self.headers.get('Content-Type','').split(';')[0]!='application/json': raise SessionError(403,'Forbidden')
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=2048: raise SessionError(400,'Invalid request')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise SessionError(400,'Invalid request')
                if self.path=='/api/admin/invites':
                    self.reply(200,invites(ACCOUNTS,user['id'],data));return True
                terminate=change(ACCOUNTS,user['id'],data)
                if terminate and ENABLED: LABS.stop('account:'+terminate)
                self.reply(200,{'ok':True})
            else: raise SessionError(405,'Method not allowed')
        except SessionError as e: self.reply(e.status,{'error':e.message})
        except (ValueError,TypeError): self.reply(400,{'error':'Invalid request'})
        return True

if __name__=='__main__':
    import argparse
    from accounts import ACCOUNTS
    parser=argparse.ArgumentParser(description='Promote an existing account to administrator')
    parser.add_argument('username'); args=parser.parse_args()
    with ACCOUNTS.db() as db:
        row=db.execute('SELECT id FROM users WHERE username=?',(args.username.strip().lower(),)).fetchone()
        if not row: parser.error('Account does not exist. Create the account first.')
        db.execute("UPDATE users SET role='admin',active=1 WHERE id=?",(row['id'],))
        db.execute('INSERT INTO admin_events VALUES (?,?,?,?)',('operator',row['id'],'promote',time.time()))
    print('Administrator assigned. Sign in again to refresh the menu.')
