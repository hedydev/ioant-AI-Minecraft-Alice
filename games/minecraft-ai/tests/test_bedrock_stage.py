import importlib.util
import hashlib
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
inspect=load('inspect_bedrock_default',ROOT/'scripts'/'inspect-bedrock-default.py')
verify=load('verify_bedrock_backup',ROOT/'scripts'/'verify-world-backup.py')

class StageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.srv=self.root/'minecraft-bedrock'
        self.srv.mkdir()
        (self.srv/'server.properties').write_text('level-name=新世纪\nserver-port=17879\nonline-mode=true\n')
        self.world=self.srv/'worlds'/'Bedrock level'
        self.world.mkdir(parents=True)
        (self.world/'level.dat').write_bytes(b'BEDROCKLEVEL')
        (self.world/'db').mkdir()
        (self.world/'db'/'0000001.log').write_bytes(b'leveldb log content')
        self.out=self.root/'backups'
        self.out.mkdir()

    def makebackup(self, modify=None):
        name='minecraft-bedrock-20261018T010000000000Z'
        archive=self.out/(name+'.tar.gz')
        files={'worlds/Bedrock level/level.dat':b'BEDROCKLEVEL',
               'worlds/Bedrock level/db/0000001.log':b'leveldb log content'}
        with tarfile.open(archive,'w:gz') as out:
            for rel,data in files.items():
                import io
                ti=tarfile.TarInfo(rel);ti.size=len(data)
                out.addfile(ti,io.BytesIO(data))
        manifest={'kind':'bedrock','source':str(self.srv),'verified':True,'worlds':['worlds/Bedrock level'],
                  'archive':archive.name,'files':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
        if modify:modify(manifest)
        manifestfile=self.out/(name+'.json')
        manifestfile.write_text(json.dumps(manifest))
        side=self.out/(name+'.sha256')
        side.write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
        return manifestfile,archive

    def test_mcsmanager_known_instance_discovery_readonly(self):
        info=inspect.inspect(self.srv,proc=self.root/'notproc')
        self.assertEqual(info['serverPort'],'17879')
        self.assertEqual(info['onlineMode'],'true')
        self.assertEqual(info['levelName'],'新世纪')
        self.assertEqual([p['directory'] for p in info['worlds']],[str(self.world.resolve())])
        self.assertEqual(info['runningBedrockPids'],[])
        self.assertTrue(info['readOnly'])

    def test_independent_temporary_restore_and_checksums(self):
        manifest,archive=self.makebackup()
        result=verify.verify(manifest,self.srv,temp_root=self.root)
        self.assertTrue(result['verified'])
        self.assertTrue(result['temporaryRestore'])
        self.assertEqual(result['files'],2)
        self.assertEqual((self.world/'level.dat').read_bytes(),b'BEDROCKLEVEL')
        self.assertFalse(list(self.root.glob('alice-world-restore-check-*')))

    def test_reject_wrong_world_and_corrupt_sha(self):
        manifest,archive=self.makebackup(lambda data:data.update(worlds=['worlds/other']))
        with self.assertRaisesRegex(ValueError,'Unverified world paths'):
            verify.verify(manifest,self.srv,temp_root=self.root)
        # Archive integrity is checked before restore.
        mf,archive2=self.makebackup()
        archive2.write_bytes(archive2.read_bytes()+b'altered')
        with self.assertRaisesRegex(ValueError,'SHA256 mismatch'):
            verify.verify(mf,self.srv,temp_root=self.root)

    def test_reject_wrong_server(self):
        mf,_=self.makebackup()
        with self.assertRaisesRegex(ValueError,'source differs'):
            verify.verify(mf,self.root/'other-instance',temp_root=self.root)

if __name__=='__main__': unittest.main()