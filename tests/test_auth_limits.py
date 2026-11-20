import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

state=tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB']=str(Path(state.name)/'global.sqlite')
os.environ['PNP_MANAGED_LABS']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hub'/'manager'))
from accounts import Accounts, AccountHTTP
from sessions import SessionError

class RateTests(unittest.TestCase):
    def test_failures_are_isolated_and_success_does_not_consume_limit(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(Accounts,'digest',side_effect=lambda password,salt:password), patch('admin.consume_invite'):
            store=Accounts(str(Path(folder)/'accounts.sqlite'))
            data={'username':'victim','nickname':'회원','password':'long-password'}
            store.submit('signup',data,'192.0.2.1')
            for _ in range(25): store.submit('login',data,'192.0.2.1')
            for i in range(25): store.submit('signup',{**data,'username':f'user{i}'},'192.0.2.1')
            with store.db() as db: self.assertEqual(db.execute('SELECT COUNT(*) FROM auth_failures').fetchone()[0],0)
            for _ in range(10):
                with self.assertRaises(SessionError) as error: store.submit('login',{**data,'password':'wrong'},'192.0.2.2')
                self.assertEqual(error.exception.status,401)
            with self.assertRaises(SessionError) as error: store.submit('login',data,'192.0.2.2')
            self.assertEqual(error.exception.status,429)
            self.assertTrue(store.submit('login',data,'192.0.2.3'))
            self.assertTrue(store.submit('login',{**data,'username':'user0'},'192.0.2.2'))
            self.assertTrue(store.submit('signup',{**data,'username':'new'},'192.0.2.2'))
            with store.db() as db: db.execute('UPDATE auth_failures SET at=0')
            self.assertTrue(store.submit('login',data,'192.0.2.2'))
            store.failure('login','192.0.2.4',data['username'])
            store.submit('login',data,'192.0.2.4')
            with store.db() as db: self.assertEqual(db.execute('SELECT COUNT(*) FROM auth_failures WHERE address=?',('192.0.2.4',)).fetchone()[0],0)

    def test_address_wide_limit(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Accounts(str(Path(folder)/'accounts.sqlite'))
            for i in range(100): store.failure('login','192.0.2.1',f'user{i}')
            with self.assertRaises(SessionError): store.check_limit('login','192.0.2.1','other')
            store.check_limit('login','192.0.2.2','other')
            store.check_limit('signup','192.0.2.1','other')

    def test_only_trusted_proxy_can_supply_address(self):
        handler=object.__new__(AccountHTTP)
        handler.client_address=('172.20.0.2',1234)
        handler.headers={'X-Pnp-Client-IP':'192.0.2.10','X-Forwarded-For':'192.0.2.99'}
        resolved=[(2,1,6,'',('172.20.0.2',0))]
        with patch.dict(os.environ,{'PNP_AUTH_PROXY_HOST':'nginx'}), patch('accounts.socket.getaddrinfo',return_value=resolved):
            self.assertEqual(handler.client_ip(),'192.0.2.10')
            handler.client_address=('172.20.0.3',1234)
            self.assertEqual(handler.client_ip(),'172.20.0.3')
            handler.client_address=('172.20.0.2',1234)
            handler.headers['X-Pnp-Client-IP']='bad, 192.0.2.10'
            self.assertEqual(handler.client_ip(),'172.20.0.2')
        with patch.dict(os.environ,{'PNP_AUTH_PROXY_HOST':'nginx'}), patch('accounts.socket.getaddrinfo',side_effect=OSError()):
            self.assertEqual(handler.client_ip(),'172.20.0.2')
