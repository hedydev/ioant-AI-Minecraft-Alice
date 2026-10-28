"""Unit tests: fresh v2 clone never edits existing Alice labs or production."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

SCRIPTS=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location("alice_v2_lab",SCRIPTS/"alice-bds-lab-v2.py")
V2=importlib.util.module_from_spec(spec)
spec.loader.exec_module(V2)
clone_spec=importlib.util.spec_from_file_location("alice_v2_clone",SCRIPTS/"prepare-bedrock-alice-lab.py")
CLONE=importlib.util.module_from_spec(clone_spec)
clone_spec.loader.exec_module(CLONE)


class V2ArchiveTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home=Path(tmp.name)
        self.prod=self.home/"minecraft-bedrock"
        self.prod.mkdir()
        (self.prod/"bedrock_server").write_bytes(b"fake binary")
        (self.prod/"server.properties").write_text(
            "server-port=17879\nserver-name=Live\nonline-mode=true\n"
            "enable-lan-visibility=true\nlevel-name=Bedrock level\n")
        (self.prod/"config").mkdir()
        (self.prod/"config"/"private-token").write_text("secret")
        (self.prod/"behavior_packs").mkdir()
        (self.prod/"behavior_packs"/"live-pack").write_text("old pack")
        (self.prod/"permissions.json").write_text("operator info")
        (self.prod/"allowlist.json").write_text("players")
        live=self.prod/"worlds"/"Bedrock level"
        live.mkdir(parents=True)
        (live/"level.dat").write_bytes(b"LIVE WORLD")
        self.v1=self.home/"minecraft-bedrock-alice-lab"
        self.v1.mkdir()
        (self.v1/"spent").write_bytes(b"DO NOT EDIT")
        self.v2=self.home/V2.V2_NAME
        backup=self.home/"archive"
        backup.mkdir()
        self.manifest=backup/"backup.json"
        self.archive=backup/"backup.tar.gz"
        archived=b"ARCHIVED WORLD SNAPSHOT"
        with tarfile.open(self.archive,"w:gz") as tf:
            entry=tarfile.TarInfo("worlds/Bedrock level/level.dat")
            entry.size=len(archived)
            tf.addfile(entry,io.BytesIO(archived))
        self.manifest.write_text(json.dumps({
            "archive":"backup.tar.gz",
            "files":{"worlds/Bedrock level/level.dat":
                     hashlib.sha256(archived).hexdigest()}
        }))

    def prepare(self,dest):
        return CLONE.prepare(self.prod,self.manifest,dest,
            run_verify=lambda m,s:{
                "worlds":["worlds/Bedrock level"],"sha256":"a"*64})

    def test_v2_fresh_clone_excludes_live_credentials_and_players(self):
        state=self.prepare(self.v2)
        self.assertEqual(state["port"],17880)
        self.assertEqual((self.prod/"worlds"/"Bedrock level"/"level.dat").read_bytes(),
                         b"LIVE WORLD")
        self.assertEqual((self.v1/"spent").read_bytes(),b"DO NOT EDIT")
        self.assertEqual((self.v2/"worlds"/"Bedrock level"/"level.dat").read_bytes(),
                         b"ARCHIVED WORLD SNAPSHOT")
        marker=json.loads((self.v2/".alice-sandbox.json").read_text())
        self.assertEqual(marker["labGeneration"],"fresh-isolated-v2")
        self.assertEqual(marker["port"],17880)
        props=(self.v2/"server.properties").read_text()
        self.assertIn("enable-lan-visibility=false",props)
        self.assertIn("allow-list=true",props)
        self.assertIn("script-debugger-auto-attach=disabled",props)
        self.assertEqual((self.v2/"allowlist.json").read_text(),"[]\n")
        for name in ("config","behavior_packs","permissions.json"):
            self.assertFalse((self.v2/name).exists())
        with self.assertRaisesRegex(ValueError,"already exists"):
            self.prepare(self.v2)

    def test_only_exact_v2_sibling_name_is_eligible(self):
        for dest in (self.home/"minecraft-bedrock-alice-lab-v3",
                     self.home/"other"/V2.V2_NAME):
            with self.subTest(destination=dest):
                dest.parent.mkdir(exist_ok=True)
                with self.assertRaisesRegex(ValueError,"allowed|sibling"):
                    self.prepare(dest)
                self.assertFalse(dest.exists())

    def test_existing_v1_does_not_block_v2_check(self):
        class FakeArchive:
            LAB=Path("/not/set")
            def operate(self,mode):
                self.target=self.LAB
                return {"audit":"ALICE_BDS_ARCHIVED_LAB","mode":mode,
                        "labState":"absent",
                        "backupRestore":"archive_sha256_isolated_restore_verified",
                        "reason":"ready_for_explicit_lab_prepare",
                        "productionWorldModified":False,
                        "productionBdsRestarted":False,
                        "safeToChangeProductionWorld":False}
        m=FakeArchive()
        result=V2.operate("check",archive_module=m,home=self.home)
        self.assertEqual(m.target,self.v2)
        self.assertEqual(result["state"],"absent")
        self.assertFalse(result["oldV1LabModified"])
        self.assertFalse(result["labBdsStarted"])

    def test_untrusted_archive_result_is_never_reported_as_verified(self):
        class BadArchive:
            def operate(self,mode):
                return {"audit":"ALICE_BDS_ARCHIVED_LAB",
                        "mode":mode,"labState":"custom-user-input",
                        "backupRestore":"not_verified","reason":"none",
                        "productionWorldModified":False,
                        "productionBdsRestarted":False,
                        "safeToChangeProductionWorld":False}
        with self.assertRaisesRegex(ValueError,"invalid_archive_contract"):
            V2.operate("prepare",archive_module=BadArchive(),home=self.home)
        self.assertFalse(self.v2.exists())

    def test_prepare_is_not_invoked_by_check_command(self):
        class Inspection:
            LAB=Path("/not/set")
            def operate(self,mode):
                if mode!="check":
                    raise AssertionError("must never prepare")
                return {"audit":"ALICE_BDS_ARCHIVED_LAB",
                        "mode":mode,"labState":"absent",
                        "backupRestore":"not_verified",
                        "reason":"configured_manifest_unavailable",
                        "productionWorldModified":False,
                        "productionBdsRestarted":False,
                        "safeToChangeProductionWorld":False}
        result=V2.operate("check",archive_module=Inspection(),home=self.home)
        self.assertEqual(result["reason"],"configured_manifest_unavailable")
        self.assertFalse(self.v2.exists())

    def test_mac_action_split_and_sanitized_schema(self):
        dispatcher=(SCRIPTS/"alice-mac.sh").read_text()
        mac=(SCRIPTS/"alice-bds-lab-v2-mac.sh").read_text()
        self.assertIn("witness-lab-v2-check",dispatcher)
        self.assertIn("witness-lab-v2-prepare",dispatcher)
        accepted=dispatcher.split('case "$action" in',1)[1].split('esac',1)[0]
        self.assertIn("|witness-lab-v2-check|witness-lab-v2-prepare|",accepted)
        self.assertIn('alice-bds-lab-v2-mac.sh',dispatcher)
        self.assertIn("v2DirectoryOnly",mac)
        self.assertIn("productionWorldModified",mac)
        self.assertNotIn("bedrock_server",mac)
        self.assertNotIn("sudo",mac)


if __name__ == "__main__":
    unittest.main()
