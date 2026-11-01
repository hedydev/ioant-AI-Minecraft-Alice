"""Offline regression for localhost-only Alice Mac->Mint Ollama SSH bridge."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock
from tempfile import TemporaryDirectory
import plistlib

SOURCE=Path(__file__).resolve().parents[1]/"scripts"/"alice-ollama-ssh-bridge.py"
spec=importlib.util.spec_from_file_location("alice_ollama_ssh_bridge",SOURCE)
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class OllamaBridgeTests(TestCase):
    def test_tunnel_only_exposes_both_ends_loopback(self):
        bridge.selftest()
        self.assertEqual(bridge.ARGV[bridge.ARGV.index("-R")+1],
                         "127.0.0.1:11435:127.0.0.1:11435")
        self.assertIn("ExitOnForwardFailure=yes",bridge.ARGV)
        self.assertEqual(bridge.definition()["ProgramArguments"],bridge.ARGV)
        self.assertTrue(bridge.definition()["KeepAlive"])
        self.assertNotIn("0.0.0.0",str(bridge.definition()))
    def test_failed_bootstrap_rolls_back_only_own_agent(self):
        with TemporaryDirectory() as td:
            root=Path(td)
            agent_dir=root/"Library"/"LaunchAgents"
            agent_dir.mkdir(parents=True)
            plist=agent_dir/f"{bridge.LABEL}.plist"
            with mock.patch.object(bridge,"HOME",root),mock.patch.object(bridge,"PLIST",plist),\
                mock.patch.object(bridge,"local_check",return_value=True),\
                mock.patch.object(bridge,"remote_check",return_value=False),\
                mock.patch.object(bridge,"launchctl",return_value=False),\
                mock.patch.object(bridge.sys,"platform","darwin"):
                r=bridge.install()
            self.assertEqual(r["state"],"blocked")
            self.assertTrue(r["rolledBackOnFailure"])
            self.assertFalse(plist.exists())
            self.assertFalse(r["bdsRestarted"])
            self.assertFalse(r["modelInferenceInvoked"])
    def test_existing_foreign_agent_not_overwritten(self):
        with TemporaryDirectory() as td:
            root=Path(td);agent_dir=root/"Library"/"LaunchAgents"
            agent_dir.mkdir(parents=True)
            plist=agent_dir/f"{bridge.LABEL}.plist"
            plist.write_bytes(plistlib.dumps({"Label":"foreign"}))
            previous=plist.read_bytes()
            with mock.patch.object(bridge,"HOME",root),mock.patch.object(bridge,"PLIST",plist),\
                mock.patch.object(bridge,"local_check",return_value=True),\
                mock.patch.object(bridge.sys,"platform","darwin"):
                r=bridge.install()
            self.assertEqual(r["state"],"blocked")
            self.assertEqual(plist.read_bytes(),previous)
            self.assertFalse(r["rolledBackOnFailure"])
