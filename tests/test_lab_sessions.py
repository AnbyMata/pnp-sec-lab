"""Lease and cleanup invariants; no Docker daemon required."""
import concurrent.futures
import importlib.util
from pathlib import Path
import tempfile
import sys
import json
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / 'hub/manager'))
spec = importlib.util.spec_from_file_location('sessions', Path(__file__).parents[1] / 'hub/manager/sessions.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SessionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 10000
        self.calls = []
        self.labs = module.Sessions(str(Path(self.tmp.name) / 'state.sqlite'), runner=lambda *args: self.calls.append(args), clock=lambda: self.now)

    def tearDown(self):
        self.drain()
        self.tmp.cleanup()

    def drain(self, labs=None):
        labs = labs or self.labs
        for _ in range(500):
            with labs.lifecycle_lock:
                if not labs.jobs: return
            time.sleep(.01)
        self.fail('background jobs did not finish')

    def ready(self, owner='alice'):
        self.labs.start(owner, 'sqli-login')
        for _ in range(200):
            if self.labs.current(owner)['state'] == 'ready':
                return self.labs.current(owner)
            time.sleep(.01)
        self.fail('provisioning did not finish')

    def test_extend_preserves_environment_and_adds_hour(self):
        row = self.ready()
        self.now += 600
        extended = self.labs.extend('alice')
        self.assertEqual(extended['expiresAt'], row['expires'] + 3600)
        self.assertEqual(extended['expiresAt'], extended['maxExpiresAt'])
        with self.assertRaises(module.SessionError) as limit:
            self.labs.extend('alice')
        self.assertEqual(limit.exception.status, 409)
        self.now += 1200
        with self.assertRaises(module.SessionError):
            self.labs.extend('alice')
        self.assertEqual(self.labs.current('alice')['expires'], extended['maxExpiresAt'])
        self.assertEqual(self.labs.current('alice')['id'], row['id'])
        self.assertEqual(self.labs.public(self.labs.current('bob'))['state'], 'idle')
        with self.assertRaises(module.SessionError):
            self.labs.extend('bob')

    def test_db_root_secret_is_private_distinct_and_survives_restart(self):
        sid='a'*48
        secret=self.labs.db_root_secret(sid)
        self.assertRegex(secret,r'^[a-f0-9]{64}$')
        self.assertNotEqual(secret,sid)
        self.assertNotEqual(secret,self.labs.session_secret(sid))
        self.assertNotEqual(secret,self.labs.db_root_secret('b'*48))
        restored=module.Sessions(self.labs.database,runner=lambda *args:None)
        self.assertEqual(secret,restored.db_root_secret(sid))
        env=self.labs.compose_env(sid)
        self.assertEqual(env['PNP_DB_ROOT_PASSWORD'],secret)
        template=json.loads((Path(__file__).parents[1]/'hub/session.compose.yml').read_text(encoding='utf-8'))
        self.assertEqual(template['services']['db']['environment']['MARIADB_ROOT_PASSWORD'],'${PNP_DB_ROOT_PASSWORD:?Set PNP_DB_ROOT_PASSWORD}')
        for name,service in template['services'].items():
            if name!='db': self.assertNotIn('PNP_DB_ROOT_PASSWORD',json.dumps(service.get('environment',{})))

    def test_old_root_password_environments_are_retired(self):
        row=self.ready()
        self.drain()
        with self.labs.connect() as db:
            db.execute('UPDATE sessions SET revision=2 WHERE id=?',(row['id'],))
        self.labs.recover()
        self.labs.sweep(); self.drain()
        self.assertEqual(self.labs.current('alice')['state'],'stopped')
        self.assertIn((row['id'],'down'),self.calls)

    def test_expiry_denies_access_before_cleanup_and_removes_volumes(self):
        row = self.ready()
        self.now = row['expires']
        with self.assertRaises(module.SessionError):
            self.labs.active(sid=row['id'])
        with self.assertRaises(module.SessionError):
            self.labs.extend('alice')
        self.labs.sweep()
        self.drain()
        self.assertIn((row['id'], 'down'), self.calls)
        self.assertEqual(self.labs.current('alice')['state'], 'stopped')
        self.assertNotEqual(self.ready()['id'], row['id'])

    def test_double_start_and_capacity(self):
        self.labs.limit = 1
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: self.labs.start('alice', 'sqli-login'), range(8)))
        row = self.ready()
        self.assertEqual(self.calls.count((row['id'], 'up')), 1)
        with self.assertRaises(module.SessionError) as caught:
            self.labs.start('bob', 'sqli-login')
        self.assertEqual(caught.exception.status, 429)

    def test_cleanup_failure_retries_and_survives_restart(self):
        row = self.ready()
        def fail(*args):
            raise RuntimeError('simulated engine outage')
        self.labs.runner = fail
        self.labs.stop('alice')
        self.labs.sweep()
        self.drain()
        self.assertEqual(self.labs.current('alice')['state'], 'deleting')
        restored = module.Sessions(self.labs.database, runner=lambda *args: self.calls.append(args), clock=lambda: self.now)
        restored.sweep()
        self.drain(restored)
        self.assertEqual(restored.current('alice')['state'], 'stopped')
        self.assertIn((row['id'], 'down'), self.calls)

    def test_stop_during_start_cannot_leave_orphan(self):
        entered, release = threading.Event(), threading.Event()
        def slow(sid, action):
            self.calls.append((sid, action))
            if action == 'up':
                entered.set()
                release.wait(5)
        self.labs.runner = slow
        self.labs.start('alice', 'sqli-login')
        self.assertTrue(entered.wait(2))
        self.labs.stop('alice')
        release.set()
        self.labs.sweep()
        self.drain()
        self.assertEqual(self.labs.current('alice')['state'], 'stopped')
        self.assertEqual([action for _, action in self.calls], ['up', 'down'])



    def test_recipes_only_include_required_services_and_flag(self):
        template = json.loads((Path(__file__).parents[1] / 'hub/session.compose.yml').read_text(encoding='utf-8'))
        expected = {challenge: {'db', 'mongo', 'python', 'gateway'} | ({'shell'} if challenge == 'sqli-login' else set()) for challenge in module.RECIPES}
        for challenge, services in expected.items():
            config = self.labs.compose_config({'challenge': challenge}, template)
            self.assertEqual(set(config['services']), services)
            env = config['services']['python']['environment']
            self.assertEqual(set(env) & set(module.FLAGS.values()), {module.FLAGS[challenge]})
            for service in config['services'].values():
                self.assertTrue(set(service['depends_on']) <= services)
            self.assertEqual(set(config['volumes']), {'db-data', 'mongo-data'})

    def test_slow_creation_does_not_block_other_creation_or_expiry_cleanup(self):
        expired = self.ready('expired')
        self.drain()
        entered, release, cleaned = threading.Event(), threading.Event(), threading.Event()
        def runner(sid, action):
            self.calls.append((sid, action))
            if action == 'up' and not entered.is_set():
                entered.set(); release.wait(5)
            if sid == expired['id'] and action == 'down': cleaned.set()
        self.labs.runner = runner
        try:
            self.labs.start('slow', 'sqli-login')
            self.assertTrue(entered.wait(2))
            with self.labs.connect() as db:
                db.execute('UPDATE sessions SET expires=? WHERE id=?',(self.now,expired['id']))
            self.labs.sweep()
            self.assertTrue(cleaned.wait(2), 'cleanup blocked behind provisioning')
            self.ready('other')
            self.assertEqual(self.labs.current('slow')['state'], 'starting')
        finally:
            release.set(); self.drain()

    def test_slow_cleanup_does_not_block_creations_or_other_cleanup(self):
        slow = self.ready('slow')
        other = self.ready('other')
        self.drain()
        entered, release, cleaned = threading.Event(), threading.Event(), threading.Event()
        def runner(sid, action):
            self.calls.append((sid, action))
            if action == 'down' and sid == slow['id']:
                entered.set(); release.wait(5)
            if action == 'down' and sid == other['id']: cleaned.set()
        self.labs.runner = runner
        try:
            self.labs.stop('slow'); self.assertTrue(entered.wait(2))
            self.labs.stop('other'); self.assertTrue(cleaned.wait(2))
            self.ready('new')
            self.assertEqual(self.labs.current('slow')['state'],'deleting')
        finally:
            release.set(); self.drain()

    def test_worker_limit_and_no_cleanup_overlap_for_same_session(self):
        release = threading.Event()
        count_lock = threading.Lock()
        running = set()
        peak = [0]
        def runner(sid, action):
            with count_lock:
                self.assertNotIn(sid,running)
                running.add(sid); peak[0]=max(peak[0],len(running))
            try:
                if action=='up': release.wait(5)
            finally:
                with count_lock: running.remove(sid)
        self.labs.runner=runner
        self.labs.create_workers=2
        try:
            for i in range(5): self.labs.start(str(i),'sqli-login')
            with self.labs.lifecycle_lock:
                self.assertEqual(sum(a=='up' for a in self.labs.jobs.values()),2)
            self.labs.stop('0'); self.labs.sweep()
            with self.labs.lifecycle_lock:
                self.assertNotIn('down',self.labs.jobs.values())
        finally:
            release.set(); self.drain()
        self.assertLessEqual(peak[0],self.labs.create_workers+self.labs.cleanup_workers)
        self.assertEqual(self.labs.current('0')['state'],'stopped')

    def test_challenge_switch_deletes_before_start_and_cannot_grade_old(self):
        self.labs.limit = 1
        old = self.ready()
        self.labs.start('alice', 'ssrf-oracle')
        for _ in range(200):
            new = self.labs.current('alice')
            if new['state'] == 'ready':
                break
            time.sleep(.01)
        self.assertEqual(new['state'], 'ready')
        self.assertEqual(new['challenge'], 'ssrf-oracle')
        self.assertLess(self.calls.index((old['id'], 'down')), self.calls.index((new['id'], 'up')))
        with self.assertRaises(module.SessionError):
            self.labs.active(sid=old['id'])
        with self.assertRaises(module.SessionError):
            self.labs.extend('alice', 'sqli-login')
        self.labs.extend('alice', 'ssrf-oracle')
        self.assertEqual(set(self.labs.public(new)['targets']), {'python'})

    def test_php_spring_only_run_selected_version_and_db(self):
        template = json.loads((Path(__file__).parents[1] / 'hub/session.compose.yml').read_text(encoding='utf-8'))
        previous = self.ready()
        for target in ('php', 'spring'):
            self.labs.start('alice', 'sqli-login', target)
            for _ in range(200):
                row = self.labs.current('alice')
                if row['state'] == 'ready':
                    break
                time.sleep(.01)
            self.assertEqual(row['target'], target)
            config = self.labs.compose_config(row, template)
            self.assertEqual(set(config['services']), {target, 'db', 'gateway'})
            self.assertEqual(set(self.labs.public(row)['targets']), {target})
            self.assertLess(self.calls.index((previous['id'], 'down')), self.calls.index((row['id'], 'up')))
            with self.assertRaises(module.SessionError):
                self.labs.extend('alice', 'sqli-login', 'python')
            previous = row


if __name__ == '__main__':
    unittest.main()
