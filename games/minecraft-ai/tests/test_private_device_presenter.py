import ast
import importlib.util
from pathlib import Path
import re
import unittest

class DevicePromptTests(unittest.TestCase):
    def test_both_microsoft_prompt_wordings_without_exporting_log(self):
        p=Path(__file__).resolve().parents[1]/'scripts/alice-show-device-login.py'
        spec=importlib.util.spec_from_file_location('device_presenter',p)
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        tree=ast.parse(m.REMOTE)
        function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='challenge')
        ns={'re':re};exec(compile(ast.Module(body=[function],type_ignores=[]),'<challenge>','exec'),ns)
        for wording in ('enter','use'):
            self.assertEqual(ns['challenge']('https://www.microsoft.com/link\nand '+wording+' the code ABCD1234 to authenticate'),'ABCD1234')
        self.assertEqual(ns['challenge']('[Alice] Xbox authorization requested. Open https://www.microsoft.com/link\n[Alice] Device code (private terminal only): ABCD1234'),'ABCD1234')
        self.assertIsNone(ns['challenge']('https://other.example/link and use the code ABCD1234'))
        self.assertIsNone(ns['challenge']('unrelated log'))
