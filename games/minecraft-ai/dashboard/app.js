'use strict';
const byId=id=>document.getElementById(id);
const statuses={observed:'历史实测',staged:'代码已写·待实测',prototype:'仅有底层接口',pending:'尚未实现'};
let catalog={capabilities:[],commands:[]};
let category='全部', selectedLog='', originalLog='';
let controlEditing=false, controlRequestInFlight=false;
const localControl=location.hostname==='127.0.0.1'||location.hostname==='localhost';
const errorText=err=>err instanceof Error?err.message:String(err);
function node(tag,props={},children=[]){const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k==='title')e.title=v;else e.setAttribute(k,v)}for(const child of children)e.append(child);return e}
function tag(status){return node('span',{class:'tag '+status,text:statuses[status]||status})}
function toast(message){const e=byId('toast');e.textContent=message;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),2300)}
function show(page){for(const p of document.querySelectorAll('.page'))p.classList.toggle('active',p.id==='page-'+page);for(const n of document.querySelectorAll('.nav'))n.classList.toggle('active',n.dataset.page===page);byId('crumb').textContent={overview:'能力总览',commands:'命令手册',logs:'运行日志',bedrock:'基岩兼容',control:'实时状态与行为设置',world:'Alice 3D 世界'}[page]||page;history.replaceState({},'', '#'+page);document.dispatchEvent(new CustomEvent('alice-page-change',{detail:page}))}
async function getJson(url){const r=await fetch(url,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'HTTP '+r.status);return j}
function renderFeatures(){const container=byId('features');container.replaceChildren();const search=byId('feature-search').value.toLowerCase().trim();const filtered=catalog.capabilities.filter(f=>(category==='全部'||f.group===category)&&(`${f.name} ${f.group} ${f.detail}`).toLowerCase().includes(search));for(const f of filtered){const card=node('article',{class:'feature'});card.append(node('div',{class:'icon',text:f.icon}),node('h3',{text:f.name}),tag(f.status),node('p',{text:f.detail}));container.append(card)}if(!filtered.length)container.append(node('p',{class:'empty',text:'没有符合条件的能力。'}))}
function renderFilters(){const el=byId('feature-filters');el.replaceChildren();const groups=['全部',...new Set(catalog.capabilities.map(x=>x.group))];for(const g of groups){const b=node('button',{class:'chip'+(g===category?' active':''),text:g});b.addEventListener('click',()=>{category=g;renderFilters();renderFeatures()});el.append(b)}}
function renderCommands(){const el=byId('commands');el.replaceChildren();const search=byId('command-search').value.toLowerCase().trim(),state=byId('command-status').value;for(const cmd of catalog.commands.filter(c=>(state==='all'||c.status===state)&&(`${c.command} ${c.group} ${c.description}`).toLowerCase().includes(search))){const body=node('div',{class:'cmd-body'},[node('h3',{text:cmd.command}),node('p',{text:cmd.description})]);if(cmd.note)body.append(node('div',{class:'note',text:cmd.note}));const button=node('button',{text:'复制命令'});button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(cmd.command);toast('已复制：'+cmd.command)}catch{toast('复制失败，请手动选择文字')}});el.append(node('article',{class:'command'},[body,tag(cmd.status),button]))}if(!el.children.length)el.append(node('p',{class:'empty',text:'没有符合条件的命令'}))}
async function loadCatalog(){try{catalog=await getJson('/api/catalog');byId('catalog-notice').textContent=catalog.notice;byId('total-features').textContent=catalog.capabilities.length;byId('observed-count').textContent=catalog.capabilities.filter(f=>f.status==='observed').length;byId('remaining-count').textContent=catalog.capabilities.filter(f=>f.status!=='observed').length;byId('commands-count').textContent=catalog.commands.length;renderFilters();renderFeatures();renderCommands();byId('api-indicator').textContent='● 本地服务已连接'}catch(e){byId('catalog-notice').textContent='目录读取失败：'+errorText(e);byId('api-indicator').textContent='● 服务不可用'}}
function controlValue(id,value){byId(id).textContent=value==null?'—':String(value)}
function applyControlSnapshot(data){
  const c=data.configured,run=data.runtime,online=!!data.online;
  const rev=c?.revision??0;
  const applied=online?data.appliedRevision:null;
  controlValue('saved-revision','v'+rev);
  controlValue('applied-revision',applied==null?'未在线':'v'+applied);
  controlValue('revision-result',!online?'机器人不在线 / 等待上线':applied===rev?'✓ 已应用':'等待 Alice 加载');
  controlValue('control-online',online?'● 在线':'○ 未在线');
  byId('control-online').classList.toggle('connected',online);
  controlValue('control-lastseen',data.lastSeenMs==null?'尚无有效心跳':Math.round(data.lastSeenMs/1000)+' 秒前同步');
  controlValue('control-state',run?.state||'—');
  const mission=online?run?.longTermGoal:null;
  const missionNames={LEARN_WEAPON:'准备武器',COLLECT_WOOD:'储备木材',
    OBSERVE:'观察世界',SECURE_SHELTER:'建立临时庇护所'};
  const stepNames={ACQUIRE_WOOD:'寻找并获取木材',DISCOVER_RESOURCES:'探索下一处资源点',
    CRAFT_WEAPON:'制作武器',BUILD_SHELTER:'逐块搭建庇护结构',
    OBSERVE_WORLD:'观察环境',RECOVER_SAFELY:'安全恢复',REVALIDATE:'重新核验'};
  const phaseNamesGoal={READY:'待执行',ACTING:'执行中',BLOCKED:'受阻，目标仍在',
    WAITING:'等待条件',PAUSED:'被玩家或模式暂停'};
  const goalReasons={tool_failed:'技能执行失败',tool_exception:'执行器异常',
    server_position_unconfirmed:'服务端移动尚未确认',waiting_for_daylight:'等待白天',
    no_safe_route:'当前没有已验证安全路线',user_stop:'用户停止',
    player_override:'优先执行玩家任务',action_preempted:'被生存安全任务打断',
    inventory_transition_verified:'已验证背包材料变化',
    review_scheduled:'等待下一步评估',restart_revalidate:'重启后核实世界状态',
    shelter_materials_missing:'缺少建造材料',shelter_position_unconfirmed:'缺少可信服务端坐标',
    shelter_entrance_unsecured:'围护结构尚无可关闭入口',shelter_no_safe_candidate:'暂无可安全建造位置',
    shelter_terrain_unloaded:'周围地形尚未加载完整',shelter_build_blocked:'附近危险，暂不施工',
    priority_changed:'根据生存危险调整目标'};
  const missionText=mission?(missionNames[mission.goal]||mission.goal)+' · '+
    (stepNames[mission.step]||mission.step)+' · '+
    (phaseNamesGoal[mission.phase]||mission.phase):'暂无已确认长期目标';
  controlValue('control-job',!online?'运行进程未在线':
    run?.job||('当前无执行动作；'+missionText));
  controlValue('control-target',run?.followTarget||'未跟随');
  const agent=online?run?.agent:null;
  controlValue('agent-summary',!online?'Alice 未在线 / 推理状态未知':!agent?'运行进程尚未提供双模式与模型状态':
    '模式 '+agent.mode+' · Ollama '+agent.modelStatus+' · 目标来源 '+(agent.goalSource||'—'));
  controlValue('agent-detail',agent?JSON.stringify(agent,null,2):'无在线、可信的规划证据。');
  const p=run?.position;
  controlValue('control-position',p?'坐标 '+p.x+', '+p.y+', '+p.z:'坐标待同步');
  controlValue('control-health',run?.health!=null?run.health+'/20':'—');
  const sleep=run?.worldRoutine?.sleepOpportunity;
  const sleepNames={
    safe_bed_candidate:'有可尝试的床',
    nearby_hostile_bed_unavailable:'床附近有怪物',
    all_candidate_beds_in_cooldown:'附近床位正在冷却',
    all_beds_occupied:'附近床均已占用',
    bed_blocks_unverified:'附近床位数据不完整',
    no_bed_within_radius:'12格内未发现床',
    bed_observation_api_unavailable:'床位读取未就绪',
    bed_scan_failed:'床位扫描失败',
    outside_sleep_window:'不在睡眠时间',
    candidate_found:'附近床位待检查',
    unavailable_or_unknown:'床位暂不可用',
    remembered_bed_unverified:'已记住的床暂不可用',
    deferred_for_weapon_preparation:'优先准备防身武器',
    deferred_for_shelter:'优先搭建庇护所',
    deferred_for_health:'生命值不足，暂不睡觉'
  };
  const rememberedBedCount=run?.worldRoutine?.rememberedBeds?.knownBeds||0;
  const rememberedBedText=rememberedBedCount>0?
    ' · 🛏️ 已记住 '+rememberedBedCount+' 处床位':'';
  const sleepText=run?.worldRoutine?.phase==='night'&&sleep?
    ' · 🛏️ '+(sleepNames[sleep.status]||sleep.status):'';
  const shelter=run?.worldRoutine?.shelterOpportunity;
  const shelterNames={shelter_materials_missing:'缺少临时庇护材料',
    shelter_one_verified_block_candidate:'发现可尝试的建造位置',
    shelter_entrance_unsecured:'已观察到围护结构，入口仍未封闭',
    shelter_not_natural_ground:'不是可确认的天然地面',
    shelter_existing_structure_nearby:'附近已有建筑，需要保护',
    shelter_position_unconfirmed:'位置尚未获服务端确认'};
  const shelterText=shelter?' · 🏠 '+
    (shelterNames[shelter.reason]||shelter.reason)+
    (shelter.remaining!=null?' · 待补 '+shelter.remaining+' 块':'')+
    (shelter.canBuildWithCurrentProof===false?' · 禁止未经验证的放置':''):'';
  controlValue('control-world',run?'饥饿 '+(run.food??'—')+'/20 · '+
    (run.world||'Bedrock')+rememberedBedText+sleepText+shelterText+
    (run.worldRoutine?.nightSurvival?' · 🌙 '+({
      night_verified_two_step_reposition:'安全短程转移中',
      scout_bds_position_unavailable:'夜间转移缺少服务端定位',
      scout_client_server_position_diverged:'夜间移动坐标不一致',
      night_hostile_within_12:'周边敌怪，禁止盲走',
      night_reposition_cooldown:'夜间转移冷却中',
      known_bed_preferred:'优先尝试附近床位'
    }[run.worldRoutine.nightSurvival.reason]||run.worldRoutine.nightSurvival.reason):''):
    '等待 Bedrock 进程');
  const serverMove=online?run?.movementEvidence:null;
  const serverLogin=serverMove?.loginFeet;
  const loginLabel=serverLogin?
    '服务器登录初始坐标 '+serverLogin.x+', '+serverLogin.y+', '+serverLogin.z:
    '尚未收到服务器登录初始坐标';
  const moveSummary=!online?'Alice 未在线，无法判断当前服务器位置':
    !serverMove?'新版移动监测尚未就绪':
    loginLabel+' · 登录后修正包 '+serverMove.received+
    ' 条（0 条不意味着服务器未接受移动；当前位置仍为客户端预测）。';
  controlValue('server-move-summary',moveSummary);
  controlValue('server-move-detail',serverMove?JSON.stringify(serverMove,null,2):
    '未收到当前 Bedrock 进程的服务端位置证据。最终请以 MCManager querytarget 为准。');
  const routine=online?run?.worldRoutine:null;
  const escape=routine?.escapeSurvey||null;
  const escapeLabels={
    open_frontier_observed:'发现可走的观察边界（不等于房间出口）',
    door_interaction_candidate:'附近发现可能需要互动的木门',
    shape_or_climb_unverified:'发现楼梯、梯子或半格形状，通行条件待验证',
    no_non_destructive_exit_observed:'当前扫描没有确认非破坏性出口',
    current_tile_unverified:'Alice 脚下或站立空间的方块条件未证实',
    unknown_terrain:'部分区块或扫描范围未知',
    unknown:'Alice 着地或方块缓存尚不可信'
  };
  controlValue('escape-survey-summary',!online?'Alice 未在线，不能将旧观察当作实时状态':
    !escape?'等待下一次自主探索受阻后的只读扫描':
    (escapeLabels[escape.status]||escape.status)+
    ' · 可达 '+(escape.reachableCells??0)+' 格 · 未知 '+(escape.unknownCells??0)+' 格');
  controlValue('escape-survey-detail',escape?JSON.stringify(escape,null,2):
    '暂无已发布的房间出口观察。Alice 仅可能在严格验证后尝试单次木门交互；不会自动挖掘或声称已离开房间。');

  const phaseNames={day:'☀️ 白天',dusk:'🌅 黄昏',night:'🌙 夜晚',dawn:'🌄 黎明',unknown:'时间未知'};
  const weatherNames={clear:'晴朗',rain:'下雨',thunder:'⛈️ 雷暴'};
  const cooldownText=x=>x?.remainingMs>0?
    '暂停 '+Math.ceil(x.remainingMs/60000)+' 分钟 · '+(x.reason||''):'可评估';
  controlValue('routine-phase',routine?phaseNames[routine.phase]||'未知':'—');
  controlValue('routine-clock',routine?.tick==null?'游戏时间未知':'游戏刻 '+routine.tick);
  controlValue('routine-weather',routine?weatherNames[routine.weather]||'未知':'—');
  controlValue('routine-sleep',routine?.canSleep?'满足时间/天气条件；床仍需安全确认':'当前不适合睡觉');
  controlValue('routine-wood',routine?cooldownText(routine.cooldowns?.wood):'—');
  controlValue('routine-scout',routine?cooldownText(routine.cooldowns?.scout):'—');
  controlValue('routine-motion',routine?cooldownText(routine.cooldowns?.motion):'—');
  const routeCooldowns=routine?.cooldowns;
  controlValue('routine-route-memory',routeCooldowns?
    ('已排除失败目标路线 '+(routeCooldowns.blockedRoutes||0)+
     ' 条 · 旧版区域探索记录 '+(routeCooldowns.legacyScoutIgnored?'已保留但不参与阻止':'不影响规划')+
     ' · 仅服务器运动未确认才限制继续移动'):
    '等待 Alice 最新的路线与移动证据');
  const decision=routine?.decision||null;
  const actionLabels={WAIT:'等待安全条件',SCOUT:'尝试安全短程探索',WORK:'执行资源任务',OBSERVE:'观察周围'};
  const goalLabels={FIND_NEW_RESOURCE_AREA:'寻找新的资源区域',LEARN_WEAPON:'准备制作武器',
    COLLECT_WOOD:'寻找木材',OBSERVE:'观察周围'};
  const reasonLabels={world_time_unknown:'世界时间尚未同步',
    daylight_or_weather_prevents_safe_scout:'当前时间或天气不适合探索',
    server_movement_unverified_cooldown:'服务器尚未确认 Alice 移动，暂缓新的物理移动',
    terrain_unloaded_or_incomplete:'沿途区块未加载或地形不完整，稍后复查',
    no_verified_3d_surface_route:'已加载区域没有符合安全要求的三维路线',
    current_ground_unverified:'脚下的可站立地面尚未确认',
    ground_contact_or_terrain_unknown:'Alice 着地状态或地形数据尚未确认',
    scout_site_cooldown:'旧版探索地点冷却（新版不再用于路线阻止）',
    no_verified_safe_corridor:'未发现已验证安全的地面通道',
    ground_contact_unconfirmed:'Alice 是否着地尚未确认',
    position_or_blocks_unavailable:'当前位置或地形数据不可用',
    low_health_prevents_scout:'生命值不足，禁止远行',
    no_safe_exploration_route:'没有安全可行的探索路线',
    wood_site_rejected_find_new_area:'当前地点无天然树证据，准备更换区域',
    site_not_rejected:'当前地点尚可尝试资源任务',
    materials_available:'已有基础材料',inventory_ready:'已有基本装备'};
  controlValue('routine-goal',mission?missionText+
    (mission.phase==='BLOCKED'||mission.phase==='WAITING'?
      ' · 原因 '+(goalReasons[mission.reason]||mission.reason):''):
    decision?goalLabels[decision.goal]||decision.goal:'尚未作出自主决策');
  const idleHold=run?.job?null:routine?.idleHold;
  const idleReasons={daylight_required:'夜间或天气不适合远行',
    scout_bds_position_unavailable:'等待新鲜的服务端定位证据',
    scout_client_server_position_diverged:'客户端与服务端坐标不一致，暂停导航',
    scout_client_position_unavailable:'等待客户端位置同步',
    startup_terrain_sync_pending:'等待角色落地和周围地形同步',
    movement_evidence_cooldown:'等待原有移动验证安全冷却',
    flat_routes_not_executable:'当前没有至少两格完整验证的平路',
    flat_routes_recently_failed_or_visited:'可行路线近期已尝试，暂不重复',
    no_verified_flat_walk_candidate:'附近尚无已验证安全平路',
    no_authorized_skill_for_current_goal:'暂无线索支持可执行的安全任务',
    model_unavailable:'模型暂不可用，下一次只读复查'};
  const delay=idleHold?.nextReviewAt?
    Math.max(0,Math.ceil((idleHold.nextReviewAt-Date.now())/1000)):null;
  const holdText=idleHold?
    ' · 💤 '+(idleReasons[idleHold.reason]||reasonLabels[idleHold.reason]||idleHold.reason)+
      (delay!=null?' · '+delay+' 秒后复查':''):'';
  const terrain=routine?.terrainAdaptation;
  const terrainName={JUMP_UP:'观察到一格高台可尝试攀上',STEP_DOWN:'观察到一格高差可尝试下降',
    PLACE_BRIDGE:'发现一个可填补的短坑',DIG_SOIL:'发现可清除的天然土层'};
  const activeTerrain=terrain?.vertical?.action||terrain?.earthwork?.action;
  const terrainText=activeTerrain?' · 🧱 '+(terrainName[activeTerrain]||activeTerrain)+
    (['PLACE_BRIDGE','DIG_SOIL'].includes(activeTerrain)&&
      terrain.positionProof!=='recent_server_position_matches'?
      '（尚无服务端位置证明，禁止改动方块）':''):'';
  controlValue('routine-decision',decision?
    (actionLabels[decision.action]||decision.action)+' · '+
      (reasonLabels[decision.reason]||decision.reason)+holdText+terrainText:
    '等待进入世界及安全生存数据同步');
  const scout=routine?.scouting;
  controlValue('routine-scout-progress',!scout?'暂无服务器确认记录':
    (scout.confirmed?'✅ 已确认':'⏸️ 待确认')+
    ' · 累计确认 '+(scout.confirmedSegments||0)+' 段');
  controlValue('routine-scout-detail',scout?
    ('最近一段：'+(scout.segmentBlocks??'未知')+' 格，整格高低变化 '+(scout.elevationChanges||0)+
     ' 次；'+(scout.reason||'未提供原因')+
     (scout.serverMovedBlocks!=null?'；服务端观测位移约 '+scout.serverMovedBlocks+' 格':'；没有达到服务器确认标准')):
    '动态分段探索；安全通道可拐弯和上下整格，路线确认后才允许计划下一段。');
  const sleepFail=routine?.lastBedFailure;
  controlValue('routine-bed-result',!online?'—':sleepFail?.reason?
    '失败：'+sleepFail.reason:'暂无失败记录');
  const diag=online?run?.followDiagnostic:null;
  const diagReady=diag&&diag.reason!=='position_or_block_api_unavailable';
  byId('follow-diag-summary').textContent=!online?
    'Alice 未在线，不能将历史快照作为当前状态':
    !diag?'暂无 noPath 地形快照：等待 Alice 遇到寻路失败':
    !diagReady?'地形读取尚未就绪：'+diag.reason:
    '路径 '+diag.pathStatus+' · 自身脚下'+(diag.centerSupported?'有地面':'未确认可站立')+
      ' · 周围可站立 '+diag.nearbySupported+'/4 · 区块未知 '+diag.nearbyUncertain+'/4';
  byId('follow-diag-detail').textContent=diag?JSON.stringify(diag,null,2):
    '尚无诊断。请在游戏里让 Alice 跟随并记录 noPath，然后刷新此页。';
  byId('overview-led').classList.toggle('connected',online);
  controlValue('overview-live',online?'Alice 已进入基岩世界':'Alice 未在线 / 无有效心跳');
  controlValue('overview-task',online?'动作 '+(run?.state||'IDLE')+
    ' · '+(mission?missionText:'目标待评估')+
    ' · 跟随 '+(run?.followTarget||'无'):'设置可在机器人下次启动时应用');
  if(c?.settings&&!controlEditing){
    byId('setting-follow').value=c.settings.followDistance;
    byId('setting-occluded').value=c.settings.occludedDistance;
    byId('setting-autonomy').checked=c.settings.autonomyEnabled;
    byId('setting-mode').value=c.settings.agentMode||'companion';
  }
  const feedback=byId('control-feedback');
  if(!controlEditing)feedback.textContent=online&&applied===rev?'✓ 配置已由 Alice 运行进程确认':
    !online?'当前未在线；设置保存后将在下次启动时加载':'设置已保存，等待 Alice 进程确认';
}
async function loadControl(){
  if(controlRequestInFlight)return;
  controlRequestInFlight=true;
  try{
    const data=await getJson('/api/control/status');
    applyControlSnapshot(data)
  }catch(err){
    controlValue('control-online','无法连接');
    controlValue('overview-live','Mint SSH / Alice 状态不可用');
    controlValue('control-feedback','实时状态读取失败：'+errorText(err));
    byId('overview-led').classList.remove('connected');
  }finally{controlRequestInFlight=false}
}
const loginResultLabels={spawned:'✓ 已进入世界',server_id_conflict:'✕ 服务器身份冲突',
  closed_before_spawn:'登录前关闭',in_progress:'连接进行中'};
let historyBusy=false;
async function loadConnectionHistory(){
  if(historyBusy)return;
  historyBusy=true;
  const summary=byId('login-history-summary'),list=byId('login-history-list');
  try{
    const data=await getJson('/api/control/history');
    const runs=Array.isArray(data.runs)?data.runs:[];
    list.replaceChildren();
    const failures=runs.filter(x=>x.result==='server_id_conflict').length;
    const successes=runs.filter(x=>x.result==='spawned').length;
    summary.textContent=runs.length?
      '最近 '+runs.length+' 次记录：成功 '+successes+' 次，身份冲突 '+failures+
       ' 次。'+(data.hasSuccessfulBaseline?
         (data.latestChange?.length?'最近失败相对成功样本存在 '+data.latestChange.length+' 项结构差异':
           '有成功样本；未发现可展示的结构差异'):'没有当前版本的成功样本，原因仍未确认'):
      '尚无新版本连接记录；以后的正常登录会自动采集，无需重做旧版 A/B 测试。';
    for(const item of runs.slice().reverse()){
      const time=Number.isFinite(item.startedAt)&&item.startedAt>0?
        new Date(item.startedAt).toLocaleString('zh-CN'):'时间未知';
      const title=node('strong',{text:(loginResultLabels[item.result]||'状态未知')+' · '+time});
      const meta=node('p',{text:(item.mode||'unknown')+' · 最后阶段 '+(item.phase||'unknown')});
      const detail=node('details',{},[
        node('summary',{text:'查看不含身份信息的校验字段'}),
        node('pre',{class:'control-diag',text:JSON.stringify(item.login||{},null,2)})
      ]);
      list.append(node('article',{class:'login-history-item'},[title,meta,detail]));
    }
    if(!runs.length)list.append(node('p',{class:'empty',text:'暂无匿名握手记录。'}));
  }catch(err){
    summary.textContent='读取匿名历史失败：'+errorText(err);
  }finally{historyBusy=false}
}
function validDistance(value){const n=Number(value);return Number.isInteger(n)&&n>=2&&n<=12?n:null}
async function saveControlSettings(){
  if(!localControl){toast('仅支持在 Mac 127.0.0.1 打开控制台后修改');return}
  const follow=validDistance(byId('setting-follow').value);
  const occluded=validDistance(byId('setting-occluded').value);
  if(follow===null||occluded===null){toast('跟随距离只能填写 2～12 的整数');return}
  const button=byId('save-settings');button.disabled=true;
  byId('control-feedback').textContent='正在保存到 Mint…';
  try{
    const r=await fetch('/api/control/settings',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({followDistance:follow,occludedDistance:occluded,
        autonomyEnabled:byId('setting-autonomy').checked,agentMode:byId('setting-mode').value})});
    const body=await r.json();
    if(!r.ok)throw Error(body.error||'HTTP '+r.status);
    controlEditing=false;
    toast('✓ 已保存至 Mint · v'+body.saved.revision);
    await loadControl()
  }catch(err){
    byId('control-feedback').textContent='未保存：'+errorText(err);
    toast('保存失败，Alice 参数未确认改变')
  }finally{button.disabled=false}
}
function formatBytes(bytes){return bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KiB':(bytes/1048576).toFixed(1)+' MiB'}
async function loadLogs(){const list=byId('log-list');byId('log-status').textContent='正在连接 Mint…';list.replaceChildren();try{const data=await getJson('/api/logs');byId('log-status').textContent='找到 '+data.logs.length+' 份运行日志';for(const item of data.logs){const b=node('button',{class:'log-item'+(selectedLog===item.name?' active':''),text:item.name},[node('small',{text:formatBytes(item.bytes)})]);b.addEventListener('click',()=>loadLog(item.name));list.append(b)}if(!data.logs.length)list.append(node('p',{class:'empty',text:'暂无日志。请先通过 deploy-and-run.sh 运行新版本 Alice。'}))}catch(err){list.append(node('p',{class:'empty',text:'无法读取 Mint 日志：'+errorText(err)}));byId('log-status').textContent='远程连接不可用'}}
async function loadLog(name){selectedLog=name;byId('log-name').textContent=name;byId('log-detail').textContent='读取中…';byId('download-log').disabled=true;try{const data=await getJson('/api/logs/'+encodeURIComponent(name)+'/tail');originalLog=data.text;byId('log-detail').textContent=formatBytes(data.bytes)+(data.truncated?' · 仅显示最后96 KiB':' · 全部显示');byId('download-log').disabled=data.bytes>16*1048576;filterLog();for(const b of document.querySelectorAll('.log-item'))b.classList.toggle('active',b.textContent.includes(name))}catch(err){originalLog='读取失败：'+errorText(err);byId('log-text').textContent=originalLog;byId('log-detail').textContent='读取失败'}}
function filterLog(){const text=byId('log-filter').value.trim();if(!text){byId('log-text').textContent=originalLog;return}byId('log-text').textContent=originalLog.split('\n').filter(line=>line.toLowerCase().includes(text.toLowerCase())).join('\n')||'预览中没有匹配行。'}
function downloadLog(){if(!selectedLog)return;const anchor=node('a',{href:'/api/logs/'+encodeURIComponent(selectedLog)+'/download',download:selectedLog});document.body.append(anchor);anchor.click();anchor.remove()}
async function exportAcceptance(){
  const buttons=[byId('export-acceptance'),byId('world-export')].filter(Boolean);
  buttons.forEach(b=>b.disabled=true);
  try{
    const response=await fetch('/api/acceptance/3',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status+'（请在 Mac 本机打开控制台）');
    const bytes=await response.blob();
    const url=URL.createObjectURL(bytes);
    const anchor=node('a',{href:url,download:'AliceAI-Acceptance-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip'});
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    toast('✅ 已下载近 3 小时匿名验收 ZIP');
  }catch(err){toast('❌ 导出失败：'+errorText(err))}
  finally{buttons.forEach(b=>b.disabled=false)}
}
for(const b of document.querySelectorAll('.nav'))b.addEventListener('click',()=>show(b.dataset.page));
for(const b of document.querySelectorAll('[data-go-control]'))b.addEventListener('click',()=>show('control'));
for(const id of ['setting-follow','setting-occluded','setting-autonomy','setting-mode']){
  byId(id).addEventListener(['setting-autonomy','setting-mode'].includes(id)?'change':'input',()=>{controlEditing=true;byId('control-feedback').textContent='参数尚未保存'})
}
for(const id of ['setting-follow','setting-occluded','setting-autonomy','setting-mode','save-settings']){
  byId(id).disabled=!localControl
}
if(!localControl)byId('control-feedback').textContent='当前为局域网只读模式；请在 Mac 本机 127.0.0.1 打开以修改行为。';
byId('save-settings').addEventListener('click',saveControlSettings);
byId('refresh-control').addEventListener('click',()=>{loadControl();loadConnectionHistory()});byId('feature-search').addEventListener('input',renderFeatures);byId('command-search').addEventListener('input',renderCommands);byId('command-status').addEventListener('change',renderCommands);byId('refresh-logs').addEventListener('click',loadLogs);byId('log-filter').addEventListener('input',filterLog);byId('download-log').addEventListener('click',downloadLog);byId('export-acceptance').addEventListener('click',exportAcceptance);byId('world-export').addEventListener('click',exportAcceptance);
show(['overview','control','commands','logs','bedrock','world'].includes(location.hash.slice(1))?location.hash.slice(1):'overview');loadCatalog();loadControl();loadConnectionHistory();setInterval(loadControl,6000);setInterval(loadConnectionHistory,12000);
