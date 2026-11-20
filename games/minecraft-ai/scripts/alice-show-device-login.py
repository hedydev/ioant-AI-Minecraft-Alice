#!/usr/bin/env python3
"""Present the current Alice device challenge privately to the owner on Mac.

No codes, tokens or raw logs are printed, saved or returned to ChatGPT. The
owner completes Microsoft sign-in in their browser. Does not restart anything.
"""
import importlib.util
import json
import shlex
import subprocess
from pathlib import Path
import sys

REMOTE=r'''
import json,os,re,sys,time
from pathlib import Path
sys.path.insert(0,str(Path.home()/'minecraft-ai/scripts'))
from alice_operator.process import AliceProcess
from alice_operator.diagnostics import current_log
def challenge(text):
 matches=set(re.findall(r'https://(?:www\.)?microsoft\.com/link[\s\S]{0,400}?(?:enter|use) the code\s+([A-Z0-9]{6,12})\b',text,re.I))
 return next(iter(matches)).upper() if len(matches)==1 else None
app=AliceProcess();owner=app.owner()
if not owner:raise SystemExit(2)
app.inspect(owner);p=Path(current_log(app,owner))
if not p.is_file() or p.is_symlink() or p.stat().st_mode&0o077:raise SystemExit(2)
if not 0<=time.time()-p.stat().st_mtime<=900:raise SystemExit(2)
with p.open('rb') as f:
 f.seek(max(0,p.stat().st_size-32768));text=f.read(32768).decode('utf-8','replace')
code=challenge(text)
if code is None:raise SystemExit(2)
if not re.fullmatch('[A-Z0-9]{6,12}',code):raise SystemExit(2)
print(json.dumps({'code':code}))
'''

def main():
    if sys.platform!='darwin':raise ValueError('mac_only')
    script=Path(__file__).with_name('alice-stable-activation-preflight.py')
    spec=importlib.util.spec_from_file_location('alice_auth_target',script)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
        '-o','ConnectTimeout=8',m.target(),'/usr/bin/python3 -c '+shlex.quote(REMOTE)],
        capture_output=True,text=True,timeout=20)
    if p.returncode or len(p.stdout)>128:
        print('Current device prompt unavailable; no authentication data displayed.');return 1
    data=json.loads(p.stdout);code=data['code']
    import re
    if not re.fullmatch('[A-Z0-9]{6,12}',code):return 1
    # osascript receives the code through stdin, never command args or logs.
    message='Alice 的微软设备登录码：'+code+'\n\n请在已打开的 Microsoft 官方网页中输入此码，并使用原 Alice 账号完成登录。完成后关闭此提示。验证码不会写入聊天或项目文件。'
    apple='display dialog '+json.dumps(message,ensure_ascii=False)+' with title "Alice 私人登录验证" buttons {"完成后关闭"} default button 1 giving up after 900'
    subprocess.run(['/usr/bin/open','https://www.microsoft.com/link'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    print('Opened Microsoft sign-in and private device-code dialog; no code exported.',flush=True)
    subprocess.run(['/usr/bin/osascript','-'],input=apple,text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=910)
    print('Private login dialog closed; game login must be verified separately.')
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:
        print('Private login presenter unavailable; no authentication data exported.');raise SystemExit(1)
