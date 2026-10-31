'use strict';
// Canvas software 3D voxel renderer: orthographic camera with real X/Y/Z,
// draggable orbit and zoom. No WebGL dependency or external network requests.
(()=>{
const byId=id=>document.getElementById(id);
const canvas=byId('world-canvas');if(!canvas)return;
const ctx=canvas.getContext('2d');if(!ctx){byId('world-connection').textContent='此浏览器不支持 Canvas';return}
let frame=null,angle=.66,pitch=.65,zoom=1,follow=true,anchor=null,hideRoof=false;
let cameraOffsetX=0,cameraOffsetY=0,lastDrawAt=0,dragging=false,scenePan=null;
let previous=null,target=null,animationAt=0,requestBusy=false,refreshTimer=null,drawId=null;
let commandTimer=null,commandReadBusy=false,commandBusy=false,commandOnline=false;
let timelineSignature=null,timelinePointerActive=false;
let lastCommandId=null,pendingModeRevision=null,modelBusy=false;
let positionBlocked=false,positionBlockedNote='';
const commandIsLocal=['127.0.0.1','localhost'].includes(location.hostname);
function showCommandResult(message,kind=''){
  const el=byId('world-command-result');
  el.textContent=message;
  el.className='world-command-result'+(kind?' '+kind:'');
}
function disableCommandControls(){
  const ready=commandIsLocal&&commandOnline&&!commandBusy;
  byId('world-command-text').disabled=!ready;
  byId('world-command-send').disabled=!ready;
  byId('world-command-target').disabled=!ready;
  byId('world-quick-follow').disabled=!ready||!byId('world-command-target').value;
  byId('world-quick-guard').disabled=!ready||!byId('world-command-target').value;
  byId('world-quick-stop').disabled=!ready;
  byId('world-mode-autonomous').disabled=!ready;
  byId('world-mode-companion').disabled=!ready;
}
async function refreshCommandState(){
  if(!isWorldPage()||commandReadBusy)return;
  commandReadBusy=true;
  try{
    const res=await fetch('/api/control/status',{cache:'no-store'});
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'HTTP '+res.status);
    const online=data.online===true&&data.runtime;
    const run=online?data.runtime:null;
    commandOnline=!!online;
    const routine=run?.worldRoutine||{};
    const phase={day:'☀️ 白天',dusk:'🌆 黄昏',night:'🌙 夜晚',dawn:'🌅 黎明'};
    const weather={clear:'☀️ 晴朗',rain:'🌧️ 下雨',thunder:'⛈️ 雷暴'};
    setText('world-day-phase',run?phase[routine.phase]||'❔ 时间未知':'—');
    setText('world-day-weather',run?weather[routine.weather]||'❔ 天气未知':'—');
    const gate=routine.idleGate;
    const gateLabels={
      companion_mode:'队友模式：不会自动开始自主任务',
      autonomy_disabled:'自主任务已关闭',
      human_stop:'收到玩家 STOP 后暂停自主行动',
      sync_incomplete:'血量、背包或角色生成信息尚未可信同步',
      sleeping:'Alice 正在睡觉',
      job_active:'存在执行中的任务',
      safety_busy:'安全控制器正在处理危险',
      threat_nearby:'附近存在威胁，安全优先',
      low_health:'生命不足 14，暂停资源工作',
      follow_intent:'当前正在跟随玩家',
      vertical_hold:'检测到垂直坠落风险',
      post_threat_window:'刚脱离危险，等待安全窗口',
      non_idle_state:'当前不是空闲状态',
      startup_observation_pending:'等待出生点附近的可信地图和位置证据',
      position_witness_unverified:'BDS 坐标见证缺失或过期，禁止无证据移动',
      human_grace_period:'玩家指令优先期内暂停自主工作',
      work_cooldown:'任务工作冷却中',
      eligible_for_work:'已通过基本门禁，等待下一轮任务规划'
    };
    const idleHold=routine.idleHold;
    const holdAge=Number.isFinite(idleHold?.at)?Date.now()-idleHold.at:null;
    const recentHold=holdAge!==null&&holdAge>=0&&holdAge<180000?
      idleHold.reason:null;
    const positionHold=new Set(['scout_bds_position_unavailable',
      'no_fresh_authoritative_self_position','server_position_unconfirmed',
      'bds_witness_stale']);
    positionBlocked=run?.state==='IDLE'&&(
      gate==='position_witness_unverified'||positionHold.has(recentHold));
    positionBlockedNote=positionHold.has(recentHold)?
      '服务器坐标见证缺失':'BDS 独立坐标见证未验证';
    // Earlier Mint releases do not publish idleGate. Their recent idleHold
    // is still a real reason from the task controller, not an inference.
    const holdLabels={
      scout_bds_position_unavailable:'缺少新鲜 BDS 坐标证据，探索/采集被安全门禁阻止',
      no_fresh_authoritative_self_position:'自身服务器坐标证据已过期',
      server_position_unconfirmed:'服务器坐标未确认，不能安全开始移动采集',
      bds_witness_stale:'BDS 独立坐标见证已过期',
      startup_terrain_sync_pending:'等待出生点可信地形信息'};
    const reason=recentHold?(holdLabels[recentHold]||recentHold):null;
    const gateText=gateLabels[gate]||'运行版本未提供门禁诊断';
    setText('world-idle-reason',!run?'⏳ Alice 状态不可用':
      run.state!=='IDLE'?'✅ 非 IDLE：'+run.state:
      positionBlocked?'⛔ IDLE · 安全门禁阻止寻路：'+positionBlockedNote+
        '。不会将客户端预测位移当作 BDS 真值。':
      '⏸️ IDLE：'+(reason||gateText)+
      (gate&&reason?' · 当前门禁：'+gateText:'')+
      (reason?' · 最近已记录的任务受阻原因':''));
    const agent=run?.agent||{};
    modelBusy=agent.modelStatus==='busy'&&!!run;
    const recent=Number.isFinite(agent.lastPlanningAt)&&Date.now()-agent.lastPlanningAt<600000;
    setText('world-hud-thinking',!run?'🧠 模型状态未知':
      agent.modelStatus==='busy'?'🧠 Ollama 正在思考…':
      recent&&Number.isFinite(agent.planningLatencyMs)?
      '🧠 Ollama 上次规划请求耗时 '+(agent.planningLatencyMs/1000).toFixed(2)+' 秒':
      agent.modelStatus==='disabled'?'🧠 本地模型未启用':'🧠 暂无近期模型耗时');
    const life=run?.life;
    setText('world-deaths',Number.isSafeInteger(life?.deathsSinceTracking)?
      life.deathsSinceTracking+' 次':'尚未记录');
    setText('world-deaths-note',life?.trackingSince?
      '自 '+new Date(life.trackingSince).toLocaleDateString()+' 开始':'不代表 Minecraft 账号历史死亡总数');
    const learned=run?.deathLearning;
    const reasons={recent_damage_and_hostile_nearby:'受到伤害时附近有敌怪（未确定攻击者）',
      hostile_nearby_unconfirmed:'死亡前附近发现敌怪（因果未确认）',
      hunger_exhaustion_possible:'饥饿可能相关（未确认）',
      cause_unknown:'死亡原因证据不足',no_death_evidence:'尚无死亡观察'};
    const repeat=(learned?.repeatedThreats||[]).map(x=>x.kind+' ×'+x.observations).join('、');
    setText('world-death-learning',!run?'离线：暂无新鲜记录':
      !learned||!learned.observedDeaths?'尚无已记录的死亡经验':
      '已记录 '+learned.observedDeaths+' 次 · 最近结论：'+
      (reasons[learned.lastConclusion]||'待分析')+
      (repeat?' · 重复危险：'+repeat+'（优先验证撤退路线）':'')+
      ' · ⚠️ 未确认致命攻击者');
    const respawn=life?.respawnPoint;
    const state=life?.respawnStatus;
    setText('world-respawn-status',state==='observed_server_player_spawn_packet'?
      '已观测到个人重生点':state==='last_observed_prior_session'?
      '历史记录（本次未确认）':'未验证');
    setText('world-respawn-position',respawn&&state!=='not_verified'?
      'X '+respawn.x+' / Y '+respawn.y+' / Z '+respawn.z:'坐标未知；不会将附近床当作重生点');

    // Loaded-room geometry, confirmed personal spawn HOME and actual server
    // passage are separate evidence tiers; no local prediction becomes proof.
    const home=routine.homeBase||{};
    const age=Number.isFinite(home.lastObservedAt)?Date.now()-home.lastObservedAt:null;
    const recentHome=age!==null&&age>=0&&age<=45000;
    const candidate=recentHome&&home.lastSurvey==='observed_indoor_home_candidate';
    setText('world-home-observed',!run?'状态未知':
      candidate?'已观察到候选庇护所':recentHome?'室内结构未确认':'等待新鲜结构扫描');
    setText('world-home-observed-detail',!run?'Alice 离线或状态过期':
      candidate?'已观察到床、屋顶与木门；不保证完整封闭或可通过':
      recentHome?'最近原因：'+(home.lastReason||'结构证据不足'):
      '没有45秒内的结构扫描，不能沿用旧观察');
    const established=home.status==='observed_candidate_not_route_verified';
    setText('world-home-established',!run?'状态未知':
      established?'已记录候选 HOME（未验证路线）':
      candidate?'候选房间已看到 · 个人床位未确认':'尚未建立');
    setText('world-home-route',!run?'路线状态未知':
      home.exitVerified===true&&home.returnVerified===true?'出门和返程已有独立验证记录':
      '出门及返程尚未通过独立 BDS 位移验证');
    const bedStep=routine.bedApproachAction||{};
    setText('world-bed-step',!run?'状态未知':
      bedStep.serverMovementVerified===true?'BDS 已验证单步移动':
      bedStep.attempted===true?'已尝试，服务端位移未确认':
      bedStep.status==='blocked'?'安全条件阻止启动':'尚未开始单步移动');
    setText('world-bed-step-detail',!run?'等待在线':
      bedStep.serverMovementVerified===true?'来自移动后的新鲜独立 BDS 见证':
      bedStep.attempted===true?'不能以本地走动或输入计数判定成功':
      '必须有两条4秒内新鲜 BDS 样本及安全站立格');
    const bedPlan=routine.bedApproach||{};
    setText('world-bed-approach',!run?'状态未知':
      bedPlan.status==='observed_route_candidate'?
      '发现'+bedPlan.steps+'步只读路线候选（尚不可执行）':
      bedPlan.status==='already_in_reach'?'已在床互动范围':
      '未找到已加载的安全候选路线');
    setText('world-bed-approach-detail',!run?'等待在线':
      bedPlan.status==='observed_route_candidate'?
      '仍需每段独立BDS位置验证；不会据此自行行走':
      '只读观察；不表示床已使用或重生点已设置');
    const attempt=routine.lastSpawnpointAttempt||{};
    const reachLabels={bed_needs_verified_approach:'已发现床，尚不在可触及范围',
      loaded_free_bed_in_reach:'已加载空床且在触及范围',
      no_loaded_free_bed:'没有已验证可使用的空床',
      bed_world_unverified:'床或维度信息不足',
      bed_activation_unavailable:'床位互动接口不可用'};
    const gateLabelsBed={verified:'独立BDS位置门禁通过（仅检查时刻）',
      scout_bds_position_unavailable:'缺少两份新鲜独立BDS坐标见证',
      scout_client_server_position_diverged:'客户端与BDS坐标未对齐'};
    setText('world-bed-reach',!run?'状态未知':
      established?'个人床位已记录 · 勿重复设置':
      reachLabels[attempt.bedReach]||'尚无可验证的床前置检查');
    setText('world-bed-gate',!run?'安全状态未知':
      gateLabelsBed[attempt.positionGate]||
      '床位操作需独立坐标门禁；观察到床不代表已设置重生点');
    const select=byId('world-command-target'),current=select.value;
    const players=(Array.isArray(run?.onlinePlayers)?run.onlinePlayers:[])
      .filter(n=>typeof n==='string'&&/^[A-Za-z0-9_]{3,16}$/.test(n));
    select.replaceChildren(new Option('未选择玩家',''));
    for(const name of players)select.add(new Option(name,name));
    // A browser reload loses DOM selection, not the Alice runtime FOLLOW intent.
    // Always restore from the current verified online runtime, not localStorage.
    const followed=typeof run?.followTarget==='string'&&
      players.includes(run.followTarget)?run.followTarget:null;
    if(players.includes(current))select.value=current;
    else if(followed)select.value=followed;
    const activeFollow=run?.followTarget||null;
    const witness=run?.movementEvidence||{};
    const now=Date.now();
    const freshPair=Number.isSafeInteger(witness.independentPreviousAt)&&
      Number.isSafeInteger(witness.independentAt)&&
      witness.independentPreviousAt<witness.independentAt&&
      now-witness.independentPreviousAt>=0&&now-witness.independentPreviousAt<=4000;
    const self=run?.position,serverFeet=witness.independentLatestFeet;
    const distance=self&&serverFeet&&[self.x,self.y,self.z,serverFeet.x,serverFeet.y,serverFeet.z]
      .every(Number.isFinite)?Math.hypot(self.x-serverFeet.x,self.y-serverFeet.y,self.z-serverFeet.z):null;
    const moveVerified=freshPair&&distance!==null&&distance<=.75;
    const witnessText={
      not_configured:'未配置独立BDS见证文件',
      unsafe_witness_file:'见证文件权限不符合安全要求',
      stale_or_invalid_witness:'见证文件身份或格式无法验证',
      prior_login_witness:'见证属于以前的登录会话',
      prior_life_witness:'见证属于死亡前或重生尚未确认的阶段',
      expired_witness:'见证已经超过4秒有效期',
      duplicate_or_rejected:'见证未更新或未通过去重校验',
      accepted:'已接纳一条新的独立BDS见证',
      unavailable:'当前无法读取独立见证文件',
      disabled:'未启用独立见证读取器'
    };
    const witnessLabel=moveVerified?'两份新鲜独立BDS坐标已对齐（不代表实际行走）':
      witnessText[witness.witnessStatus]||'独立位置见证状态待核对';
    setText('world-bds-witness-status',!run?'状态未知':witnessLabel);
    setText('world-bds-witness-detail',!run?'等待Alice连接':
      '当前会话独立样本 '+(Number.isSafeInteger(witness.independentSamples)?
        witness.independentSamples:'—')+
      ' · 不会根据客户端预测位置解除移动限制');
    setText('world-current-follow',!run?'当前跟随：Alice 离线，状态未知':
      !activeFollow?'当前跟随：未设置':
      '当前跟随：'+activeFollow+
      (moveVerified?' · 已有新鲜位置对齐证据（不代表正在走动）':
        ' · 指令已保存于运行时，实际移动尚未通过 BDS 验证'));
    setText('world-command-readonly',!commandIsLocal?'局域网只读':
      !online?'Alice 离线 · 禁止发送':'Mac 本机 · 受控指令');
    if(pendingModeRevision!==null&&data.appliedRevision>=pendingModeRevision){
      showCommandResult('✓ 行为模式已由 Alice 运行进程应用 · v'+pendingModeRevision,'ok');
      pendingModeRevision=null;
    }
    const outcome=data.commandResult;
    if(outcome?.id&&(!lastCommandId||lastCommandId===outcome.id)){
      lastCommandId=outcome.id;
      const names={received:'已接收',started:'执行中',completed:'已完成',failed:'执行失败',rejected:'已拒绝'};
      showCommandResult((names[outcome.status]||outcome.status)+' · '+
        (outcome.message||outcome.reason||'暂无详细结果'),
        ['failed','rejected'].includes(outcome.status)?'error':
        outcome.status==='completed'?'ok':'');
    }
  }catch(err){
    commandOnline=false;modelBusy=false;positionBlocked=false;positionBlockedNote='';
    setText('world-day-phase','—');setText('world-day-weather','—');
    setText('world-hud-thinking','🧠 模型状态未知');
    setText('world-idle-reason','⚠️ 控制服务不可用，无法确定 IDLE 原因');
    setText('world-death-learning','控制服务不可用，死亡原因未知');
    setText('world-deaths','未知');setText('world-respawn-status','未验证');
    for(const id of ['world-home-observed','world-home-observed-detail','world-home-established','world-home-route','world-bed-reach','world-bed-gate','world-bed-approach','world-bed-approach-detail','world-bed-step','world-bed-step-detail','world-bds-witness-status','world-bds-witness-detail'])setText(id,'状态未知');
    setText('world-command-readonly','控制服务不可用');
    if(!lastCommandId)showCommandResult('无法读取 Mint 控制状态：'+String(err.message||err),'error');
  }finally{commandReadBusy=false;disableCommandControls()}
}
async function applyConsoleMode(mode){
  if(!commandIsLocal||!commandOnline||commandBusy)return;
  commandBusy=true;disableCommandControls();
  showCommandResult('正在保存行为模式到 Mint，等待 Alice 确认');
  try{
    const response=await fetch('/api/control/settings',{method:'POST',
      cache:'no-store',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({agentMode:mode})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'HTTP '+response.status);
    pendingModeRevision=data.saved?.revision;
    lastCommandId='mode_change'; // ignore stale prior command receipts
    showCommandResult('行为模式已保存 · v'+pendingModeRevision+'，等待 Alice 实际应用');
  }catch(err){showCommandResult('模式切换失败：'+String(err.message||err),'error')}
  finally{commandBusy=false;disableCommandControls()}
}
async function sendConsoleCommand(text){
  if(['自主模式','切换到自主模式'].includes(text.trim()))return applyConsoleMode('autonomous');
  if(['队友模式','切换到队友模式'].includes(text.trim()))return applyConsoleMode('companion');
  if(!commandIsLocal||!commandOnline||commandBusy){
    showCommandResult('只有 Mac 本机、Alice 在线时才能发送管理员指令','error');return;
  }
  if(typeof text!=='string'||!text.trim()||text.trim().length>80){
    showCommandResult('请输入 1～80 字符的受控指令','error');return;
  }
  commandBusy=true;disableCommandControls();
  showCommandResult('正在发送到 Mint；尚未代表 Alice 执行成功');
  try{
    const response=await fetch('/api/control/command',{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:text.trim()})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'HTTP '+response.status);
    if(data.id)lastCommandId=data.id;
    else if(data.status==='rejected')lastCommandId='local_rejected';
    const status=data.status==='queued'?'已排队':data.status==='rejected'?'已拒绝':data.status;
    showCommandResult(status+' · '+(data.message||data.reason||'等待 Alice 反馈'),
      data.status==='rejected'?'error':'');
    if(data.id)await refreshCommandState();
  }catch(err){showCommandResult('指令未确认发送：'+String(err.message||err),'error')}
  finally{commandBusy=false;disableCommandControls()}
}

const now=()=>Date.now();
const deg=n=>Math.round(n*180/Math.PI);
const pad=v=>String(v).padStart(2,'0');
const formatTime=t=>{const d=new Date(t);return [d.getHours(),d.getMinutes(),d.getSeconds()].map(pad).join(':')};
function isWorldPage(){return location.hash==='#world'}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function hexRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function shade(hex,amount){
  const rgb=hexRgb(hex);
  return 'rgb('+rgb.map(x=>clamp(Math.round(x*amount),0,255)).join(',')+')'
}
function paletteFor(name){
  if(name==='alice_head')return '#d3f5d5';
  if(name==='unknown')return '#5f7d8e';
  if(name==='alice_body')return '#79e5d4';
  if(name==='alice_leg')return '#445e70';
  if(/lava|magma|fire/.test(name))return '#e56a3b';
  if(/water|ice/.test(name))return '#3c93d3';
  if(/grass_block|moss|azalea/.test(name))return '#569658';
  if(/leaf|leaves|vine|grass|fern|flower|poppy/.test(name))return '#4f9155';
  if(/log|wood|planks|fence/.test(name))return '#a67d52';
  if(/dirt|mud|podzol|farmland/.test(name))return '#825f46';
  if(/sand/.test(name))return '#c0ad78';
  if(/bed/.test(name))return '#aa676a';
  if(/stone|deepslate|granite|andesite|tuff|cobble|ore/.test(name))return '#89908f';
  if(/glass/.test(name))return '#9ccec3';
  if(/snow|quartz|white/.test(name))return '#c6d3cc';
  return '#747f88'
}
function isSoft(name){return /water|glass|leaves|vine|flower|tall_grass/.test(name)}
function setText(id,value){const node=byId(id);if(node)node.textContent=value}
function coord(p){return p&&p.length===3?p.map(n=>Number(n).toFixed(2)).join(', '):'未知'}
function renderTimeline(rows,emptyText='尚无新的 Alice 行为日志'){
  const logs=byId('world-events');
  const records=(Array.isArray(rows)?rows:[]).slice(-24).reverse();
  const next=window.AliceWorldTimeline.timelineSignature(records,emptyText);
  const selection=window.getSelection?.();
  const selected=!!selection&&!selection.isCollapsed&&
    (logs.contains(selection.anchorNode)||logs.contains(selection.focusNode));
  const update=window.AliceWorldTimeline.shouldReplaceTimeline({
    previous:timelineSignature,next,pointerActive:timelinePointerActive,selectionActive:selected});
  if(!update){
    if(next!==timelineSignature)setText('world-event-count',
      records.length+' 条最近记录 · 复制期间暂停列表更新');
    return;
  }
  const elements=[];
  for(const event of records){
    const li=document.createElement('li');
    if(event.level==='warn'||event.level==='error')li.classList.add(event.level);
    const t=document.createElement('time');
    t.dateTime=Number.isFinite(event.at)?new Date(event.at).toISOString():'';
    t.textContent=Number.isFinite(event.at)?formatTime(event.at):'--:--:--';
    const m=document.createElement('span');m.textContent=event.message;
    li.append(t,m);elements.push(li);
  }
  if(!elements.length){
    const li=document.createElement('li');li.textContent=emptyText;elements.push(li);
  }
  logs.replaceChildren(...elements);
  timelineSignature=next;
  setText('world-event-count',records.length+' 条最近记录');
}
function setOffline(message){
  frame=null;target=null;previous=null;scenePan=null;
  byId('world-live-dot').classList.remove('live');
  setText('world-connection',message||'Alice 当前不在线');
  setText('world-lastseen','已停止展示旧快照；等待有效数据');
  setText('world-local-position','X — / Y — / Z —');
  setText('world-position-trust','没有可用的位置');
  setText('world-server-position','服务端坐标：未确认');
  setText('world-state','—');setText('world-job','—');setText('world-vitals','—');
  setText('world-hud-health','❤️ —/20');setText('world-hud-food','🍗 —/20');
  setText('world-hud-action','⏳ 等待 Alice 状态');setText('world-hud-thinking','🧠 模型状态未知');
  setText('world-death-learning','离线：死亡经验暂不可用');
  setText('world-idle-reason','离线：没有可信 IDLE 状态');
  setText('world-blocks','—');setText('world-entities','暂无实时实体');
  setText('world-sample-detail','⚠️ 没有新鲜的 3D 采样数据');
  byId('world-sample-detail').classList.remove('is-old');
  renderTimeline([],'Alice 不在线或快照已过期；不会使用旧数据伪造实时画面');
}
function apply(data){
  const view=data.view;
  if(!data.online||!view||!Array.isArray(view.voxels)||!Array.isArray(view.palette)||
      !view.alice?.local||!Array.isArray(view.origin)){setOffline('Alice 不在线 / 3D 快照已过期');return}
  if(frame?.alice?.local){previous=interpolated();target=view.alice.local;animationAt=performance.now()}
  else{previous=view.alice.local;target=view.alice.local;animationAt=performance.now()}
  if(!frame||frame.radius!==view.radius||frame.dimension!==view.dimension||
     frame.origin.some((value,index)=>Math.abs(value-view.origin[index])>=2))scenePan=null;
  frame=view;
  byId('world-live-dot').classList.add('live');
  setText('world-connection','● Alice 世界观察器已连接');
  setText('world-lastseen','采样于 '+formatTime(view.observedAt)+' · 同步延迟 '+(data.ageMs/1000).toFixed(1)+' 秒 · '+view.dimension);
  setText('world-local-position','X '+view.alice.local[0].toFixed(2)+' / Y '+view.alice.local[1].toFixed(2)+' / Z '+view.alice.local[2].toFixed(2));
  const received=!!view.alice.server;
  setText('world-position-trust',received?'✓ 收到近期服务器位置样本':'⚠ 当前显示客户端估算坐标（服务器未确认）');
  byId('world-position-trust').classList.toggle('confirmed',received);
  setText('world-server-position',received?'服务端脚底：'+coord(view.alice.server)+' · 样本 '+view.alice.serverSamples:'服务端坐标：暂无新鲜自身位置包 · 样本 '+(view.alice.serverSamples||0));
  // Retain raw IDLE as truth; distinguish last confirmed safety blocker.
  setText('world-state',view.alice.state||'IDLE');
  setText('world-job',view.alice.state==='IDLE'&&positionBlocked?
    '⛔ 寻路安全阻塞：'+positionBlockedNote:
    (view.alice.job||'空闲 / 观察'));
  const formatVital=n=>Number.isFinite(n)?String(Math.round(Math.max(0,Math.min(20,n))*10)/10):'—';
  setText('world-vitals',formatVital(view.alice.health)+'/20 · '+formatVital(view.alice.food)+'/20');
  const lifeValue=Number.isFinite(view.alice.health)?Math.max(0,Math.min(20,view.alice.health)):null;
  const foodValue=Number.isFinite(view.alice.food)?Math.max(0,Math.min(20,view.alice.food)):null;
  setText('world-hud-health',lifeValue===null?'❤️ —/20':'❤️ '+formatVital(lifeValue)+'/20 · '+'♥'.repeat(Math.ceil(lifeValue/2))+'♡'.repeat(10-Math.ceil(lifeValue/2)));
  setText('world-hud-food',foodValue===null?'🍗 —/20':'🍗 '+formatVital(foodValue)+'/20 · '+'▰'.repeat(Math.ceil(foodValue/2))+'▱'.repeat(10-Math.ceil(foodValue/2)));
  const names={SURVIVE:'🛡️ 求生 / 避险',COMBAT:'⚔️ 战斗',GUARD:'🛡️ 防卫',GATHER:'🪓 采集',CRAFT:'🔨 制作',EXPLORE:'🧭 探索',FOLLOW:'🚶 跟随',RECOVER:'🍎 恢复',STORAGE:'📦 物品管理',SLEEP:'💤 睡觉',IDLE:'👀 观察 / 等待'};
  setText('world-hud-action',view.alice.state==='IDLE'&&positionBlocked?
    '⛔ 位置安全阻塞 · 等待独立 BDS 见证':
    modelBusy?'🧠 Ollama 正在规划目标…':
    (names[view.alice.state]||'🤖 '+(view.alice.state||'未知状态'))+
    (view.alice.job?' · '+view.alice.job.slice(0,60):'')+
    (Number.isFinite(view.alice.jobElapsedMs)?' · ⏱ '+(view.alice.jobElapsedMs/1000).toFixed(1)+'秒':''));
  // The renderer has always counted non-air blocks; those are not the number
  // of sampled cells. Show the actual running Mint producer radius instead.
  const radius=Number.isInteger(view.radius)&&view.radius>=0&&view.radius<=15?view.radius:null;
  const layers=Number.isInteger(view.below)&&Number.isInteger(view.above)?
    view.below+view.above+1:null;
  const side=radius===null?null:radius*2+1;
  const expected=side!==null&&layers!==null?side*side*layers:null;
  const scanned=Number.isInteger(view.scanned)&&view.scanned>=0?view.scanned:null;
  const sampleValid=expected!==null&&scanned===expected;
  setText('world-blocks',(scanned??'—')+' / '+view.voxels.length);
  const old=radius!==null&&radius<15;
  setText('world-sample-detail',!sampleValid?'⚠️ 当前采样数量与范围不一致，请检查 Mint':
    (old?'⚠️ Mint 仍在使用旧采样器：':'✅ 当前实际采样：')+
    '半径 '+radius+' 格 · '+side+'×'+side+'×'+layers+
    ' = '+scanned+' 格（含空气） · 非空气 '+view.voxels.length+
    ' 格 · 未知 '+view.unknown+' 格'+
    (old?'。刷新 Mac 网页不会升级 Mint 的 Alice；测试通过后需执行一次 deploy。':''));
  byId('world-sample-detail').classList.toggle('is-old',old||!sampleValid);
  const entities=byId('world-entities');entities.replaceChildren();
  // Counts include only the bounded, currently observed Alice entity feed.
  const grouped=window.AliceNearbyEntities.groupNearbyEntities(view.entities,view.alice.local);
  for(const entity of grouped){
    const e=document.createElement('span');
    const drop=['item','item_entity','dropped_item'].includes(entity.kind);
    const item=entity.itemName?entity.itemName.replace(/^minecraft:/,'').replaceAll('_',' '):null;
    const label=drop?'📦 '+(item||'未知掉落物'):
      entity.kind==='arrow'?'🏹 箭矢':entity.kind==='zombie'?'🧟 僵尸':
      entity.kind.replaceAll('_',' ');
    const quantity=entity.count>1?' ×'+entity.count:'';
    const coords=entity.position.map(x=>Math.floor(x)).join(',');
    e.textContent=label+quantity+' · '+(entity.count>1?'最近 ':'')+coords;
    entities.append(e)
  }
  if(!entities.childNodes.length)entities.textContent='附近没有已同步的实体';
  renderTimeline(view.events);
}
function interpolated(){
  if(!target)return null;
  if(!previous)return target;
  const t=clamp((performance.now()-animationAt)/950,0,1);
  // Interpolate *reported client estimates*, never extrapolate beyond a snapshot.
  const smooth=t*t*(3-2*t);
  return target.map((value,i)=>previous[i]+(value-previous[i])*smooth)
}
function project(x,y,z,center,scale,width,height){
  const dx=x-center[0],dy=y-center[1],dz=z-center[2];
  const side=dx*Math.cos(angle)-dz*Math.sin(angle);
  const forward=dx*Math.sin(angle)+dz*Math.cos(angle);
  return {x:cameraOffsetX+side*scale,y:cameraOffsetY+(forward*Math.sin(pitch)-dy*Math.cos(pitch))*scale,
    depth:forward*Math.cos(pitch)+dy*Math.sin(pitch)}
}
function face(pts,name,light,alpha=1){
  if(!pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return;
  ctx.globalAlpha=alpha;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();
  ctx.fillStyle=shade(paletteFor(name),light);ctx.fill();
  ctx.strokeStyle='#061c1999';ctx.lineWidth=.55;ctx.stroke();ctx.globalAlpha=1;
}
function drawWorld(){
  const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));
  const dpr=Math.min(window.devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!frame){
    ctx.fillStyle='#78998b';ctx.textAlign='center';ctx.font='14px sans-serif';
    ctx.fillText('等待 Alice 已加载的局部 Minecraft 世界…',w/2,h/2);return
  }
  const local=interpolated()||frame.alice.local;
  const center=follow?local:(anchor||local);
  // Earlier mouse interaction used a fixed Alice-centered orbit: dragging
  // changes ONLY angle/pitch. The previous per-frame fit recomputed scale and
  // offsets from the new yaw, making the world zoom/slide involuntarily.
  // Analytic full-volume bounds are angle- and pitch-independent here.
  const fit=window.AliceWorldCamera.fitOrbitCamera({
    width:w,height:h,radius:frame.radius,below:frame.below,
    above:frame.above,zoom});
  const scale=fit.scale;
  if(scenePan===null)scenePan=window.AliceWorldCamera.panToObservedScene({
    voxels:frame.voxels,origin:frame.origin,center,angle,pitch,
    width:w,height:h,fit});
  cameraOffsetX=fit.offsetX+scenePan.x*scale;
  cameraOffsetY=fit.offsetY+scenePan.y*scale;
  const origin=frame.origin;
  const shownVoxels=frame.voxels.filter(v=>!hideRoof||v[1]<2);
  const cubeMap=new Map(shownVoxels.map(v=>[v.slice(0,3).join(','),v]));
  const faces=[];
  const addFace=(x,y,z,vertices,name,light,alpha)=>{
    const pts=vertices.map(([a,b,c])=>project(x+a,y+b,z+c,center,scale,w,h));
    faces.push({pts,name,light,alpha,depth:pts.reduce((sum,p)=>sum+p.depth,0)/4})
  }
  function cube(x,y,z,name,solid=true){
    // Render only the actually observed cuboid, without any synthetic mask.
    // The border is the true end of our sampled area. Never fade real
    // blocks or synthesize neighbors to disguise an incomplete snapshot.
    // No fake overlay or clipped-edge "mask": draw every sampled solid
    // cube as opaque, retaining translucency only for genuine soft blocks.
    const alpha=isSoft(name)?0.7:1;
    const localKey=(dx,dy,dz)=>[Math.floor(x-origin[0])+dx,Math.floor(y-origin[1])+dy,Math.floor(z-origin[2])+dz].join(',');
    if(!solid||!cubeMap.has(localKey(0,1,0)))
      addFace(x,y,z,[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],name,1.14,alpha);
    if(Math.sin(angle)>=0){
      if(!solid||!cubeMap.has(localKey(1,0,0)))addFace(x,y,z,[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],name,.83,alpha)
    }else if(!solid||!cubeMap.has(localKey(-1,0,0)))
      addFace(x,y,z,[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],name,.77,alpha);
    if(Math.cos(angle)>=0){
      if(!solid||!cubeMap.has(localKey(0,0,1)))addFace(x,y,z,[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],name,.64,alpha)
    }else if(!solid||!cubeMap.has(localKey(0,0,-1)))
      addFace(x,y,z,[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],name,.62,alpha);
  }
  for(const [dx,dy,dz,id] of shownVoxels){
    const name=frame.palette[id]||'unknown';
    cube(origin[0]+dx,origin[1]+dy,origin[2]+dz,name)
  }
  // Unknown/unloaded cells are intentionally NOT solid ground. A dim hint
  // marks missing samples close to feet level rather than inventing air.
  for(const [dx,dy,dz] of frame.unknownCells||[]){
    if(dy!==-1&&dy!==0)continue;
    const x=origin[0]+dx,y=origin[1]+dy,z=origin[2]+dz;
    addFace(x,y,z,[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],'unknown',.75,.17)
  }
  // Alice is intentionally shown at her CLIENT-PREDICTED location until
  // Bedrock emits a recent own-player position packet. The UI labels this.
  cube(local[0]-.24,local[1]+1.18,local[2]-.24,'alice_head',false);
  cube(local[0]-.3,local[1]+.63,local[2]-.19,'alice_body',false);
  cube(local[0]-.25,local[1],local[2]-.16,'alice_leg',false);
  cube(local[0]+.04,local[1],local[2]-.16,'alice_leg',false);
  faces.sort((a,b)=>a.depth-b.depth);
  for(const f of faces)face(f.pts,f.name,f.light,f.alpha);
  const anchorPos=project(local[0],local[1]+2.15,local[2],center,scale,w,h);
  ctx.textAlign='center';ctx.font='700 12px sans-serif';
  const tag='✦ Alice'+(frame.alice.server?' · 服务端样本':' · 本地估算');
  const tw=ctx.measureText(tag).width+20;
  ctx.fillStyle='#112b24ed';ctx.fillRect(anchorPos.x-tw/2,anchorPos.y-24,tw,22);
  ctx.fillStyle='#c7ffab';ctx.fillText(tag,anchorPos.x,anchorPos.y-9);
  // An arrow shows Alice's reported facing direction (Minecraft yaw).
  if(Number.isFinite(frame.alice.yaw)){
    const yaw=frame.alice.yaw;
    const from=project(local[0],local[1]+.3,local[2],center,scale,w,h);
    const to=project(local[0]-Math.sin(yaw)*1.4,local[1]+.3,
      local[2]+Math.cos(yaw)*1.4,center,scale,w,h);
    ctx.strokeStyle='#a4f5ea';ctx.fillStyle='#a4f5ea';ctx.lineWidth=2.6;
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
    const arrow=Math.atan2(to.y-from.y,to.x-from.x);
    ctx.beginPath();ctx.moveTo(to.x,to.y);
    ctx.lineTo(to.x-Math.cos(arrow-.5)*9,to.y-Math.sin(arrow-.5)*9);
    ctx.lineTo(to.x-Math.cos(arrow+.5)*9,to.y-Math.sin(arrow+.5)*9);
    ctx.closePath();ctx.fill()
  }
  // Server-origin own position, if available, is a distinct green ring.
  // Local interpolation never silently replaces authoritative coordinates.
  if(Array.isArray(frame.alice.server)){
    const sv=frame.alice.server;
    const point=project(sv[0],sv[1]+.06,sv[2],center,scale,w,h);
    ctx.beginPath();ctx.ellipse(point.x,point.y,8,5,0,0,Math.PI*2);
    ctx.strokeStyle='#adf66e';ctx.lineWidth=2;ctx.stroke()
  }
  for(const e of frame.entities){
    if(!Array.isArray(e.position))continue;
    const pos=project(e.position[0],e.position[1]+1.35,e.position[2],center,scale,w,h);
    ctx.fillStyle='#e59e78';ctx.beginPath();ctx.arc(pos.x,pos.y,4.5,0,Math.PI*2);ctx.fill();
    ctx.font='11px sans-serif';ctx.fillStyle='#eecfc0';
    const drop=['item','item_entity','dropped_item'].includes(e.kind);
    const item=typeof e.itemName==='string'&&/^[a-z0-9_:.-]{1,64}$/.test(e.itemName)?e.itemName.replaceAll('_',' '):null;
    ctx.fillText(drop?'📦 '+(item||'未知掉落物'):e.kind,pos.x,pos.y-9)
  }
  ctx.textAlign='left';ctx.font='11px ui-monospace,monospace';ctx.fillStyle='#92b6a8';
  ctx.fillText('X/Z 方位随视角旋转 · 俯角 '+deg(pitch)+'° · 缩放 '+zoom.toFixed(1)+'×',14,22);
}
function loop(time){
  if(!isWorldPage()){drawId=null;return}
  // When using the mouse, prioritize feedback over background CPU budget.
  // Idle snapshots remain throttled; while dragging restore a responsive
  // ~30 FPS interactive update without changing pointer sensitivity.
  const interval=dragging?1000/30:frame?.voxels?.length>3000?1000/12:1000/24;
  if(!lastDrawAt||time-lastDrawAt>=interval){drawWorld();lastDrawAt=time}
  drawId=requestAnimationFrame(loop)
}
async function refresh(){
  if(!isWorldPage()||requestBusy)return;
  requestBusy=true;
  try{const r=await fetch('/api/world',{cache:'no-store'});
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'HTTP '+r.status);
    apply(data)
  }catch(err){setOffline('无法读取 Mint 3D 世界：'+(err.message||String(err)))}
  finally{requestBusy=false}
}
function active(){
  if(refreshTimer)return;
  refresh();refreshTimer=setInterval(refresh,1100);
  refreshCommandState();commandTimer=setInterval(refreshCommandState,5000);
  if(!drawId)drawId=requestAnimationFrame(loop)
}
function inactive(){
  if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}
  if(commandTimer){clearInterval(commandTimer);commandTimer=null}
  if(drawId){cancelAnimationFrame(drawId);drawId=null}
}
const timelineNode=byId('world-events');
timelineNode.addEventListener('pointerdown',()=>{timelinePointerActive=true});
window.addEventListener('pointerup',()=>{timelinePointerActive=false});
window.addEventListener('pointercancel',()=>{timelinePointerActive=false});
byId('world-command-form').addEventListener('submit',e=>{
  e.preventDefault();sendConsoleCommand(byId('world-command-text').value)
});
byId('world-command-target').addEventListener('change',disableCommandControls);
byId('world-quick-follow').addEventListener('click',()=>{
  const name=byId('world-command-target').value;
  if(name)sendConsoleCommand('跟随 '+name)
});
byId('world-quick-guard').addEventListener('click',()=>{
  const name=byId('world-command-target').value;
  if(name)sendConsoleCommand('保护 '+name)
});
byId('world-quick-stop').addEventListener('click',()=>sendConsoleCommand('停止'));
byId('world-mode-autonomous').addEventListener('click',()=>applyConsoleMode('autonomous'));
byId('world-mode-companion').addEventListener('click',()=>applyConsoleMode('companion'));
disableCommandControls();
const followBtn=byId('world-follow');
const roofBtn=byId('world-roof');
roofBtn.addEventListener('click',()=>{hideRoof=!hideRoof;
  roofBtn.setAttribute('aria-pressed',String(hideRoof));
  roofBtn.textContent='⌑ 透视屋顶：'+(hideRoof?'开':'关')})
byId('world-reset').addEventListener('click',()=>{
  angle=.66;pitch=.65;zoom=1;follow=true;anchor=null;
  scenePan=null;lastDrawAt=0;
  followBtn.setAttribute('aria-pressed','true');followBtn.textContent='◎ 跟随 Alice：开'
});
followBtn.addEventListener('click',()=>{
  follow=!follow;
  if(!follow&&frame)anchor=interpolated()||frame.alice.local;
  scenePan=null;lastDrawAt=0;
  followBtn.setAttribute('aria-pressed',String(follow));
  followBtn.textContent='◎ 跟随 Alice：'+(follow?'开':'关')
});
let x0=0,y0=0;
canvas.addEventListener('pointerdown',e=>{dragging=true;x0=e.clientX;y0=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{
  if(!dragging)return;
  // Preserve original mouse directions, pitch clamp and drag sensitivity.
  angle+=(e.clientX-x0)*.008;pitch=clamp(pitch-(e.clientY-y0)*.005,.24,1.3);
  x0=e.clientX;y0=e.clientY;
  // Draw on the next animation frame instead of waiting for the old 12fps
  // timer. No extra RAF loop and no synchronous heavy draw in pointermove.
  lastDrawAt=0;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=false});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  zoom=clamp(zoom*(e.deltaY>0?.88:1.12),.45,2.5);
  lastDrawAt=0;
},{passive:false});
canvas.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){angle+=(e.key==='ArrowLeft'?-.12:.12);e.preventDefault()}
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){pitch=clamp(pitch+(e.key==='ArrowUp'?.12:-.12),.24,1.3);e.preventDefault()}
  if(e.key==='+'||e.key==='='){zoom=clamp(zoom*1.12,.45,2.5);e.preventDefault()}
  if(e.key==='-'){zoom=clamp(zoom*.88,.45,2.5);e.preventDefault()}
});
document.addEventListener('alice-page-change',e=>{if(e.detail==='world')active();else inactive()});
if(isWorldPage())active();else drawWorld();
})();
