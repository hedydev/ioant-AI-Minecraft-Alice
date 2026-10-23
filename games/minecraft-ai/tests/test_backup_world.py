import importlib.util
from pathlib import Path
import json
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('backup_world',ROOT/'scripts'/'backup-world.py')
backup=importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'server';self.root.mkdir()
        (self.root/'server.properties').write_text('level-name=world\n')
        self.world=self.root/'world';self.world.mkdir()
        (self.world/'level.dat').write_bytes(b'\x01\x02leveldata')
        (self.world/'region').mkdir()
        (self.world/'region'/'r.0.0.mca').write_bytes(b'world region bytes')
        self.out=Path(self.tmp.name)/'backups'

    def test_offline_archive_verified_and_source_unchanged(self):
        with patch.object(backup,'active_game_process',return_value=None):
            worlds=backup.find_worlds(self.root,'paper')
            archive=backup.write_backup(self.root,self.out,'paper',worlds)
        self.assertEqual(worlds,[self.world.resolve()])
        self.assertTrue(archive.is_file())
        with tarfile.open(archive,'r:gz') as tar:
            self.assertEqual(tar.extractfile('world/region/r.0.0.mca').read(),b'world region bytes')
        manifest=json.loads(archive.with_suffix('').with_suffix('.json').read_text())
        self.assertTrue(manifest['verified'])
        self.assertEqual((self.world/'level.dat').read_bytes(),b'\x01\x02leveldata')

    def test_running_server_blocks_backup_before_any_output(self):
        with patch.object(backup,'active_game_process',return_value=(123,'java')):
            with self.assertRaisesRegex(RuntimeError,'running'):
                backup.write_backup(self.root,self.out,'paper',[self.world])
        self.assertFalse(self.out.exists())

    def test_refuse_destination_inside_server_and_symlinks(self):
        with patch.object(backup,'active_game_process',return_value=None):
            with self.assertRaisesRegex(ValueError,'inside server'):
                backup.write_backup(self.root,self.root/'snapshots','paper',[self.world])
        (self.world/'region'/'unsafe').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError,'symlinks'):
            backup.list_files([self.world],self.root)

    def test_bedrock_world_selection_and_invalid_level(self):
        (self.root/'worlds'/'world').mkdir(parents=True)
        (self.root/'worlds'/'world'/'level.dat').write_bytes(b'bedrock')
        self.assertEqual(backup.find_worlds(self.root,'bedrock'),[(self.root/'worlds'/'world').resolve()])
        (self.root/'server.properties').write_text('level-name=不存在\n')
        with self.assertRaises(FileNotFoundError):
            backup.find_worlds(self.root,'bedrock')

    def test_alias_root_is_canonicalized_without_permitting_external_worlds(self):
        # Reproduces the same root/candidate mismatch as macOS /var ->
        # /private/var on platforms whose tempfile root is not aliased.
        with tempfile.TemporaryDirectory() as directory:
            alias = Path(directory)/'server-alias'
            alias.symlink_to(self.root, target_is_directory=True)
            self.assertEqual(backup.find_worlds(alias,'paper'), [self.world.resolve()])
            outside = Path(directory)/'outside'
            outside.mkdir()
            (outside/'level.dat').write_bytes(b'external')
            (self.root/'external-link').symlink_to(outside, target_is_directory=True)
            (self.root/'server.properties').write_text('level-name=external-link\n')
            with self.assertRaisesRegex(ValueError,'inside the server directory'):
                backup.find_worlds(alias,'paper')

if __name__=='__main__':unittest.main()