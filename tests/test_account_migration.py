import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest

state=tempfile.TemporaryDirectory()
os.environ['PNP_ACCOUNT_DB']=str(Path(state.name)/'global.sqlite')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hub'/'manager'))
from accounts import Accounts

class MigrationTest(unittest.TestCase):
    def test_email_removed_preserving_ids_passwords_roles_and_progress(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'accounts.sqlite'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE,nickname TEXT,salt TEXT,password TEXT,role TEXT,active INTEGER)')
                db.executemany('INSERT INTO users VALUES (?,?,?,?,?,?,?)', [('1','admin@pnp.com','관리자','salt','hash','admin',1),('2','admin@hufs.ac.kr','다른 회원','salt2','hash2','member',0),('3','test@pnp.com','회원','salt3','hash3','member',1)])
                db.execute('CREATE TABLE logins (token TEXT PRIMARY KEY,user_id TEXT,expires REAL)')
                db.execute('INSERT INTO logins VALUES (?,?,?)',(hashlib.sha256(b'token').hexdigest(),'1',time.time()+3600))
                db.execute('CREATE TABLE progress (user_id TEXT,kind TEXT,item TEXT,updated REAL)')
                db.execute("INSERT INTO progress VALUES ('1','lesson','sql-injection:ep1',0)")
                db.execute('CREATE TABLE email_checks (email TEXT)');db.execute("INSERT INTO email_checks VALUES ('secret@gmail.com')")
                db.execute('CREATE TABLE auth_failures (action TEXT,address TEXT,email TEXT,at REAL)')
            db.close()
            (Path(folder)/'email-secret.key').write_bytes(b'old-secret')
            store=Accounts(str(path))
            with store.db() as db:
                self.assertNotIn('email',{row[1] for row in db.execute('PRAGMA table_info(users)')})
                self.assertEqual([row['username'] for row in db.execute('SELECT * FROM users ORDER BY id')],['admin','admin_1','test'])
                self.assertEqual(db.execute("SELECT role FROM users WHERE id='1'").fetchone()[0],'admin')
                self.assertEqual(db.execute("SELECT password FROM users WHERE id='1'").fetchone()[0],'hash')
                self.assertEqual(db.execute('SELECT COUNT(*) FROM progress').fetchone()[0],1)
                self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name='email_checks'").fetchone())
            self.assertEqual(store.authenticate('token')['username'],'admin')
            self.assertFalse((Path(folder)/'email-secret.key').exists())
            self.assertNotIn(b'@pnp.com',path.read_bytes());self.assertNotIn(b'secret@gmail.com',path.read_bytes())
            store=Accounts(str(path));self.assertEqual(store.authenticate('token')['username'],'admin')
