import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('challenge_flags', Path(__file__).parents[1] / 'fastapi-vulnerable/app/challenge_flags.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FlagToggleTest(unittest.TestCase):
    def test_only_selected_fixed_flag_is_available_even_if_all_secrets_are_present(self):
        challenges = {'sqli-login': 'SQLI', 'path-traversal': 'TRAVERSAL', 'ssrf-oracle': 'SSRF', 'auth-recovery': 'AUTH', 'upload-filter': 'UPLOAD', 'nosql-login': 'NOSQL', 'idor-profile': 'IDOR', 'reflected-xss': 'XSS'}
        for active in challenges:
            env = {'PNP_CHALLENGE_ID': active, **{name + '_LAB_FLAG': 'PNP{' + key + '}' for key, name in challenges.items()}}
            with patch.dict(os.environ, env, clear=True):
                for key, name in challenges.items():
                    self.assertEqual(module.flag_for(key, name + '_LAB_FLAG', 'random-fallback'), 'PNP{' + key + '}' if key == active else '')

    def test_missing_active_flag_does_not_create_a_placeholder_or_accept_empty_answer(self):
        with patch.dict(os.environ, {'PNP_CHALLENGE_ID': 'sqli-login'}, clear=True):
            self.assertEqual(module.flag_for('sqli-login', 'SQLI_LAB_FLAG', 'placeholder'), '')

    def test_legacy_shared_lab_keeps_flags(self):
        with patch.dict(os.environ, {'SQLI_LAB_FLAG': 'PNP{fixed}'}, clear=True):
            self.assertEqual(module.flag_for('sqli-login', 'SQLI_LAB_FLAG'), 'PNP{fixed}')
            self.assertEqual(module.flag_for('other', 'UNSET', 'legacy-default'), 'legacy-default')
