from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MAC = ROOT / "scripts" / "deploy-and-run.sh"
MINT = ROOT / "scripts" / "install-and-run.sh"

class DeployScriptsTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("bash"), "bash required")
    def test_shell_syntax(self):
        for path in (MAC, MINT):
            with self.subTest(path=path.name):
                result=subprocess.run(["bash","-n",str(path)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)

    def test_dry_run_does_not_run_git_or_ssh(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            project=root/"games"/"minecraft-ai"
            scripts=project/"scripts"
            scripts.mkdir(parents=True)
            (root/"AGENTS.md").write_text("# test")
            (scripts/"install.py").write_text("# test")
            shutil.copyfile(MAC,scripts/MAC.name)
            done=subprocess.run(["bash",str(scripts/MAC.name),"--dry-run","--no-start"],
                                capture_output=True,text=True)
            self.assertEqual(done.returncode,0,done.stderr)
            self.assertIn("preflight",done.stdout)
            self.assertIn("Mint target: ~/mindcraft-alice",done.stdout)
            self.assertNotIn("node main.js and live logs",done.stdout)

    def test_dry_run_targets_selected_checkout(self):
        # On Mint, tests run from ~/minecraft-ai (rsync subproject mirror),
        # not from a full hero-skills repo. Dry-run's repo preflight requires
        # AGENTS.md two levels above, so use an isolated complete fixture.
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            scripts = root / "games" / "minecraft-ai" / "scripts"
            scripts.mkdir(parents=True)
            (root / "AGENTS.md").write_text("# test")
            (scripts / "install.py").write_text("# test")
            shutil.copyfile(MAC, scripts / MAC.name)
            env = dict(os.environ, ALICE_MINDCRAFT_NAME="minecraft-alice-v2")
            res = subprocess.run(
                ["bash", str(scripts / MAC.name), "--dry-run"],
                env=env, capture_output=True, text=True, timeout=8)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn("Mint target: ~/minecraft-alice-v2", res.stdout)

    def test_reject_invalid_instance_name(self):
        env=dict(os.environ,ALICE_MINDCRAFT_NAME="../../other")
        res=subprocess.run(["bash",str(MAC),"--dry-run"],env=env,capture_output=True,text=True)
        self.assertEqual(res.returncode,2)
        self.assertIn("Invalid ALICE_MINDCRAFT_NAME",res.stderr)

    def test_reject_invalid_ssh_target(self):
        env=dict(os.environ,ALICE_SSH_TARGET="-invalid")
        result=subprocess.run(["bash",str(MAC),"--dry-run"],env=env,
                              capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn("Invalid ALICE_SSH_TARGET",result.stderr)


    @unittest.skipUnless(shutil.which("bash"), "bash required")
    def test_foreground_launch_with_and_without_ollama_tunnel(self):
        """Exercise both launch paths under nounset without a platform-dependent PTY.

        Mock git/ssh/rsync/curl so the test never contacts Mint, installs Alice,
        changes the user's world or starts a real bot.
        """
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = root / "games" / "minecraft-ai"
            scripts = project / "scripts"
            scripts.mkdir(parents=True)
            (project / "runtime" / "alice_modules").mkdir(parents=True)
            (root / "AGENTS.md").write_text("# test")
            (scripts / "install.py").write_text("# test")
            shutil.copyfile(MAC, scripts / MAC.name)
            # In the copied test fixture ONLY, skip the terminal gate so
            # subprocess.run can safely capture errors without PTY behavior.
            # Production's terminal guard remains intact.
            fixture = scripts / MAC.name
            source = fixture.read_text()
            guard = """[[ -t 0 && -t 1 ]] || { echo 'Foreground Alice needs a terminal; use --no-start for CI' >&2; exit 1; }"""
            self.assertEqual(source.count(guard), 1)
            fixture.write_text(source.replace(guard, ': # test-only mock terminal'))
            bin_dir = root / "fake-bin"
            bin_dir.mkdir()
            (bin_dir / "git").write_text(
                '#!/bin/bash\n'
                'if [[ "$*" == *"branch --show-current"* ]]; then echo main; fi\n'
                'exit 0\n')
            (bin_dir / "ssh").write_text(
                '#!/bin/bash\n'
                'printf "%s\\n" "$*" >> "$ALICE_TEST_CALLS"\n'
                'if [[ "$ALICE_TEST_MODE" == tunnel && "$*" == *"127.0.0.1:11435/api/tags"* ]]; then exit 1; fi\n'
                'exit 0\n')
            (bin_dir / "rsync").write_text('#!/bin/bash\nexit 0\n')
            (bin_dir / "curl").write_text('#!/bin/bash\nexit 0\n')
            for p in bin_dir.iterdir():
                p.chmod(0o700)

            for mode in ("no_tunnel", "tunnel"):
                with self.subTest(mode=mode):
                    calls = root / "calls.log"
                    calls.write_text("")
                    env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                               ALICE_TEST_CALLS=str(calls), ALICE_TEST_MODE=mode,
                               ALICE_MINDCRAFT_NAME="mindcraft-alice")
                    if mode == "no_tunnel":
                        env["ALICE_OLLAMA_TUNNEL"] = "off"
                    else:
                        env.pop("ALICE_OLLAMA_TUNNEL", None)
                    result = subprocess.run(
                        ["bash", str(scripts / MAC.name), "--no-pull"],
                        env=env, capture_output=True, text=True, timeout=8)
                    self.assertEqual(result.returncode, 0,
                                     "Mock foreground launch failed:\n" +
                                     result.stdout + "\n" + result.stderr)
                    ssh_calls = calls.read_text().splitlines()
                    launch = [line for line in ssh_calls if "ALICE_MINDCRAFT_NAME=mindcraft-alice" in line]
                    self.assertEqual(len(launch), 1, ssh_calls)
                    self.assertIn("-tt", launch[0])
                    if mode == "tunnel":
                        self.assertIn("-R 127.0.0.1:11435:127.0.0.1:11434", launch[0])
                        self.assertIn("-o ExitOnForwardFailure=yes", launch[0])
                    else:
                        self.assertNotIn(" -R ", launch[0])

if __name__=="__main__":
    unittest.main()
