import importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('bed_dep',Path(__file__).resolve().parents[1]/'scripts/alice-bed-dependency-readonly.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BedDependencyReadTest(unittest.TestCase):
    def test_mapping_sources_are_fixed_packages_and_never_follow_external_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);pkg=base/'prismarine-chunk'/'src';pkg.mkdir(parents=True)
            (pkg/'hash.js').write_text('function stateIdToRuntimeId() { return 1 }')
            (pkg/'skip.js').symlink_to(base/'credentials')
            (base/'credentials').write_text('networkId=secret')
            rows=m.mapping_sources(base)
            self.assertEqual([r['plugin'] for r in rows],['prismarine-chunk/src/hash.js'])
            self.assertNotIn('secret',str(rows))
    def test_original_server_policy_is_anonymous_and_never_reads_player_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);server=home/'minecraft-bedrock';server.mkdir()
            (server/'server.properties').write_text('server-port=17879\nlevel-name=Bedrock level\ndefault-player-permission-level=member\ngamemode=survival\npassword=private\n')
            self.assertEqual(m.interaction_policy(home),{'verifiedOriginalServer':True,
                'defaultPlayerPermission':'member','gameMode':'survival'})
            (server/'server.properties').write_text('server-port=17880\nlevel-name=Bedrock level\n')
            self.assertFalse(m.interaction_policy(home)['verifiedOriginalServer'])
    def test_duplicate_policy_and_symlink_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);server=home/'minecraft-bedrock';server.mkdir()
            file=server/'server.properties';file.write_text('server-port=17879\nserver-port=17879\nlevel-name=Bedrock level\n')
            self.assertFalse(m.interaction_policy(home)['verifiedOriginalServer'])
            file.unlink();file.symlink_to(home/'unknown')
            self.assertFalse(m.interaction_policy(home)['verifiedOriginalServer'])
    def test_only_native_js_implementation_and_bounded_excerpts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'bed.js').write_text('async function sleep() {}\n')
            (root/'settings.json').write_text('private credentials')
            (root/'unrelated.js').write_text('no matching public function')
            (root/'interact.js').write_text('bot._genericPlace = (b, face) => send(b, face)\n')
            (root/'escape.js').symlink_to(root/'settings.json')
            rows=m.read_plugins(root)
            self.assertEqual([x['plugin'] for x in rows],['bed.js','interact.js'])
            self.assertNotIn('private',str(rows));self.assertEqual(len(rows[0]['sha256']),64)
            compile(m.REMOTE,'<readonly>','exec')
    def test_symlink_root_is_rejected_and_source_size_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'real').mkdir();(root/'link').symlink_to(root/'real',target_is_directory=True)
            with self.assertRaises(ValueError):m.read_plugins(root/'link')
            (root/'real'/'bed.js').write_text('async function sleep() {}\n'+'x'*100001)
            self.assertEqual(m.read_plugins(root/'real'),[])
