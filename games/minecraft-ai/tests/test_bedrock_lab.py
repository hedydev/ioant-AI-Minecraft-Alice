import importlib.util
import json
from pathlib import Path
import hashlib
import tarfile
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
MOD=ROOT/'scripts'/'prepare-bedrock-alice-lab.py'
spec=importlib.util.spec_from_file_location('alice_lab',MOD)
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class SandboxPreparationTests(unittest.TestCase):
    def test_creates_new_copy_without_mutating_source_or_other_worlds(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            source=home/'minecraft-bedrock';source.mkdir()
            (source/'bedrock_server').write_bytes(b'BDS binary')
            (source/'server.properties').write_text('server-name=Live\nserver-port=17879\nonline-mode=true\nlevel-name=Bedrock level\n')
            (source/'worlds'/'Bedrock level').mkdir(parents=True)
            (source/'worlds'/'Bedrock level'/'level.dat').write_bytes(b'ORIGINAL LIVE WORLD')
            (source/'worlds'/'other').mkdir()
            (source/'worlds'/'other'/'level.dat').write_bytes(b'OTHER WORLD')
            backup=home/'backup';backup.mkdir()
            archive=backup/'backup.tar.gz'
            import io
            content=b'VERIFIED OFFLINE WORLD'
            with tarfile.open(archive,'w:gz') as tf:
                entry=tarfile.TarInfo('worlds/Bedrock level/level.dat');entry.size=len(content)
                tf.addfile(entry,io.BytesIO(content))
            manifest=backup/'backup.json'
            manifest.write_text(json.dumps({'archive':archive.name,'files':{'worlds/Bedrock level/level.dat':hashlib.sha256(content).hexdigest()}}))
            sha='f'*64
            result=lab.prepare(source,manifest,home/'minecraft-bedrock-alice-lab',run_verify=lambda m,s:{'worlds':['worlds/Bedrock level'],'sha256':sha})
            clone=home/'minecraft-bedrock-alice-lab'
            self.assertEqual(result['port'],17880)
            self.assertEqual((clone/'worlds'/'Bedrock level'/'level.dat').read_bytes(),content)
            self.assertEqual((source/'worlds'/'Bedrock level'/'level.dat').read_bytes(),b'ORIGINAL LIVE WORLD')
            self.assertTrue((source/'worlds'/'other'/'level.dat').exists())
            self.assertFalse((clone/'worlds'/'other').exists())
            self.assertIn('server-port=17880',(clone/'server.properties').read_text())
            self.assertIn('server-port=17879',(source/'server.properties').read_text())
            self.assertEqual(json.loads((clone/'.alice-sandbox.json').read_text())['source'],str(source.resolve()))
            with self.assertRaisesRegex(ValueError,'already exists'):
                lab.prepare(source,manifest,clone,run_verify=lambda m,s:{'worlds':['worlds/Bedrock level'],'sha256':sha})
    def test_refuses_nested_symlink_in_live_installation_without_clone(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            source=home/'minecraft-bedrock'
            (source/'config').mkdir(parents=True)
            (source/'bedrock_server').write_bytes(b'BDS binary')
            (source/'server.properties').write_text('server-port=17879\nlevel-name=Bedrock level\n')
            (source/'config'/'external').symlink_to(home)
            archive=home/'backup.json'
            archive.write_text(json.dumps({'archive':'no-file.tar.gz','files':{}}))
            labdir=home/'minecraft-bedrock-alice-lab'
            with self.assertRaisesRegex(ValueError,'nested server symlink'):
                lab.prepare(source,archive,labdir,
                            run_verify=lambda *a:{'worlds':['worlds/Bedrock level'],'sha256':'f'*64})
            self.assertFalse(labdir.exists())

if __name__=='__main__': unittest.main()