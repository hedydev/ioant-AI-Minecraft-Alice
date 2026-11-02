'use strict'
// Separate three independent facts: bed interaction, personal-spawn ACK,
// and a genuine sleeping-state observation. Never infer one from another.
const ACTIONS=new Set(['sleep','set_spawnpoint'])
function outcome(action,{spawnConfirmed=false,sleepEntered=false,
  woke=false,sleepWindow=false,reason='unconfirmed',bed=null}={}){
 if(!ACTIONS.has(action))return {ok:false,reason:'unsupported_bed_action'}
 if(action==='set_spawnpoint'){
  return {ok:spawnConfirmed,reason:spawnConfirmed?
    'personal_spawn_server_confirmed':reason,
    spawnConfirmed,sleepEntered,nightSkipped:false,bed}
 }
 if(sleepEntered)return {ok:true,reason:woke?'sleep_entered_then_woke':
     'sleep_entry_confirmed',spawnConfirmed,sleepEntered:true,
     nightSkipped:false,bed}
 if(spawnConfirmed)return {ok:false,reason:sleepWindow?
   'spawn_confirmed_sleep_not_entered':'spawn_confirmed_daytime_no_sleep',
   spawnConfirmed:true,sleepEntered:false,nightSkipped:false,bed}
 return {ok:false,reason:!sleepWindow?'sleep_outside_window':reason,
   spawnConfirmed:false,sleepEntered:false,nightSkipped:false,bed}
}
const message=r=>{
 switch(r?.reason){
  case 'personal_spawn_server_confirmed':return '已收到服务器个人重生点确认；这不代表已睡觉。'
  case 'sleep_entry_confirmed':return '已观察到 Alice 真正进入睡眠；尚未确认世界跳过夜晚。'
  case 'sleep_entered_then_woke':return '已确认 Alice 入睡后起床；不表示所有玩家都跳过了夜晚。'
  case 'spawn_confirmed_daytime_no_sleep':return '重生点已设置；当前不能睡觉（不是可睡时间）。'
  case 'spawn_confirmed_sleep_not_entered':return '重生点已设置，但尚未确认真正入睡。'
  case 'sleep_outside_window':return '现在不能睡觉；尚未进入夜晚或允许睡觉的天气。'
  case 'bed_needs_verified_approach':return '已发现床，但还没有验证到达床边的安全路线。'
  case 'bed_route_requires_door':return '床附近观察到木门，开门及穿门尚未经过独立BDS验收；不会直接穿过去。'
  case 'bed_route_requires_shape_navigation':return '通往床的路线发现台阶、半砖或其他复杂碰撞；需要专门的形状导航验证。'
  case 'no_loaded_free_bed':return '当前已加载区域未找到可用床；会保留自主探索时的找床目标。'
  case 'scout_bds_position_unavailable':return '正在等待新鲜的 BDS 双样本位置证明，没有移动或使用床。'
  case 'bed_spawn_packet_unconfirmed':return '尝试使用床，但未收到服务器重生点确认。'
  case 'no_unblocked_safe_bed_in_radius':return '床不可睡：可能被占用、附近有怪物，或床方块尚未验证。'
  default:return '床任务未确认完成：'+String(r?.reason||'unknown').slice(0,65)
 }
}
module.exports={outcome,message}
