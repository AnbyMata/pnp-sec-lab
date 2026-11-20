import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

state = tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB'] = str(Path(state.name) / 'accounts.sqlite')
os.environ['PNP_MANAGED_LABS'] = 'false'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hub' / 'manager'))
from server import Handler, ThreadingHTTPServer
from accounts import ACCOUNTS
from sessions import SessionError

class AccountTest(unittest.TestCase):
    def test_account_lifecycle(self):
        server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        def request(path, data=None, cookie='', origin='http://localhost:8000'):
            conn = http.client.HTTPConnection('127.0.0.1',server.server_port)
            headers={'Cookie':cookie,'Origin':origin,'Content-Type':'application/json'}
            conn.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,headers)
            response=conn.getresponse(); body=json.loads(response.read()); token=response.getheader('Set-Cookie','').split(';')[0]; status=response.status; conn.close()
            return status,body,token
        try:
            data={'username':'member','nickname':'회원','password':'long-password-123','role':'admin'}
            self.assertEqual(request('/api/auth/me')[1],{'user':None})
            self.assertEqual(request('/api/auth/signup',data,origin='https://evil.example')[0],403)
            self.assertEqual(request('/api/auth/signup',data)[0],400)
            self.assertEqual(request('/api/auth/email-request',{'username':data['username']})[0],404)
            from admin import invites
            with ACCOUNTS.db() as db:
                db.execute("INSERT INTO users (id,username,nickname,salt,password,role) VALUES ('issuer','issuer','운영자','salt','hash','admin')")
            data['inviteCode']=invites(ACCOUNTS,'issuer',{'action':'issue'})['code']
            status,body,cookie=request('/api/auth/signup',data)
            self.assertEqual(status,200); uid=body['user']['id']
            self.assertNotIn('password',body['user'])
            self.assertEqual(body['user']['role'],'member')
            self.assertEqual(request('/api/admin/users',cookie=cookie)[0],403)
            self.assertEqual(request('/api/auth/signup',data)[0],400)
            self.assertEqual(request('/api/auth/login',{**data,'password':'wrong'})[0],401)
            self.assertEqual(request('/api/auth/me',cookie=cookie)[1]['user']['id'],uid)
            self.assertEqual(request('/api/dashboard')[0],401)
            self.assertEqual(request('/api/progress',{'kind':'challenge','item':'sqli-login','complete':True},cookie=cookie)[0],400)
            self.assertEqual(request('/api/progress',{'kind':'lesson','item':'sql-injection:ep1','complete':True},cookie=cookie)[0],200)
            self.assertEqual(request('/api/progress',cookie=cookie)[1]['completedLessons'],['sql-injection:ep1'])
            self.assertEqual(request('/api/dashboard',cookie=cookie)[1]['learning']['me']['count'],1)
            _,_,second=request('/api/auth/login',data)
            self.assertEqual(request('/api/auth/me',cookie=second)[1]['user']['id'],uid)
            self.assertEqual(request('/api/auth/logout',{},cookie=second)[0],200)
            self.assertIsNone(request('/api/auth/me',cookie=second)[1]['user'])
            handler=object.__new__(Handler); handler.headers={'Cookie':cookie}
            self.assertEqual(handler.owner(),'account:'+uid)
            handler.headers={}
            with self.assertRaises(SessionError): handler.owner()
            with ACCOUNTS.db() as db:
                row=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                self.assertNotEqual(row['password'],data['password'])
        finally:
            server.shutdown(); server.server_close()

if __name__=='__main__': unittest.main()
