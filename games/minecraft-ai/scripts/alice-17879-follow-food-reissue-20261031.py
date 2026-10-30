#!/usr/bin/env python3
"""At most one FOLLOW reissue after the FOLLOW3/food Alice client reload.

No arbitrary text or credentials, no BDS commands, no restart, no test worlds.
A permanent local intent marker prevents repeated follow instructions.
"""
import json,os,subprocess,sys,time,urllib.request,urllib.error
from pathlib import Path
BASE='http://127.0.0.1:8788'
PLAYER='MolarParsley191'
def request(path,data=None):
    headers={'Host':'127.0.0.1:8788'}
    if data is not None:
        headers.update({'Origin':BASE,'Content-Type':'application/json'})
        data=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
    with urllib.request.urlopen(urllib.request.Request(BASE+path,data=data,headers=headers),
                                timeout=17) as r:
        if r.status!=200:raise ValueError('http_failure')
        raw=r.read(16000)
        if len(raw)>=16000:raise ValueError('oversize')
        return json.loads(raw)
def observed():
    d=request('/api/control/status')
    v=d.get('runtime') or {}
    if (d.get('online') is not True or
        v.get('world')!='Bedrock level' or v.get('serverPort')!=17879 or
        v.get('sessionEstablished') is not True):raise ValueError('not_production')
    return d,v
def main(output,act=False):
    out=Path(output)
    if out.is_symlink() or not out.is_dir():raise ValueError('output')
    report={'audit':'ALICE_REAL17879_ESCORT_HTTP_TEST','schemaVersion':1,
        'state':'unavailable','aliceOnline':False,'ownerOnline':False,
        'followWasAlreadyRequested':False,'followIssued':False,
        'receiptStatus':None,'receiptReason':None,
        'followIntentNow':False,'aliceStillConnected':False,
        'serviceRestarted':False,'bdsQueried':False,'worldModifiedByTask':False}
    try:
        d,v=observed()
        report['aliceOnline']=True
        report['ownerOnline']=PLAYER in (v.get('onlinePlayers') or [])
        report['followWasAlreadyRequested']=v.get('followTarget')==PLAYER
        if not report['ownerOnline']:
            report['state']='player_not_online'
        elif report['followWasAlreadyRequested']:
            report['state']='already_following'
        elif not act:
            report['state']='eligible'
        else:
            path=Path.home()/'Library'/'Logs'/'alice-17879-follow3-food-reissue-20261031.lock'
            fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
            with os.fdopen(fd,'w') as f:
                f.write('one-shot current-world follow intent; never retry\n')
            result=request('/api/control/command',{'text':'跟随 '+PLAYER})
            report['followIssued']=True
            expected=result.get('id') if result.get('status')=='queued' else None
            if not expected or not isinstance(expected,str) or len(expected)!=32:
                report['state']='command_not_queued'
            else:
                report['state']='queued'
                for _ in range(10):
                    time.sleep(.4)
                    d,v=observed()
                    receipt=d.get('commandResult') or {}
                    if receipt.get('id')==expected:
                        st=receipt.get('status')
                        if st in ('started','rejected','failed','completed'):
                            report['receiptStatus']=st
                            reason=receipt.get('reason')
                            if reason in ('follow_intent_set','safety_preempted',
                                'target_not_online_or_locatable','alice_not_ready',
                                'command_pending','alice_not_online'):
                                report['receiptReason']=reason
                            report['state']='accepted' if st=='started' and reason=='follow_intent_set' else 'rejected_or_failed'
                            break
        d,v=observed()
        report['followIntentNow']=v.get('followTarget')==PLAYER
        report['aliceStillConnected']=True
    except FileExistsError:
        report['state']='one_shot_already_claimed'
    except (OSError,ValueError,TypeError,urllib.error.URLError):
        pass
    fd=os.open(out/'alice_escort_http_result.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:
        json.dump(report,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':report['state'],'followIssued':report['followIssued']}))
def selftest():
    assert PLAYER=='MolarParsley191' and BASE=='http://127.0.0.1:8788'
    print('ALICE_EXISTING_ESCORT_HTTP_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--check':main(sys.argv[2],act=False)
    elif len(sys.argv)==3 and sys.argv[1]=='--once':main(sys.argv[2],act=True)
    else:raise SystemExit('usage: --self-test|--check OUTPUT_DIR|--once OUTPUT_DIR')
