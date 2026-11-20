import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

state=tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB']=str(Path(state.name)/'accounts.sqlite')
os.environ['PNP_MANAGED_LABS']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hub'/'manager'))
import server
import session_http
from sessions import SessionError

class RoutingTest(unittest.TestCase):
    def handler(self,host,path,method):
        handler=object.__new__(server.Handler)
        handler.headers={'Host':host}
        handler.path=path;handler.command=method
        handler.reply=Mock();handler.lab_proxy=Mock()
        return handler

    def test_lab_api_paths_bypass_portal_handlers_for_all_methods(self):
        labs=Mock(domain='labs.test'); labs.active.return_value={'id':'a'*48,'target':'python'}
        paths=['/api/auth/me','/api/auth/login','/api/progress','/api/dashboard','/api/admin/users','/api/config','/api/lab-sessions/start','/api/challenges/sqli-login/verify?x=1']
        with patch.object(session_http,'ENABLED',True), patch.object(session_http,'LABS',labs):
            for method in ('GET','POST','HEAD','PUT','DELETE','PATCH','OPTIONS'):
                for path in paths:
                    handler=self.handler('python-'+'a'*48+'.labs.test:8000',path,method)
                    handler.account_request=Mock(side_effect=AssertionError('portal auth intercepted lab'))
                    handler.progress_request=Mock(side_effect=AssertionError('portal progress intercepted lab'))
                    getattr(handler,'do_'+method)()
                    handler.lab_proxy.assert_called_once_with(labs.active.return_value,'python',path)
                    handler.reply.assert_not_called()

    def test_expired_and_wrong_target_do_not_fall_back_to_portal(self):
        labs=Mock(domain='labs.test')
        with patch.object(session_http,'ENABLED',True),patch.object(session_http,'LABS',labs):
            handler=self.handler('python-'+'a'*48+'.labs.test','/api/auth/me','GET')
            handler.account_request=Mock(side_effect=AssertionError('fallback'))
            labs.active.side_effect=SessionError(410,'expired')
            handler.do_GET();self.assertEqual(handler.reply.call_args.args[0],410)
            labs.active.side_effect=None;labs.active.return_value={'target':'php'}
            handler.do_GET();self.assertEqual(handler.reply.call_args.args[0],404)
            handler.lab_proxy.assert_not_called()

    def test_portal_api_still_uses_portal_handler(self):
        labs=Mock(domain='labs.test')
        with patch.object(session_http,'ENABLED',True),patch.object(session_http,'LABS',labs):
            handler=self.handler('portal.test','/api/auth/me','GET')
            handler.progress_request=Mock(return_value=False);handler.account_request=Mock(return_value=True)
            handler.do_GET();handler.account_request.assert_called_once();handler.lab_proxy.assert_not_called()

    def test_legacy_commands_use_configured_origins(self):
        payloads={'/api/service':{'service':'python','action':'start'},'/api/shell':{'command':'echo ok'},'/api/sql':{'database':'WebTest','sql':'SELECT 1'}}
        with patch.object(server,'ENABLED',False),patch.object(server,'PNP_MODE','dev'),patch.object(server,'ORIGINS',{'https://portal.example.com'}),patch.object(server,'run',return_value=(True,'ok')),patch.object(server.subprocess,'run',return_value=Mock(stdout='ok',stderr='',returncode=0)):
            for path,data in payloads.items():
                for origin,expected in [('https://portal.example.com',200),('http://localhost:8000',403),('https://evil.example',403)]:
                    handler=self.handler('portal.example.com',path,'POST')
                    handler.lab_host_request=Mock(return_value=False);handler.session_request=Mock(return_value=False)
                    handler.progress_request=Mock(return_value=False);handler.account_request=Mock(return_value=False)
                    body=json.dumps(data).encode();handler.rfile=io.BytesIO(body)
                    handler.headers.update({'Origin':origin,'Content-Type':'application/json','Content-Length':str(len(body))})
                    handler.do_POST();self.assertEqual(handler.reply.call_args.args[0],expected)
