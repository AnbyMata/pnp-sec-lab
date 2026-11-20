"""Account progress and leaderboards. Only published lessons count."""
import json
import time
from sessions import SessionError
from recipes import RECIPES

LESSONS = {f'sql-injection:ep{i}' for i in range(1, 5)}

def initialize(store):
    with store.db() as db:
        db.execute('CREATE TABLE IF NOT EXISTS progress (user_id TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(user_id,kind,item))')

def record(store, uid, kind, item, complete=True):
    allowed = LESSONS if kind in ('lesson','started') else RECIPES if kind=='challenge' else {}
    if item not in allowed: raise SessionError(400,'현재 공개된 학습 항목이 아닙니다.')
    with store.db() as db:
        if complete:
            db.execute('INSERT OR IGNORE INTO progress VALUES (?,?,?,?)',(uid,kind,item,time.time()))
        else:
            db.execute('DELETE FROM progress WHERE user_id=? AND kind=? AND item=?',(uid,kind,item))

def snapshot(store, uid):
    with store.db() as db:
        rows=db.execute('SELECT kind,item FROM progress WHERE user_id=? ORDER BY updated,item',(uid,)).fetchall()
    return {key:[r['item'] for r in rows if r['kind']==kind] for key,kind in [('completedLessons','lesson'),('startedLessons','started'),('solvedChallenges','challenge')]}

def leaderboard(store, uid):
    with store.db() as db:
        users=db.execute('SELECT id,nickname FROM users WHERE active=1 ORDER BY id').fetchall()
        rows=db.execute('SELECT user_id,kind,item FROM progress').fetchall()
    counts={u['id']:{'lesson':0,'challenge':0} for u in users}
    for r in rows:
        if r['user_id'] in counts and ((r['kind']=='lesson' and r['item'] in LESSONS) or (r['kind']=='challenge' and r['item'] in RECIPES)):
            counts[r['user_id']][r['kind']]+=1
    def ranked(kind):
        ordered=sorted(users,key=lambda u:(-counts[u['id']][kind],u['nickname'],u['id']))
        results=[]; last=None; rank=0
        for i,u in enumerate(ordered):
            count=counts[u['id']][kind]
            if count!=last: rank=i+1; last=count
            results.append({'rank':rank,'nickname':u['nickname'],'count':count,'isMe':u['id']==uid})
        return {'top':results[:20],'me':next((r for r in results if r['isMe']),None)}
    return {'lessonTotal':len(LESSONS),'challengeTotal':len(RECIPES),'learners':len(users),'learning':ranked('lesson'),'challenges':ranked('challenge')}

class ProgressHTTP:
    def progress_request(self):
        if self.path not in ('/api/progress','/api/dashboard'): return False
        from accounts import ACCOUNTS
        from session_http import ORIGINS
        try:
            user=self.account()
            if not user: raise SessionError(401,'로그인이 필요합니다.')
            if self.command=='GET':
                self.reply(200,leaderboard(ACCOUNTS,user['id']) if self.path=='/api/dashboard' else snapshot(ACCOUNTS,user['id']))
            elif self.path=='/api/progress' and self.command=='POST':
                if self.headers.get('Origin') not in ORIGINS or self.headers.get('Content-Type','').split(';')[0]!='application/json': raise SessionError(403,'Forbidden')
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1024: raise SessionError(400,'Invalid request')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict) or not isinstance(data.get('item'),str) or data.get('kind') not in ('lesson','started') or type(data.get('complete')) is not bool:
                    raise SessionError(400,'Invalid request')
                record(ACCOUNTS,user['id'],data['kind'],data['item'],data['complete'])
                self.reply(200,snapshot(ACCOUNTS,user['id']))
            else: raise SessionError(405,'Method not allowed')
        except SessionError as e: self.reply(e.status,{'error':e.message})
        except (ValueError,TypeError): self.reply(400,{'error':'Invalid request'})
        return True
