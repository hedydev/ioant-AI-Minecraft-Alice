import { isStatusQuery, actionDescription, relevantAction } from './social_policy.js';

const isoNow=()=>Date.now();
const MAX_PENDING=24;
const AGE=120000;

export class AliceActivity {
  constructor(agent) {
    this.agent=agent;
    this.pending=[];
    this.active=null;
    this.lastTask=null;
    this.currentAction=null;
    this.lastSafety=null;
    this.enabled=false;
    this.autonomousAction=null;
    this.originalStart=null;
    this.originalEnd=null;
    this.originalError=null;
  }
  start() {
    if (this.enabled) return;
    const core=this.agent.aliceCore;
    if (!core) throw new Error('AliceActivity requires AliceCore');
    this.originalStart=core.onActionStart;
    this.originalEnd=core.onActionEnd;
    this.originalError=core.onActionError;
    const self=this;
    core.onActionStart=function(label) {
      self.noteStarted(label);
      return self.originalStart?.call(this,label);
    };
    core.onActionEnd=function(label,result) {
      self.noteEnded(label,result);
      return self.originalEnd?.call(this,label,result);
    };
    core.onActionError=function(label,error) {
      self.noteEnded(label,{error:String(error)});
      return self.originalError?.call(this,label,error);
    };
    this.enabled=true;
  }
  stop() {
    if (!this.enabled) return;
    const core=this.agent.aliceCore;
    core.onActionStart=this.originalStart;
    core.onActionEnd=this.originalEnd;
    core.onActionError=this.originalError;
    this.enabled=false;
  }
  markAutonomousAction(label) {
    this.autonomousAction={label,at:Date.now()};
  }
  notePlayerMessage(sender,message) {
    const action=relevantAction(message);
    if (!action || isStatusQuery(message)) return;
    const now=isoNow();
    this.pending=this.pending.filter(p=>now-p.at<=AGE);
    // Both Mineflayer's raw chat event and Mindcraft's handleMessage may
    // forward the same message. Record the intent only once.
    const last=this.pending.at(-1);
    if (last?.sender===String(sender) && last?.message===String(message).slice(0,160) &&
        now-last.at<2000) return;
    this.pending.push({action,sender:String(sender),message:String(message).slice(0,160),at:now});
    this.pending=this.pending.slice(-MAX_PENDING);
  }
  noteStarted(label) {
    const now=isoNow();
    const name=String(label||'').replace(/^(?:action|mode):/,'');
    if (!label) return;
    if (name==='aliceSafety' || String(label).startsWith('mode:')) {
      this.lastSafety={label,sender:null,kind:'autonomous',at:now};
      this.currentAction=this.lastSafety;
      return;
    }
    if (this.autonomousAction?.label===label && now-this.autonomousAction.at<3000) {
      this.autonomousAction=null;
      this.active={label,sender:null,kind:'autonomous',at:now};
      this.currentAction=this.active;
      this.lastTask=this.active;
      return;
    }
    // Attribute only a matching, recent command; never use last_sender as proof.
    let matches=[name];
    if (name==='collectBlocks' || name==='collectWood') matches.push('aliceCollectWood');
    if (name==='aliceCollectWood') matches.push('collectBlocks','collectWood');
    const index=this.pending.findLastIndex(p=>matches.includes(p.action) && now-p.at<=AGE);
    const order=index>=0 ? this.pending.splice(index,1)[0] : null;
    this.active={label,sender:order?.sender||null,kind:order?'player':'unverified',
      sourceMessage:order?.message||null,at:now};
    this.currentAction=this.active;
    this.lastTask=this.active;
  }
  noteEnded(label,result={}) {
    if (this.currentAction?.label===label) this.currentAction=null;
    if (this.active?.label===label && !String(label).includes('followPlayer')) this.active=null;
    if (result?.error) console.warn('[Alice activity] task error: '+String(result.error));
  }
  snapshot() {
    const agent=this.agent,core=agent.aliceCore;
    const label=agent.actions?.executing ? agent.actions.currentActionLabel : '';
    const isSafety=label==='mode:aliceSafety' || ['SURVIVE','GUARD','COMBAT'].includes(core?.state);
    const running=label ? (this.currentAction?.label===label ? this.currentAction : null) : null;
    const follow=core?.intent?.type==='FOLLOW';
    const source=running?.sender || (follow && this.active?.label==='action:followPlayer' ? this.active.sender:null);
    const activity=actionDescription(label,core?.state);
    let purpose=activity;
    if (label==='action:followPlayer' && core?.intent?.data?.playerName)
      purpose+=' '+core.intent.data.playerName;
    if (label==='action:aliceCollectWood' && core?.taskProgress?.label===label)
      purpose+='（已收集 '+core.taskProgress.collected+'/'+core.taskProgress.target+'）';
    if (isSafety) purpose=(core.state==='SURVIVE'?'撤退保命':core.state==='GUARD'?'保护玩家':'应对怪物');
    let detail='';
    if (isSafety && this.lastTask && !String(this.lastTask.label).startsWith('mode:'))
      detail='，之前在'+actionDescription(this.lastTask.label);
    if (!label && core?.state==='FOLLOW' && follow)
      purpose='正在准备继续跟随 '+(core.intent.data.playerName||'玩家');
    if (!label && core?.state==='IDLE')
      purpose='现在没有执行任务，在附近休息观察';
    return {
      state:core?.state||'IDLE',label,description:purpose,
      sender:isSafety?null:source,sourceKnown:Boolean(source),
      kind:isSafety?'autonomous':running?.kind||'unverified',detail
    };
  }
  answer() {
    const s=this.snapshot();
    if (s.kind==='autonomous')
      return '我正在'+s.description+'，这是我自己发起的行动'+s.detail+'。';
    if (s.sourceKnown)
      return '我正在'+s.description+'，是 '+s.sender+' 让我做的。';
    if (s.state==='IDLE' && !s.label) return '我暂时没在做任务，正四处看看。有事喊我就行～';
    return '我正在'+s.description+'。这项任务是谁下达的暂时无法确认。';
  }
}
