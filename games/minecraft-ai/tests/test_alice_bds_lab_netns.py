"""Non-privileged isolated network namespace: never bind the user's host UDP ports."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "alice-bds-lab-probe.py"
spec = importlib.util.spec_from_file_location("alice_bds_lab_netns_probe", SCRIPT)
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class NetworkNamespaceTests(unittest.TestCase):
    def test_preflight_execs_fixed_binary_with_no_shell_and_no_host_bind(self):
        seen = []
        def run(args, **kwargs):
            seen.append((args, kwargs))
            return SimpleNamespace(returncode=0)
        with patch.object(P.NETNS_UNSHARE.__class__, "is_file", return_value=True), patch.object(
                P.NETNS_UNSHARE.__class__, "is_symlink", return_value=False), patch.object(
                P.os, "access", return_value=True):
            self.assertTrue(P.namespace_preflight(run=run))
        self.assertEqual(seen[0][0], [
            "/usr/bin/unshare", "--user", "--map-root-user", "--net", "--",
            "/usr/bin/true"])
        self.assertEqual(seen[0][1]["timeout"], 8)
        self.assertNotIn("shell", seen[0][1])

    def test_unshare_failure_never_falls_back_to_host(self):
        with patch.object(P.NETNS_UNSHARE.__class__, "is_file", return_value=True), patch.object(
                P.NETNS_UNSHARE.__class__, "is_symlink", return_value=False), patch.object(
                P.os, "access", return_value=True):
            self.assertFalse(P.namespace_preflight(
                run=lambda *a, **k: SimpleNamespace(returncode=1)))
            self.assertFalse(P.namespace_preflight(
                run=lambda *a, **k: (_ for _ in ()).throw(
                    subprocess.TimeoutExpired(cmd="unshare", timeout=8))))

    def test_netns_probe_uses_unshare_and_skips_host_udp_probe(self):
        invoked = []
        class FakeBds:
            def __init__(self, args, **kwargs):
                invoked.append(args)
                self.returncode = None
                kwargs["stdout"].write(
                    ("Server started.\\n" + P.LAB_MARKER + "\\n").replace("\\n","\n").encode())
            def poll(self): return self.returncode
            def communicate(self, input=None, timeout=None):
                self.returncode = 0
            def send_signal(self, kind): pass
            def wait(self, timeout=None): self.returncode = 0
        with tempfile.TemporaryDirectory() as td, patch.object(P,"ports_free",
                side_effect=AssertionError("netns must not bind host")):
            state, flags = P.probe(Path(td), duration=0, popen=FakeBds,
                                   sleep=lambda _:None, network_namespace=True)
        self.assertEqual(state, "lab_module_imports_observed")
        self.assertTrue(flags["serverReadyObserved"])
        self.assertEqual(invoked[0], [
            "/usr/bin/unshare","--user","--map-root-user","--net",
            "--","./bedrock_server"])

    def test_host_probe_keeps_strict_port_gate(self):
        with tempfile.TemporaryDirectory() as td, patch.object(P,"ports_free",return_value=False):
            with self.assertRaisesRegex(ValueError,"lab_udp_ports_busy"):
                P.probe(Path(td),duration=0,popen=Mock())

    def test_netns_denial_precedes_lock_and_any_lab_mutation(self):
        lab=Path("/tmp/fake-alice-netns-test")
        gate=Mock()
        with patch.object(P,"beta_gate",return_value=(gate,lab)), patch.object(
                P,"namespace_preflight",return_value=False), patch.object(
                P,"secure_config",side_effect=AssertionError("lab config changed")), patch.object(
                P,"instrument_lab_script",side_effect=AssertionError("script modified")):
            with self.assertRaisesRegex(ValueError,"lab_netns_unavailable"):
                P.run_action("netns-probe")
        gate.require_lab_stopped.assert_called_once_with()

    def test_netns_check_does_not_start_bds_or_stage_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            lab=Path(tmp);(lab/"server.properties").write_text(
                "server-port=17880\nserver-portv6=17881\n"
                "online-mode=true\nlevel-name=Bedrock level\n")
            gate=Mock()
            with patch.object(P,"beta_gate",return_value=(gate,lab)), patch.object(
                    P,"namespace_preflight",return_value=True), patch.object(
                    P,"probe",side_effect=AssertionError("BDS started")):
                state, flags=P.run_action("netns-check")
            self.assertEqual(state,"ready_for_isolated_lab_probe")
            self.assertTrue(flags["networkNamespacePreflightPassed"])
            self.assertFalse((lab/".alice-lab-probe.lock").exists())

    def test_netns_output_explicitly_marks_mode_and_rejects_success_without_evidence(self):
        r=P.output("netns-probe","blocked",reason="lab_netns_unavailable")
        self.assertTrue(r["networkNamespaceRequested"])
        self.assertFalse(r["networkNamespacePreflightPassed"])
        self.assertFalse(r["verifiedScriptModuleLoaded"])
        self.assertFalse(r["productionWorldModified"])
        h=P.output("netns-check","ready_for_isolated_lab_probe",
                    {"networkNamespacePreflightPassed":True})
        self.assertTrue(h["networkNamespaceRequested"])
        self.assertTrue(h["networkNamespacePreflightPassed"])
        self.assertFalse(h["serverReadyObserved"])

    def test_mac_wrapper_allowlist_remains_strict_and_has_opt_in_action(self):
        entry=(SCRIPT.parent/"alice-mac.sh").read_text()
        wrapper=(SCRIPT.parent/"alice-bds-lab-probe-mac.sh").read_text()
        self.assertIn("witness-lab-netns-check",entry)
        self.assertIn("witness-lab-netns-probe",entry)
        self.assertIn("networkNamespacePreflightPassed",wrapper)
        self.assertIn("lab_netns_unavailable",wrapper)
        self.assertNotIn("sudo -S",wrapper)


if __name__ == "__main__":
    unittest.main()

    def test_loopback_flags_are_read_only_and_report_down_without_mutation(self):
        seen=[]
        def run(args, **kwargs):
            seen.append((args, kwargs))
            return SimpleNamespace(returncode=0, stdout="0x8\\n")
        with patch.object(P.NETNS_CAT.__class__, "is_file", return_value=True), patch.object(
                P.NETNS_CAT.__class__, "is_symlink", return_value=False):
            self.assertEqual(P.namespace_loopback_state(run=run),"down")
        self.assertEqual(seen[0][0],[
            "/usr/bin/unshare","--user","--map-root-user","--net",
            "--","/usr/bin/cat","/sys/class/net/lo/flags"])
        self.assertNotIn("shell",seen[0][1])

    def test_namespace_loopback_status_does_not_claim_crash_cause(self):
        with patch.object(P.NETNS_CAT.__class__, "is_file", return_value=True), patch.object(
                P.NETNS_CAT.__class__, "is_symlink", return_value=False):
            self.assertEqual(P.namespace_loopback_state(
                run=lambda *a, **k:SimpleNamespace(returncode=0,stdout="0x49\\n")),"up")
            self.assertEqual(P.namespace_loopback_state(
                run=lambda *a, **k:SimpleNamespace(returncode=1,stdout="")),"unverified")

    def test_postmortem_read_only_reports_consumed_probe_without_claiming_bds_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            lab=Path(tmp)
            script=lab/"behavior_packs"/"alice-silent-bds-witness"/"scripts"/"main.js"
            script.parent.mkdir(parents=True)
            script.write_text('import {world} from "@minecraft/server";\\n' +
                              'console.warn("'+P.LAB_MARKER+'");\\n')
            for f in (lab/".alice-lab-probe-original-properties",
                      lab/".alice-lab-probe-original-allowlist",
                      script.with_name(".alice-lab-probe-original-main.js"),
                      lab/".alice-lab-probe.lock"):
                f.write_bytes(b"fixture")
            before=[(str(p.relative_to(lab)),p.read_bytes()) for p in lab.rglob("*") if p.is_file()]
            with patch.object(P,"namespace_loopback_state",return_value="down"):
                status,fields=P.lab_probe_postmortem(lab)
            after=[(str(p.relative_to(lab)),p.read_bytes()) for p in lab.rglob("*") if p.is_file()]
            self.assertEqual(status,"lab_probe_one_shot_consumed")
            self.assertEqual(before,after)
            self.assertTrue(fields["labProbeOneShotConsumed"])
            self.assertFalse(fields["originalLaunchStdoutRetained"])
            self.assertFalse(fields["verifiedScriptModuleLoaded"])
            self.assertEqual(fields["isolatedLoopbackState"],"down")

    def test_postmortem_refuses_symlinked_lab_probe_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            lab=Path(tmp);(lab/".alice-lab-probe.lock").symlink_to("/etc/passwd")
            with self.assertRaisesRegex(ValueError,"unsafe_lab_postmortem_file"):
                P.lab_probe_postmortem(lab)

    def test_postmortem_action_never_starts_bds_or_reconfigures_lab(self):
        gate=Mock()
        with tempfile.TemporaryDirectory() as tmp, patch.object(
                P,"beta_gate",return_value=(gate,Path(tmp))), patch.object(
                P,"lab_probe_postmortem",return_value=("lab_probe_one_shot_consumed",{})) as inspector, patch.object(
                P,"probe",side_effect=AssertionError("BDS started")), patch.object(
                P,"secure_config",side_effect=AssertionError("lab modified")), patch.object(
                P,"namespace_preflight",side_effect=AssertionError("unexpected capability probe")):
            state,fields=P.run_action("netns-postmortem")
            self.assertEqual(state,"lab_probe_one_shot_consumed")
            inspector.assert_called_once_with(Path(tmp))
        gate.require_lab_stopped.assert_called_once_with()
