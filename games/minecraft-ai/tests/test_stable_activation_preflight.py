import importlib.util
from pathlib import Path
import unittest

class StableActivationPreflightTests(unittest.TestCase):
    def test_compiles_and_contains_only_readonly_operations(self):
        p=Path(__file__).resolve().parents[1]/'scripts/alice-stable-activation-preflight.py'
        spec=importlib.util.spec_from_file_location('stable_preflight',p)
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        compile(m.REMOTE,'<readonly>','exec')
        self.assertNotIn('api(',m.REMOTE)
        self.assertNotIn('subprocess',m.REMOTE)
        self.assertNotIn('write_text',m.REMOTE)
        self.assertIn('StrictHostKeyChecking',p.read_text())
        self.assertIn('alice_mint_nonrestart_sync.json',p.read_text())
