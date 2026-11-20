import os
import sys
import tempfile
import unittest
from pathlib import Path

state=tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB']=str(Path(state.name)/'accounts.sqlite')
os.environ['PNP_MANAGED_LABS']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hub'/'manager'))
from accounts import Accounts
from progress import initialize,record,snapshot,leaderboard
from sessions import SessionError

class ProgressTest(unittest.TestCase):
    def test_account_isolation_deduplication_ties_and_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Accounts(str(Path(folder)/'db.sqlite'));initialize(store)
            with store.db() as db:
                for uid in ('a','b','c'):
                    db.execute('INSERT INTO users (id,username,nickname,salt,password) VALUES (?,?,?,?,?)',(uid,uid+'',uid,'salt','hash'))
            record(store,'a','lesson','sql-injection:ep1');record(store,'a','lesson','sql-injection:ep1')
            record(store,'b','lesson','sql-injection:ep2')
            record(store,'b','challenge','sqli-login');record(store,'b','challenge','sqli-login')
            result=leaderboard(store,'b')
            self.assertEqual([r['rank'] for r in result['learning']['top']],[1,1,3])
            self.assertEqual(result['challenges']['me']['count'],1)
            self.assertEqual(result['challenges']['top'][0]['nickname'],'b')
            self.assertEqual(result['lessonTotal'],4)
            self.assertEqual(snapshot(store,'a')['solvedChallenges'],[])
            with self.assertRaises(SessionError):record(store,'a','lesson','sql-injection:ep9')
            with self.assertRaises(SessionError):record(store,'a','challenge','fake')
            record(store,'a','lesson','sql-injection:ep1',False)
            self.assertEqual(snapshot(store,'a')['completedLessons'],[])
            self.assertNotIn('username',result['learning']['top'][0])
