'use strict'
// Safe *stationary* eating behind a positively observed barrier; not an
// exemption for walking, fighting, sleeping or recovering from active damage.
function safeShelteredFood({danger=null,escort=null,health=0,recentHurtAt=0,now=0}={}){
 if(!Number.isFinite(health)||health<=0)return false
 if(!danger)return true
 if(health<=8||!Number.isFinite(now)||
    (recentHurtAt>0&&now-recentHurtAt>=0&&now-recentHurtAt<=6500))return false
 return escort?.reason==='hostile_behind_observed_barrier'&&escort.allowFollow===true
}
module.exports={safeShelteredFood}
