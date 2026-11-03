import importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('bed_dep',Path(__file__).resolve().parents[1]/'scripts/alice-bed-dependency-readonly.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BedDependencyReadTest(unittest.TestCase):
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
