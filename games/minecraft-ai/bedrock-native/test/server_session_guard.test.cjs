'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {assertBdsSessionReleased,sessionStatus,readTail}=require('../server_session_guard.cjs')
const UUID='a5a0753061f5456e95ef63fad1d5a0fb'
function withLog(lines,fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alice-session-log-'))
 const log=path.join(root,UUID+'.log')
 fs.writeFileSync(log,lines.join('\n')+'\n',{mode:0o600})
 const env={ALICE_BEDROCK_BDS_SESSION_LOG:log,ALICE_BEDROCK_BDS_GAMERTAG:'hedygame7231'}
 try{return fn({root,log,env})}finally{fs.rmSync(root,{recursive:true,force:true})}
}
const line=(time,action,name='hedygame7231')=>
 '['+time+' INFO] Player '+action+': '+name+(action==='Spawned'?' xuid: PRIVATE_XUID, pfid: PRIVATE_PFID':', xuid: PRIVATE_XUID, pfid: PRIVATE_PFID')
test('latest BDS disconnect permits next login only with explicitly configured recent log',()=>withLog([
 line('2026-10-19 23:18:42:441','connected'),line('2026-10-19 23:18:46:072','Spawned'),
 line('2026-10-19 23:36:58:495','disconnected')
],({root,env,log})=>{
 const d=assertBdsSessionReleased(env,{dir:root,now:()=>fs.statSync(log).mtimeMs+1000})
 assert.equal(d.status,'last_bds_event_disconnected')
 assert.equal(d.eventsSeen,3)
 assert(!JSON.stringify(d).includes('PRIVATE_'))
}))
test('BDS connected/spawned without later disconnect blocks new client login',()=>withLog([
 line('2026-10-19 23:18:42:441','connected'),line('2026-10-19 23:18:46:072','Spawned')
],({root,env,log})=>{
 assert.throws(()=>assertBdsSessionReleased(env,{dir:root,now:()=>fs.statSync(log).mtimeMs}),/still records .* ONLINE/)
}))
test('other player disconnect cannot clear Alice session',()=>withLog([
 line('2026-10-19 23:18:42:441','connected'),
 line('2026-10-19 23:18:59:495','disconnected','AnotherPlayer')
],({root,env,log})=>{
 assert.throws(()=>assertBdsSessionReleased(env,{dir:root,now:()=>fs.statSync(log).mtimeMs}),/ONLINE/)
}))
test('missing, stale, and incomplete data fail closed when configured',()=>withLog([
 '[2026-10-19 23:18:40:001 INFO] Running AutoCompaction...'
],({root,env,log})=>{
 assert.throws(()=>assertBdsSessionReleased(env,{dir:root,now:()=>fs.statSync(log).mtimeMs}),/no verified prior/)
 fs.writeFileSync(log,line('2026-10-19 23:36:58:495','disconnected')+'\n')
 assert.throws(()=>assertBdsSessionReleased(env,{dir:root,now:()=>fs.statSync(log).mtimeMs+31*60*1000}),/stale/)
 assert.throws(()=>assertBdsSessionReleased({ALICE_BEDROCK_BDS_GAMERTAG:'hedygame7231'},{dir:root}),/requires both/)
 assert.equal(assertBdsSessionReleased({}).status,'unconfigured')
}))
test('read-only guard refuses symlinks and wrong instance directories',()=>withLog([
 line('2026-10-19 23:36:58:495','disconnected')
],({root,env,log})=>{
 const link=path.join(root,'f47570d73e6040db8327e6cbb7e8edef.log')
 fs.symlinkSync(log,link)
 assert.throws(()=>assertBdsSessionReleased({...env,ALICE_BEDROCK_BDS_SESSION_LOG:link},{dir:root}),/symlink/)
 assert.throws(()=>assertBdsSessionReleased(env,{dir:root+'/other'}),/one explicit/)
}))
test('parser ignores chat, other players, and identity metadata; reads bounded tail',()=>withLog([
 '[2026-10-19 22:11:01:111 INFO] Player chat: hedygame7231 disconnected',
 line('2026-10-19 23:18:42:441','connected'),
 line('2026-10-19 23:36:58:495','disconnected')
],({log})=>{
 const data=readTail(log)
 assert.equal(sessionStatus(data.text,'hedygame7231').latest,'disconnected')
 assert.equal(sessionStatus(data.text,'AnotherPlayer').eventsSeen,0)
}))
