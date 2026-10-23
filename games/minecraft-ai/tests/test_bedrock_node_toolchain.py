import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts'/'setup-node24-bedrock.sh'
PACKAGE=ROOT/'bedrock-native'/'package.json'

class BedrockNodeToolchainTests(unittest.TestCase):
    def test_engine_matches_bedrock_protocol_node24(self):
        data=json.loads(PACKAGE.read_text())
        self.assertEqual(data['engines']['node'],'>=24')

    @unittest.skipUnless(sys.platform.startswith('linux'),'installer targets Linux Mint')
    def test_dry_run_is_offline_and_does_not_write_home(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/'fresh-home'
            result=subprocess.run(['bash',str(SCRIPT),'--dry-run'],
                env=dict(os.environ,HOME=str(home)),capture_output=True,text=True,timeout=8)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('Node.js 24',result.stdout)
            self.assertFalse(home.exists())

    @unittest.skipUnless(sys.platform.startswith('linux'),'installer targets Linux Mint')
    def test_rejects_unknown_mode_before_network(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/'fresh-home'
            result=subprocess.run(['bash',str(SCRIPT),'--replace-system-node'],
                env=dict(os.environ,HOME=str(home)),capture_output=True,text=True,timeout=8)
            self.assertEqual(result.returncode,2)
            self.assertFalse(home.exists())

    @unittest.skipUnless(sys.platform.startswith('linux'),'installer targets Linux Mint')
    def test_reuses_existing_private_node24_without_network(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/'home'
            node=home/'.local/share/alice-bedrock/node24/current/bin/node'
            node.parent.mkdir(parents=True)
            node.write_text('#!/bin/sh\necho v24.13.0\n')
            node.chmod(0o700)
            result=subprocess.run(['bash',str(SCRIPT),'--install'],
                env=dict(os.environ,HOME=str(home),PATH='/usr/bin:/bin'),
                capture_output=True,text=True,timeout=8)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('already installed',result.stdout)