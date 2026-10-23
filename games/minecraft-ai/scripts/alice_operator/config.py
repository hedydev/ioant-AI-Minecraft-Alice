"""Private, data-only operator settings. Never persist a complete process environment."""
import json
import os
import pathlib
import stat
import tempfile
import urllib.parse

KEYS = frozenset('''ALICE_BEDROCK_BACKUP_MANIFEST ALICE_BEDROCK_PRODUCTION_CONFIRM
ALICE_BEDROCK_PROFILE ALICE_BEDROCK_CLIENT_MODE ALICE_BEDROCK_RAKNET_BACKEND
ALICE_BEDROCK_BDS_GAMERTAG ALICE_BEDROCK_BDS_SESSION_LOG
ALICE_BEDROCK_INPUT_FLAG_COMPAT ALICE_BEDROCK_INPUT_ANALOG_COMPAT
ALICE_BEDROCK_INPUT_AUDIT ALICE_BEDROCK_INPUT_TICK_MODE
ALICE_OLLAMA_URL ALICE_OLLAMA_MODEL ALICE_OLLAMA_JSON_MODE
ALICE_OLLAMA_TIMEOUT_MS ALICE_OLLAMA_NUM_PREDICT'''.split())
REQUIRED = frozenset('''ALICE_BEDROCK_BACKUP_MANIFEST ALICE_BEDROCK_PRODUCTION_CONFIRM
ALICE_BEDROCK_PROFILE ALICE_BEDROCK_BDS_GAMERTAG ALICE_BEDROCK_BDS_SESSION_LOG
ALICE_BEDROCK_CLIENT_MODE'''.split())


def private_path(path, directory=False):
    st = path.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    if not kind(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError('Unsafe private operator path: ' + path.name)
    return st


def private_json(path, limit=16384):
    private_path(path.parent, directory=True)
    st = private_path(path)
    if st.st_size > limit:
        raise ValueError('Operator JSON exceeds size limit')
    return json.loads(path.read_text())


def validate(values):
    if not isinstance(values, dict) or set(values) - KEYS:
        raise ValueError('Unknown operator configuration keys')
    if any(not isinstance(v, str) or not v or len(v) > 1024 or '\n' in v or '\0' in v for v in values.values()):
        raise ValueError('Invalid operator configuration value')
    if REQUIRED - values.keys():
        raise ValueError('Missing operator settings: ' + ', '.join(sorted(REQUIRED - values.keys())))
    if values['ALICE_BEDROCK_PRODUCTION_CONFIRM'] != 'I_ACCEPT_WORLD_CHANGES':
        raise ValueError('Original production confirmation required')
    if 'ALICE_OLLAMA_URL' in values:
        u = urllib.parse.urlsplit(values['ALICE_OLLAMA_URL'])
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
            raise ValueError('Ollama URL must be a plain origin without credentials or Markdown')
    return values


def load_environment(root):
    raw = private_json(root / 'operator-env.json')
    if not isinstance(raw, dict) or raw.get('version') != 1:
        raise ValueError('Unsupported operator configuration version')
    return {**os.environ, **validate(raw.get('settings'))}


def save_environment(root, env):
    private_path(root, directory=True)
    values = validate({k: env[k] for k in KEYS if k in env})
    target = root / 'operator-env.json'
    # Never overwrite existing private configuration implicitly.
    if target.exists() or target.is_symlink():
        existing = private_json(target)
        if existing != {'version': 1, 'settings': values}:
            raise ValueError('Private config differs; inspect operator-env.json before updating it')
        return False
    fd, temp = tempfile.mkstemp(prefix='.operator-env-', dir=root)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump({'version': 1, 'settings': values}, out, indent=2)
            out.write('\n')
        # Atomic no-clobber publication; concurrent creation cannot be overwritten.
        os.link(temp, target)
    finally:
        pathlib.Path(temp).unlink(missing_ok=True)
    return True
