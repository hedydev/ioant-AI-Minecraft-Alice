#!/usr/bin/env python3
"""Read bounded installed native interaction sources; no game or model invocation."""
import hashlib,inspect,json,os,re,shlex,subprocess,sys
from pathlib import Path

def read_plugins(root):
    root=Path(root)
    if root.is_symlink() or not root.is_dir():raise ValueError('plugin_root')
    rows=[];remaining=24000
    for file in sorted(root.glob('*.js'))[:128]:
        if file.is_symlink() or not file.is_file() or file.stat().st_size>100000:continue
        if not file.resolve().is_relative_to(root.resolve()):raise ValueError('plugin_escape')
        raw=file.read_bytes();text=raw.decode('utf-8');lines=text.splitlines()
        hits=[i for i,line in enumerate(lines) if re.search(r'(function activateBlock|activateBlock\s*=|_genericPlace\s*=|async function sleep|bot\.sleep\s*=|player_permission|update_abilities|adventure_settings)',line)]
        if file.name=='interact.js':hits=[0]+hits
        if not hits:continue
        selected=set()
        for index in hits[:4]:selected.update(range(max(0,index-8),min(len(lines),index+150)))
        snippet='\n'.join(str(i+1)+': '+lines[i] for i in sorted(selected))[:min(remaining,14000)]
        rows.append({'plugin':file.name,'sha256':hashlib.sha256(raw).hexdigest(),'source':snippet})
        remaining-=len(snippet)
        if remaining<=0 or len(rows)>=6:break
    return rows

def interaction_policy(home):
    file=Path(home)/'minecraft-bedrock/server.properties'
    result={'verifiedOriginalServer':False,'defaultPlayerPermission':'unknown','gameMode':'unknown'}
    if file.is_symlink() or not file.is_file() or file.stat().st_size>10000:return result
    props={}
    for line in file.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#') or '=' not in line:continue
        key,value=line.split('=',1);key=key.strip();value=value.strip()
        if key in props:return result
        props[key]=value
    if props.get('server-port')!='17879' or props.get('level-name')!='Bedrock level':return result
    result['verifiedOriginalServer']=True
    if props.get('default-player-permission-level') in ('visitor','member','operator'):
        result['defaultPlayerPermission']=props['default-player-permission-level']
    if props.get('gamemode') in ('survival','creative','adventure','spectator'):
        result['gameMode']=props['gamemode']
    return result

def mapping_sources(base):
    base=Path(base);rows=[];budget=14000
    for package in ('prismarine-registry','prismarine-block','prismarine-chunk'):
        root=base/package
        if not root.is_dir() or root.is_symlink():continue
        files=sorted(root.glob('*.js'))+sorted((root/'lib').rglob('*.js'))+sorted((root/'src').rglob('*.js'))
        for file in files[:100]:
            if not file.is_file() or file.is_symlink() or file.stat().st_size>100000:continue
            if not file.resolve().is_relative_to(root.resolve()):continue
            text=file.read_text();lines=text.splitlines()
            hits=[i for i,line in enumerate(lines) if re.search('fnv|hashedRuntime|blocksByRuntimeId|stateIdTo|blockMappings|block_network_ids_are_hashes|handleStartGame',line,re.I)]
            if not hits:continue
            selected=set()
            for i in hits[:8]:selected.update(range(max(0,i-15),min(len(lines),i+65)))
            source='\n'.join(str(i+1)+': '+lines[i] for i in sorted(selected))[:min(budget,5000)]
            rows.append({'plugin':str(file.relative_to(base)),'sha256':hashlib.sha256(text.encode()).hexdigest(),'source':source})
            budget-=len(source)
            if budget<=0 or len(rows)>=7:return rows
    return rows

NODE_REGISTRY=r'''
const {createRequire}=require('node:module'),path=require('node:path');
const req=createRequire(path.join(process.cwd(),'package.json'));
let registry=null,requested=null;
for(const version of ['bedrock_1.26.51','bedrock_1.26.50']){
 try{registry=req('prismarine-registry')(version);requested=version;break}catch{}
}
if(!registry)throw Error('installed_registry_unavailable');
const block=registry.blocksByName?.spruce_door;
const samples=[];
if(Number.isSafeInteger(block?.minStateId))for(const stateId of [block.minStateId,block.minStateId+1]){
 const state=registry.blockStates?.[stateId],byId=registry.blocksByStateId?.[stateId];
 samples.push({stateId,networkId:state?.network_id??state?.networkId??null,
  stateKeys:state?Object.keys(state).slice(0,15):[],
  registryBlockKeys:byId?Object.keys(byId).filter(k=>/id|state|network|hash/i.test(k)).slice(0,15):[],
  stateExcerpt:state?JSON.stringify(state).slice(0,800):null});
}
console.log(JSON.stringify({requested,loadedVersion:registry.version?.minecraftVersion,
 registryKeys:Object.keys(registry).filter(k=>/block|hash|runtime/i.test(k)).slice(0,25),
 spruceDoor:block?{id:block.id,minStateId:block.minStateId,maxStateId:block.maxStateId}:null,samples}));
'''
REMOTE="import hashlib,json,re,subprocess\nfrom pathlib import Path\n"+inspect.getsource(read_plugins)+'\n'+inspect.getsource(interaction_policy)+'\n'+inspect.getsource(mapping_sources)+"\nbase=Path.home()/'minecraft-ai/bedrock-native/experiment/node_modules'\nnode=Path.home()/'.local/share/alice-bedrock/node24/current/bin/node'\np=subprocess.run([str(node),'-'],input="+repr(NODE_REGISTRY)+",cwd=base.parent,capture_output=True,text=True,timeout=15,check=False)\nregistry=json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<6000 else {'state':'unavailable'}\nprint(json.dumps({'plugins':mapping_sources(base),'serverInteractionPolicy':interaction_policy(Path.home()),'installedRegistry':registry}))\n"
def run(folder):
    if folder.is_symlink() or not folder.is_dir():raise ValueError('output')
    p=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o','ConnectTimeout=8','tedz@192.168.0.104','/usr/bin/python3 -c '+shlex.quote(REMOTE)],
      capture_output=True,text=True,timeout=25,check=False)
    report=json.loads(p.stdout) if p.returncode==0 and len(p.stdout)<40000 else None
    if not isinstance(report,dict) or set(report)!={'plugins','serverInteractionPolicy','installedRegistry'} or not isinstance(report['plugins'],list):raise ValueError('dependency_read_unavailable')
    fd=os.open(folder/'native_interaction_source.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:json.dump({'readOnly':True,'gameCommandSent':False,**report},f)
    print(json.dumps({'state':'observed','plugins':len(report['plugins'])}))
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:compile(REMOTE,'<native-plugin-read>','exec');print('ALICE_INTERACTION_SOURCE_READONLY_PASS')
    elif len(sys.argv)==3 and sys.argv[1]=='--read':run(Path(sys.argv[2]))
    else:raise SystemExit('usage: --self-test | --read OUTPUT_DIR')
