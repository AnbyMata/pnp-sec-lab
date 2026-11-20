import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

state=tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB']=str(Path(state.name)/'global.sqlite')
os.environ['PNP_MANAGED_LABS']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hub'/'manager'))
from accounts import Accounts
from admin import initialize, members, change, AdminHTTP, invites
from progress import initialize as initialize_progress, record
from sessions import SessionError

class AdminTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Accounts(str(Path(self.temp.name)/'accounts.sqlite'))
        initialize(self.store);initialize_progress(self.store)
        with self.store.db() as db:
            for uid,role in [('admin','admin'),('member','member'),('other','admin')]:
                db.execute('INSERT INTO users (id,username,nickname,salt,password,role) VALUES (?,?,?,?,?,?)',(uid,uid+'',uid,'salt','hash',role))
            db.execute('INSERT INTO logins VALUES (?,?,?)',(hashlib.sha256(b'token').hexdigest(),'member',time.time()+3600))
    def tearDown(self):self.temp.cleanup()
    def test_admin_can_see_all_progress_but_not_passwords(self):
        record(self.store,'member','lesson','sql-injection:ep1')
        record(self.store,'member','challenge','sqli-login')
        data=members(self.store,'admin');row=next(u for u in data['users'] if u['id']=='member')
        self.assertEqual(row['completedLessons'],['sql-injection:ep1']);self.assertEqual(row['solvedChallenges'],['sqli-login'])
        self.assertNotIn('password',row);self.assertNotIn('salt',row)
        with self.assertRaises(SessionError):members(self.store,'member')
    def test_invite_required_one_use_expiry_revocation_and_hash_storage(self):
        data={'username':'new','nickname':'신규','password':'long-password'}
        with self.assertRaises(SessionError):self.store.submit('signup',data,'192.0.2.1')
        with self.assertRaises(SessionError):invites(self.store,'member',{'action':'issue'})
        issued=invites(self.store,'admin',{'action':'issue','days':1})
        self.assertNotIn(issued['code'],str(invites(self.store,'admin')))
        with self.store.db() as db:self.assertNotEqual(db.execute('SELECT digest FROM signup_invites WHERE id=?',(issued['id'],)).fetchone()[0],issued['code'])
        self.assertTrue(self.store.submit('signup',{**data,'inviteCode':issued['code']},'192.0.2.1'))
        with self.assertRaises(SessionError):self.store.submit('signup',{**data,'username':'next','inviteCode':issued['code']},'192.0.2.1')
        issued=invites(self.store,'admin',{'action':'issue'})
        invites(self.store,'admin',{'action':'revoke','id':issued['id']})
        with self.assertRaises(SessionError):self.store.submit('signup',{**data,'inviteCode':issued['code']},'192.0.2.1')
        issued=invites(self.store,'admin',{'action':'issue'})
        with self.store.db() as db:db.execute('UPDATE signup_invites SET expires=0 WHERE id=?',(issued['id'],))
        with self.assertRaises(SessionError):self.store.submit('signup',{**data,'inviteCode':issued['code']},'192.0.2.1')
    def test_invite_atomic_signup_and_failure_rollback(self):
        from concurrent.futures import ThreadPoolExecutor
        issued=invites(self.store,'admin',{'action':'issue'})
        data={'username':'member','nickname':'신규','password':'long-password','inviteCode':issued['code']}
        with self.assertRaises(SessionError):self.store.submit('signup',data,'192.0.2.1')
        def attempt(i):
            try:self.store.submit('signup',{**data,'username':f'new{i}'},'192.0.2.1');return True
            except SessionError:return False
        with ThreadPoolExecutor(max_workers=2) as pool:self.assertEqual(sum(pool.map(attempt,[1,2])),1)
    def test_suspend_restore_promote_and_delete(self):
        self.assertIsNotNone(self.store.authenticate('token'))
        self.assertEqual(change(self.store,'admin',{'userId':'member','action':'active','value':False}),'member')
        self.assertIsNone(self.store.authenticate('token'))
        change(self.store,'admin',{'userId':'member','action':'active','value':True})
        self.assertIsNone(self.store.authenticate('token'))
        change(self.store,'admin',{'userId':'member','action':'role','value':'admin'})
        self.assertEqual(len(members(self.store,'member')['users']),3)
        record(self.store,'member','lesson','sql-injection:ep1')
        change(self.store,'admin',{'userId':'member','action':'delete'})
        with self.store.db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users WHERE id='member'").fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM progress WHERE user_id='member'").fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM admin_events').fetchone()[0],4)
    def test_regular_member_cannot_escalate_and_self_changes_are_rejected(self):
        with self.assertRaises(SessionError):change(self.store,'member',{'userId':'other','action':'role','value':'member'})
        for action,value in [('active',False),('role','member'),('delete',None)]:
            with self.assertRaises(SessionError):change(self.store,'admin',{'userId':'admin','action':action,'value':value})
        with self.assertRaises(SessionError):change(self.store,'admin',{'userId':'member','action':'active','value':'false'})
        change(self.store,'admin',{'userId':'other','action':'role','value':'member'})
        with self.assertRaises(SessionError):members(self.store,'other')
    def test_api_enforces_permission_origin_and_stops_lab(self):
        def handler(user,origin='http://localhost:8000'):
            h=object.__new__(AdminHTTP);h.account=Mock(return_value=user);h.reply=Mock();h.command='POST';h.path='/api/admin/users'
            body=json.dumps({'userId':'member','action':'active','value':False}).encode();h.rfile=io.BytesIO(body)
            h.headers={'Origin':origin,'Content-Type':'application/json','Content-Length':str(len(body))};return h
        import accounts,session_http
        labs=Mock()
        with patch.object(accounts,'ACCOUNTS',self.store),patch.object(session_http,'ENABLED',True),patch.object(session_http,'LABS',labs):
            for user,origin,expected in [(None,'http://localhost:8000',401),({'id':'member','role':'member'},'http://localhost:8000',403),({'id':'admin','role':'admin'},'https://evil.example',403)]:
                h=handler(user,origin);h.admin_request();self.assertEqual(h.reply.call_args.args[0],expected)
            labs.stop.assert_not_called()
            h=handler({'id':'admin','role':'admin'});h.admin_request();self.assertEqual(h.reply.call_args.args[0],200)
            labs.stop.assert_called_once_with('account:member')
