"""One verified Alice client. Never controls BDS, worlds or authentication caches."""
import json
import os
import pathlib
import re
import signal
import subprocess
import time
import uuid

from .config import private_json, private_path, validate, KEYS


class AliceProcess:
    def __init__(self, home=None):
        self.home = pathlib.Path(home or pathlib.Path.home())
        self.root = self.home / '.alice-bedrock-control'
        self.project = self.home / 'minecraft-ai/bedrock-native/experiment'
        self.lock = self.root / 'active-alice-client.lock/owner.json'
        self.node_root = self.home / '.local/share/alice-bedrock/node24'
        self.node = self.node_root / 'current/bin/node'

    def owner(self):
        private_path(self.root, directory=True)
        if not self.lock.parent.exists():
            return None
        o = private_json(self.lock, limit=512)
        if not isinstance(o, dict) or type(o.get('pid')) is not int or o['pid'] <= 1 or not re.fullmatch('[a-f0-9]{32}', str(o.get('nonce', ''))):
            raise ValueError('Invalid Alice process owner')
        proc = pathlib.Path('/proc') / str(o['pid'])
        if not proc.exists():
            return None  # The existing native lock implementation owns stale-lock cleanup.
        return o

    def inspect(self, owner):
        proc = pathlib.Path('/proc') / str(owner['pid'])
        if proc.stat().st_uid != os.getuid():
            raise ValueError('Alice process belongs to another user')
        args = (proc / 'cmdline').read_bytes().split(b'\0')
        if args[-1:] == [b'']:
            args.pop()
        if len(args) != 3 or pathlib.Path(os.fsdecode(args[0])).name != 'node' or args[1:] != [b'src/main.cjs', b'--production-start']:
            raise ValueError('Lock PID does not identify the expected Alice command')
        exe = (proc / 'exe').resolve(strict=True)
        if not exe.is_relative_to(self.node_root.resolve(strict=True)):
            raise ValueError('Unexpected Alice Node executable')
        cwd = (proc / 'cwd').resolve(strict=True)
        if cwd not in (self.project.resolve(), (self.home / '.alice-bedrock-autonomy-state').resolve()):
            raise ValueError('Unexpected Alice working directory')
        token = (proc / 'stat').read_text().rsplit(')', 1)[1].split()[19]
        env = dict(os.fsdecode(x).split('=', 1) for x in (proc / 'environ').read_bytes().split(b'\0') if b'=' in x)
        validate({k: env[k] for k in KEYS if k in env})
        return str(exe), token, env

    def check(self, env):
        if not self.node.resolve(strict=True).is_relative_to(self.node_root.resolve(strict=True)):
            raise ValueError('Unexpected configured Node24 path')
        if not self.project.is_dir():
            raise ValueError('Missing Mint Alice project')
        js = "require('./src/gate.cjs').productionGate();require('./src/chunk_preflight.cjs').checkChunkImplementation()"
        self.run_check([str(self.node), '-e', js], env, 'Production backup/chunk preflight failed')
        self.run_check(['systemctl', '--user', 'is-active', 'alice-bds-position-witness.service'], env, 'BDS witness service is not active')

    def run_check(self, args, env, message):
        p = subprocess.run(args, cwd=self.project, env=env, capture_output=True, timeout=60)
        if p.returncode:
            raise ValueError(message + '; no client launched')

    def wait_bds_release(self, env, seconds=30):
        deadline = time.monotonic() + seconds
        while True:
            p = subprocess.run([str(self.node), 'src/main.cjs', '--production-check'],
                               cwd=self.project, env=env, capture_output=True, timeout=60)
            if p.returncode == 0:
                return
            # Retry only the known asynchronous BDS logout observation, never login.
            if b'BDS still records configured Alice Gamertag ONLINE' not in p.stderr:
                raise ValueError('Post-logout production check failed; no client launched')
            if time.monotonic() >= deadline:
                raise ValueError('BDS still reports Alice online after logout wait; no client launched')
            time.sleep(1)

    def stop(self, owner, token):
        # pidfd prevents signalling a recycled PID. Available on supported Mint Linux.
        fd = os.pidfd_open(owner['pid'])
        try:
            if self.owner() != owner or self.inspect(owner)[1] != token:
                raise ValueError('Alice owner changed before stop')
            signal.pidfd_send_signal(fd, signal.SIGINT)
        finally:
            os.close(fd)
        deadline = time.monotonic() + 20
        proc = pathlib.Path('/proc') / str(owner['pid'])
        while proc.exists():
            try:
                fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
            except FileNotFoundError:
                break
            if fields[0] == 'Z' or fields[19] != token:
                break
            if time.monotonic() >= deadline:
                raise ValueError('Old Alice did not exit; no replacement started')
            time.sleep(.2)
        if self.lock.parent.exists():
            raise ValueError('Alice lock remains after shutdown; no replacement started')

    def launch(self, env, owner=None):
        private_path(self.root, directory=True)
        token = self.inspect(owner)[1] if owner else None
        self.check(env)  # Old client remains running if preflight fails.
        log = self.root / ('operator-alice-' + time.strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:6] + '.log')
        fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as out:
            if owner:
                self.stop(owner, token)
            elif self.owner():
                raise ValueError('Alice is already running; use restart')
            self.wait_bds_release(env)
            child = subprocess.Popen([str(self.node), 'src/main.cjs', '--production-start'],
                                     cwd=self.project, env=env, stdin=subprocess.DEVNULL,
                                     stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        time.sleep(1)
        if child.poll() is not None:
            raise ValueError('Alice exited during startup; inspect private log ' + str(log))
        return {'oldPid': owner['pid'] if owner else None, 'newPid': child.pid,
                'log': str(log), 'status': 'process_started_game_login_not_yet_verified'}
