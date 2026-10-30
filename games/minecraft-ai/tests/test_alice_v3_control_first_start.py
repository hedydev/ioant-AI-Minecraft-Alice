"""Offline-only v3 control startup tests: no real BDS/netns/sudo or world edit."""
import importlib.util
import json
from pathlib import Path
import sys,tempfile,unittest
from types import SimpleNamespace
from unittest.mock import patch

S=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(S))
spec=importlib.util.spec_from_file_location('v3_start',S/'alice-v3-control-first-start.py')
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)

class V3ControlStartTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup)
        self.home=Path(t.name)
        self.lab=self.home/'minecraft-bedrock-alice-lab-v3'
        self.lab.mkdir()
        (self.lab/'.alice-sandbox.json').write_text(json.dumps({
            'kind':'alice-disposable-bedrock-lab','labGeneration':'fresh-isolated-v3',
            'port':17880,'world':'Bedrock level'}))
        b=self.lab/'bedrock_server'
        b.write_bytes(b'fake bds')
        b.chmod(0o755)
        source=P.load('lab-probe')
        keys={k:v for k,v in source.SAFE_PROPS.items() if k!='content-log-file-enabled'}
        (self.lab/'server.properties').write_text(
            '\n'.join(k+'='+v for k,v in keys.items())+'\n')
        (self.lab/'allowlist.json').write_text('[]\n')
        (self.lab/'worlds'/'Bedrock level').mkdir(parents=True)
        self.original=P.LAB
        P.LAB=self.lab
        self.addCleanup(setattr,P,'LAB',self.original)
    def test_exact_fresh_control_without_pack_is_eligible(self):
        # Stub only the namespace preflight; actual parser and marker are used.
        original_load=P.load
        def patched(name):
            m=original_load(name)
            if name=='lab-probe':
                m.namespace_preflight=lambda:True
                m.namespace_v2_loopback_preflight=lambda:True
            return m
        with patch.object(P,'load',side_effect=patched):
            P.lab_guard()
            (self.lab/P.INTENT).write_text('already used')
            with self.assertRaisesRegex(ValueError,'control_already_consumed'):
                P.lab_guard()
    def test_non_v3_or_behavior_pack_refused(self):
        marker=self.lab/'.alice-sandbox.json'
        marker.write_text('{"labGeneration":"fresh-isolated-v2","kind":"alice-disposable-bedrock-lab","port":17880,"world":"Bedrock level"}')
        with self.assertRaisesRegex(ValueError,'v3_marker_invalid'):
            P.lab_guard()
    def test_log_categories_bounded_and_not_raw(self):
        self.assertEqual(P.classify_error(b'error while loading shared libraries: private.so'),
                         'elf_loader_error')
        self.assertEqual(P.classify_error(b'Fatal error: hello'), 'explicit_fatal')
        self.assertEqual(P.classify_error(b'Running as root is not supported'), 'running_as_root')
        self.assertEqual(P.classify_error(b'home/user/secret text'), 'unknown')
    def test_nonzero_bds_exit_is_recorded_without_log_text(self):
        calls=[]
        class FakeBDS:
            def __init__(self,args,**kwargs):
                calls.append(args)
                kwargs['stdout'].write(b'error while loading shared libraries: libFoo.so\n')
                kwargs['stdout'].flush()
                self.returncode=127
            def poll(self):return self.returncode
        fake=SimpleNamespace(NETNS_UNSHARE=Path('/usr/bin/unshare'),
                             NETNS_PYTHON=Path('/usr/bin/python3'),
                             NETNS_V2_LOOPBACK_SETUP='child lo only')
        result=P.run_isolated(fake,popen=FakeBDS,
               monotonic=lambda:100.0,sleep=lambda n:None)
        self.assertEqual(result['state'],'completed')
        self.assertEqual(result['exitKind'],'nonzero')
        self.assertEqual(result['failureCategory'],'elf_loader_error')
        self.assertTrue(result['exitedBeforeStop'])
        self.assertFalse(result['readyObserved'])
        self.assertNotIn('libFoo',str(result))
        self.assertEqual(calls[0][-1],'./bedrock_server')
        self.assertEqual(calls[0][:5],
                         ['/usr/bin/unshare','--user','--map-root-user','--net','--'])
    def test_privileged_auth_only_readlink_gate_and_never_sudo_bds(self):
        source=(S/'alice-v3-control-first-start.py').read_text()
        self.assertIn("['sudo','-v']",source)
        self.assertIn("['sudo','-k']",source)
        self.assertIn('gate.require_lab_stopped()',source)
        self.assertNotIn('sudo python',source)
        self.assertNotIn('shell=True',source)
        self.assertIn('os.O_EXCL',source)

if __name__=='__main__':unittest.main()
