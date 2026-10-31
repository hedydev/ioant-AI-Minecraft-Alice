'use strict'
// A strict filesystem mailbox for the localhost-only Mac dashboard.
// Console operator != Minecraft player. No arbitrary chat, shell, OP, JS,
// teleport, world edit or LLM fallback. All actions are typed/allowlisted.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const rootDefault=()=>path.join(os.homedir(),'.alice-bedrock-control')
const {selectProbeRoute}=require('./operator_step_probe.cjs')
const {scoutStartProof}=require('./scout_start_proof.cjs')
const ID=/^[a-f0-9]{32}$/,PLAYER=/^[A-Za-z0-9_]{3,16}$/
const ACTIONS=new Set(['stop','follow','guard','gather_wood','craft_sword','eat','status','probe_step'])
const STATUS=new Set(['received','started','completed','failed','rejected'])
function cleanCommand(x,now=Date.now()){
  if(!x||typeof x!=='object'||Array.isArray(x)||
     typeof x.id!=='string'||!ID.test(x.id)||
     !Number.isSafeInteger(x.createdAt)||Math.abs(now-x.createdAt)>30000||
     !ACTIONS.has(x.action))return null
  const keys=Object.keys(x).sort().join(',')
  const expected=['id','createdAt','action',
    ...(x.target!==undefined?['target']:[]),...(x.count!==undefined?['count']:[])].sort().join(',')
  if(keys!==expected)return null
  if((x.action==='follow'||x.action==='guard')?
     (!PLAYER.test(x.target||'')||x.count!==undefined):
     x.target!==undefined)return null
  if(x.action==='gather_wood'?
     (x.count!==undefined&&(!Number.isInteger(x.count)||x.count<1||x.count>32)):
     x.count!==undefined)return null
  return x
}
function secureRead(file){
  const st=fs.lstatSync(file,{throwIfNoEntry:false})
  if(!st)return null
  if(!st.isFile()||st.isSymbolicLink()||st.size>4096)throw Error('unsafe_console_control_file')
  return JSON.parse(fs.readFileSync(file,'utf8'))
}
function atomic(root,name,obj){
  if(fs.lstatSync(root,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_console_root')
  fs.mkdirSync(root,{recursive:true,mode:0o700})
  const target=path.join(root,name)
  if(fs.lstatSync(target,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('unsafe_console_result')
  const content=JSON.stringify(obj)
  if(Buffer.byteLength(content)>2048)throw Error('console_result_too_large')
  const tmp=path.join(root,'.command-result-'+process.pid+'.tmp')
  fs.writeFileSync(tmp,content,{mode:0o600,flag:'w'})
  fs.renameSync(tmp,target)
}
const safeReason=s=>typeof s==='string'&&/^[a-z][a-z0-9_]{0,70}$/.test(s)?s:'task_failed'
const findPlayer=(bot,name)=>Object.entries(bot.players||{})
  .find(([n,p])=>n.toLowerCase()===name.toLowerCase()&&p?.entity?.position)
function runCommand(runtime,command,report){
  const action=command.action,bot=runtime.bot,core=runtime.core
  const response=(status,reason,message)=>({status,reason,message,action})
  if(!ACTIONS.has(action))return response('rejected','unsupported_command','不支持该指令')
  if(runtime.closed||!runtime.seenSpawn)
    return response('rejected','alice_not_online','Alice 未连接，无法执行指令')
  // STOP must be available even if inventory and health have not yet fully
  // synced. It also outranks a queued ordinary command in the Python mailbox.
  if(action==='stop'){
    runtime.cancelActive('stop from console');runtime.goalPlanner.halt()
    core.stop('console stop');runtime.lastGuardedPlayer=null
    return response('completed','stopped','已停止可取消的任务与跟随；紧急安全行为仍受保护')
  }
  if(!runtime.ready())
    return response('rejected','alice_not_ready','Alice 尚未完成生命/背包同步，暂不执行该任务')
  if(action==='status')return response('completed','status_available',
    String(core.state||'unknown').slice(0,32)+' · '+(runtime.action?.label||'空闲'))
  if(action==='follow'||action==='guard'){
    if(!PLAYER.test(command.target||''))return response('rejected','missing_target',
      '控制台没有游戏角色；必须指定目标玩家')
    const selected=findPlayer(bot,command.target)
    if(!selected)return response('rejected','target_not_online_or_locatable',
      '目标玩家不在线或当前位置不可验证，不会建立跟随意图')
    if(selected[0].toLowerCase()===String(bot.username||'').toLowerCase())
      return response('rejected','cannot_follow_self','Alice 不能将自己设为跟随目标')
    // An explicit verified ONLINE target can be saved while danger is nearby.
    // Accepting a FOLLOW intent is NOT permission to walk through danger or
    // interrupt an emergency retreat. Runtime escort checks control movement.
    const player=selected[0]
    if(!runtime.safetyBusy)runtime.cancelActive('explicit console '+action)
    runtime.ownerMotion?.reset?.()
    runtime.refreshBehavior()
    core.setFollowIntent(player,runtime.liveBehavior.settings.followDistance)
    runtime.followSource='console';runtime.lastFollowEnd=null
    runtime.lastGuardedPlayer=action==='guard'?player:null
    runtime.lastHumanAt=runtime.clock()
    return response('started','follow_intent_set',
      '已接受'+(action==='guard'?'保护':'跟随')+'目标 '+player+'；将依照障碍、近身威胁和服务器坐标安全行动')
  }
  if(bot.isSleeping||runtime.threat()||runtime.safetyBusy||bot.health<14)
    return response('rejected','safety_preempted','当前睡眠或有危险；任务未启动')
  if(runtime.job)return response('rejected','job_in_progress','Alice 正在执行任务；请先停止')
  if(action==='probe_step'){
    if(core.hasFollowIntent?.())return response('rejected','follow_intent_active','当前存在跟随意图，禁止试走抢占控制权')
    const proof=scoutStartProof(bot,runtime.movementEvidence,runtime.clock)
    if(!proof.ok)return response('rejected',proof.reason,'未获得两次新鲜且对齐的 BDS 位置，不启动试走')
    const route=selectProbeRoute(bot)
    if(!route.candidate)return response('rejected',route.reason,'附近未验证出安全的两格平地试走路线')
    const candidate=route.candidate
    runtime.lastHumanAt=runtime.clock()
    runtime.nextIdleAt=Math.max(runtime.nextIdleAt,
      runtime.clock()+runtime.p.autonomy_policy.AUTONOMY_GRACE_MS)
    runtime.startJob('EXPLORE','控制台',async signal=>{
      const result=await runtime.boundedScout(candidate,signal,{allowNightFallback:true})
      const ok=result?.serverMovementVerified===true
      report(ok?'completed':'failed',ok?'server_verified_scout_endpoint':
        safeReason(result?.reason),'试走 '+(ok?'服务端移动已验证':'未获得实际移动确认'))
      return result
    },{label:'两格安全试走',announce:false})
    if(!runtime.job)return response('rejected','probe_start_denied','试走未能通过生存与导航检查')
    const dest=candidate.target
    return response('started','probe_route_started',
      '已选择附近坐标 '+[dest.x,dest.y,dest.z].join(',')+'；2格安全步行，等待 BDS 见证')
  }
  const label=action==='gather_wood'?'收集原木':action==='craft_sword'?
    '制作木剑':'安全进食'
  const count=command.count||1
  const perform=async signal=>{
    try{
      const result=action==='gather_wood'?await runtime.gatherCount(count,signal):
        action==='craft_sword'?await runtime.craftWeaponOrTable('wooden_sword',signal):
        await runtime.ops.eatIfSafe({signal,underThreat:!!runtime.threat()})
      // A STOP/priority preemption invalidates task outcomes; do not report
      // completion of a job that was cancelled mid-flight.
      if(signal.aborted){
        report('failed','task_cancelled',label+'已取消，未确认完成')
        return {ok:false,reason:'task_cancelled'}
      }
      report(result?.ok?'completed':'failed',
        result?.ok?'task_confirmed':safeReason(result?.reason),
        result?.ok?label+'已完成（以游戏反馈为准）':label+'未完成：'+safeReason(result?.reason))
      return result
    }catch{
      report('failed','task_error',label+'执行遇到异常')
      throw Error('console_task_failed')
    }
  }
  runtime.lastHumanAt=runtime.clock()
  runtime.nextIdleAt=Math.max(runtime.nextIdleAt,
    runtime.clock()+runtime.p.autonomy_policy.AUTONOMY_GRACE_MS)
  runtime.startJob(action==='gather_wood'?'GATHER':action==='craft_sword'?'CRAFT':'RECOVER',
    '控制台',perform,{label,announce:false})
  if(!runtime.job)return response('rejected','job_start_denied','任务未能启动')
  return response('started','job_started',label+'已经启动，等待完成回执')
}
class CommandMailbox{
  constructor({root=rootDefault(),runtime,clock=Date.now,log=console}={}){
    this.root=root;this.runtime=runtime;this.clock=clock;this.log=log
    this.busy=false;this.lastId=null;this.lastError=null
  }
  receipt(command,status,reason,message){
    if(!STATUS.has(status))throw Error('invalid_receipt_status')
    const r={id:command.id,action:command.action,status,
      reason:safeReason(reason),message:String(message||'').slice(0,150),updatedAt:this.clock()}
    const older=secureRead(path.join(this.root,'command-result.json'))
    if(older&&older.id!==command.id&&status!=='received')return false
    atomic(this.root,'command-result.json',r)
    return true
  }
  async poll(){
    if(this.busy)return
    this.busy=true
    try{
      if(fs.lstatSync(this.root,{throwIfNoEntry:false})?.isSymbolicLink())
        throw Error('unsafe_console_root')
      const raw=secureRead(path.join(this.root,'command.json'))
      if(!raw||raw.id===this.lastId)return
      const prior=secureRead(path.join(this.root,'command-result.json'))
      if(prior?.id===raw.id){this.lastId=raw.id;return}
      const command=cleanCommand(raw,this.clock())
      if(!command){
        // An untrusted malformed record is never executed.
        this.lastId=typeof raw.id==='string'?raw.id:null
        return
      }
      this.lastId=command.id
      this.receipt(command,'received','received','Alice 已收到指令，正在验证')
      const result=runCommand(this.runtime,command,(status,reason,message)=>{
        try{this.receipt(command,status,reason,message)}catch(e){
          this.log.warn('[Alice control] command completion unavailable:',e.message)}
      })
      this.receipt(command,result.status,result.reason,result.message)
      this.log.log('[Alice control] typed command result:',
        JSON.stringify({action:command.action,status:result.status,reason:result.reason}))
    }catch(e){
      if(this.lastError!==e.message)this.log.warn('[Alice control] command mailbox unavailable:',e.message)
      this.lastError=e.message
    }finally{this.busy=false}
  }
}
module.exports={CommandMailbox,runCommand,cleanCommand,findPlayer}
