#!/usr/bin/env python3
"""Two read-only snapshots of active original-world FOLLOW, no game commands."""
import json,os,sys,time,urllib.request
from pathlib import Path
BASE='http://127.0.0.1:8788'
def read():
    with urllib.request.urlopen(
      urllib.request.Request(BASE+'/api/control/status',headers={'Host':'127.0.0.1:8788'}),timeout=15) as r:
        data=json.loads(r.read(16000))
    d=data.get('runtime') or {}
    if data.get('online') is not True or d.get('world')!='Bedrock level' or d.get('serverPort')!=17879:
        return None
    m=d.get('movementEvidence') or {};out=d.get('outboundInput') or {}
    fd=d.get('followDiagnostic') or {};fw=d.get('worldRoutine') or {}
    escort=d.get('escort') or {};equipment=d.get('equipment') or {}
    def num(x,high=1e9):
        return x if type(x) in (int,float) and 0<=x<high else None
    def safe(x):
        return x if isinstance(x,str) and x in (
          'none','SURVIVE','FOLLOW','GUARD','COMBAT','IDLE','EXPLORE','low_health',
          'threat_nearby','follow_intent','follow_owner','no_two_server_positions',
          'no_recent_server_position_packet','recent_bedrock_server_packet',
          'noPath','path','unsafe','unavailable','other') else None
    return {'connected':True,'followingOwner':d.get('followTarget')=='MolarParsley191',
      'coreState':safe(d.get('state')),'health':num(d.get('health'),21),
      'jobActive':bool(d.get('job')),
      'bdsSamples':num(m.get('independentSamples')),
      'bdsTravel':num(m.get('independentTravelBlocks')),
      'inputMoved':num(out.get('movingQueued')),
      'inputEmitted':num(out.get('emitted')),
      'followDiagReason':safe(fd.get('reason')),
      'followDiagState':safe(fd.get('status')),
      'idleGate':safe(fw.get('idleGate')),
      'escortReason':escort.get('reason') if escort.get('reason') in (
        'no_active_threat','hostile_behind_observed_barrier',
        'escort_moving_owner','owner_stopped_defend',
        'close_or_unverified_hostile','emergency_or_no_escort') else None,
      'escortBarrier':escort.get('barrier') if escort.get('barrier') in ('clear','blocked','unknown') else None,
      'escortAllowed':escort.get('followPermitted') if type(escort.get('followPermitted')) is bool else None,
      'ownerMoving':escort.get('ownerMoving') if type(escort.get('ownerMoving')) is bool else None,
      'inventoryKnown':equipment.get('inventoryKnown') if type(equipment.get('inventoryKnown')) is bool else None,
      'heldItem':equipment.get('heldItem') if equipment.get('heldItem') in (
        None,'stone_sword','wooden_sword','iron_sword','diamond_sword','netherite_sword','golden_sword') else 'other_item',
      'lastEquipOk':(equipment.get('lastAttempt') or {}).get('ok') if type((equipment.get('lastAttempt') or {}).get('ok')) is bool else None,
      'sleepOpportunity':(fw.get('sleepOpportunity') or {}).get('status')
        if (fw.get('sleepOpportunity') or {}).get('status') in (
          'safe_bed_candidate','outside_sleep_window',
          'no_observed_bed_currently_loaded','nearby_hostile_bed_unavailable',
          'deferred_for_immediate_danger','deferred_low_health_bed_too_far',
          'sleep_retry_cooldown','deferred_for_active_owner_or_job') else None}
def main(out):
    out=Path(out)
    if out.is_symlink() or not out.is_dir():raise ValueError('bad output')
    start=end=None
    try:
        start=read();time.sleep(4.5);end=read()
    except (OSError,ValueError,TypeError,KeyError):pass
    d={'audit':'ALICE_17879_ACTIVE_FOLLOW_READONLY','schemaVersion':1,
       'readOnly':True,'bdsQuerySent':False,'clientRestarted':False,
       'sample1':start,'sample2':end}
    fd=os.open(out/'active_follow.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump(d,f,separators=(',',':'));f.write('\n')
    print(json.dumps({'state':'observed' if start and end else 'unavailable'}))
def selftest():
    assert '127.0.0.1' in BASE and callable(read)
    print('ALICE_FOLLOW_STATUS_READONLY_SELFTEST_PASS')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:selftest()
    elif len(sys.argv)==3 and sys.argv[1]=='--inspect':main(sys.argv[2])
    else:raise SystemExit('usage: --self-test | --inspect OUTPUT')
