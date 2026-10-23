// Vendored from Pix3lPirat3/mineflayer@b24015a (single pinned plugin).
// Bedrock fork keeps this API; we override ONLY client_input via plugin injection.
// This file is authoritative for Alice's 20Hz tick/frame/input contract.
const conv = require('mineflayer/lib/conversions')
const Vec3 = require('vec3')
const { Physics, PlayerState } = require('prismarine-physics')
const {capturePhysicalFrame,restorePhysicalFrame}=require('./physics_frame_snapshot.cjs')

module.exports = inject

function inject (bot, options={}) {
  // Diagnostic A/B experiment. In PlayerAuthInput the client supplies an
  // input-frame tick. The StartGame level current time is NOT necessarily
  // the player's first frame tick. Do not change the default without BDS proof.
  const tickMode=options.aliceInputTickMode==='client_local_1'?'client_local_1':'world_anchor'
  let localTickStarted=false
  // World view the physics engine queries for collision (loaded chunks only; unloaded reads null and the server reconciles).
  const world = { getBlock: (pos) => (typeof bot.blockAt === 'function' ? bot.blockAt(pos) : null) }
  let timer
  let spawned = false
  let movementAuthority = 'server'
  // While riding a vehicle the server drives the passenger's position (via move_player for the bot's own runtime id).
  // Running the self physics simulation would apply gravity locally and overwrite that server position each tick,
  // sinking the bot through the world and leaving it underground on dismount. Java suspends physics on 'mount' and
  // resumes it from the server's authoritative position; mirror that here so the boat position stands.
  let ridingSuspended = false

  // Bedrock server-authoritative movement uses a rewind buffer (start_game.rewind_history_size, e.g. 40 ticks) and
  // correlates each player_auth_input to a server tick. An input whose tick is outside that window is dropped, so the
  // player never moves. Two things make a simple `tick++` per send drift out of the window: the server's tick is not
  // zero at join (start_game.current_tick), and our send timer does not fire at exactly 20 Hz (event-loop jitter drops
  // it to ~16 Hz under load), so counting sends falls behind the server's real tick by tens of ticks within seconds.
  // Instead we anchor to a known (serverTick, wall-clock) pair and derive each input's tick from elapsed real time, and
  // re-anchor from correct_player_move_prediction.tick (the server's authoritative tick), which keeps us in the window.
  const toTick = (v) => {
    if (v == null) return 0n
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.floor(v))
    if (Array.isArray(v)) return (BigInt(v[0] >>> 0) << 32n) | BigInt(v[1] >>> 0) // [high, low]
    try { return BigInt(v) } catch { return 0n }
  }
  let anchorTick = 0n
  let anchorTime = Date.now()
  let lastEmittedTick = null
  const MAX_CATCHUP_TICKS=32
  const timeline={version:1,tickMode,emitted:0,batches:0,catchupFrames:0,
    maxBatchFrames:0,overruns:0,skippedTicks:0,lastBatchFrames:0,
    controlsChangedInsideFrame:0,lastOverrunReason:null,
    callbackPositionMutationsPrevented:0,callbackVelocityMutationsPrevented:0,
    callbackContactMutationsPrevented:0}
  bot._aliceBedrockInputSync={summary:()=>({...timeline})}

  const currentTick = () => anchorTick + BigInt(Math.max(0, Math.round((Date.now() - anchorTime) / 50)))
  bot._client.once('start_game', packet => {
    movementAuthority = packet.movement_authority ?? 'server'
    if (tickMode==='world_anchor' && packet.current_tick != null) {
      anchorTick = toTick(packet.current_tick); anchorTime = Date.now()
    }
  })
  bot._client.on('set_movement_authority', packet => {
    movementAuthority = packet.movement_authority
    if (movementAuthority === 'client') stop()
    else if (spawned) start()
  })
  bot.on('spawn', () => {
    spawned = true
    if (movementAuthority !== 'client') start()
  })
  // Suspend self-simulation while mounted; the server keeps bot.entity on the vehicle via move_player. On dismount the
  // server has already placed the bot at the exit position (surface, not underground) - clear leftover velocity so the
  // resumed engine continues from there instead of flinging the bot with a stale downward delta.
  bot.on('mount', () => { ridingSuspended = true; if (bot.entity && bot.entity.velocity) bot.entity.velocity.set(0, 0, 0) })
  bot.on('dismount', () => { ridingSuspended = false; if (bot.entity && bot.entity.velocity) bot.entity.velocity.set(0, 0, 0) })
  bot._client.once('close', stop)

  function start () {
    if (timer) return
    if(tickMode==='client_local_1'&&!localTickStarted){
      // First simulated player frame begins at 1, at spawn confirmation,
      // not at world LevelCurrentTime observed several seconds before spawn.
      anchorTick=1n
      anchorTime=Date.now()
      lastEmittedTick=null
      localTickStarted=true
    }
    send()
    timer = setInterval(send, 50)
    timer.unref?.()
  }

  function stop () {
    clearInterval(timer)
    timer = undefined
  }

  // 1.26.40 to 1.26.45 wrap the optional fields in an outer presence bool that the vanilla client always sends as
  // true; 1.26.50 dropped it. Read the schema instead of hardcoding the version range.
  const inputFields = (bot.registry.protocol?.types?.packet_player_auth_input?.[1] || []).map(f => f && f.name).filter(n => typeof n === 'string')
  const presenceFlags = Object.fromEntries(inputFields.filter(n => n.endsWith('_presence')).map(n => [n, true]))
  const modern = bot.registry.version['>=']('1.26.40')

  // Block breaking on 1.26 rides the auth input, not a standalone packet: the real client puts start_break /
  // continue_break / predict_break / abort_break entries in block_action and sets the matching input_data flag (see
  // reviews capture). Other plugins (digging) enqueue actions here; send() drains them into the next tick.
  const pendingBlockActions = []
  bot._queueBlockAction = (...entries) => { for (const e of entries) if (e) pendingBlockActions.push(e) }

  // Movement. Bedrock 1.26 is server-authoritative: the client reports its input each tick (a local-frame move_vector
  // plus input-flag presses) and the server simulates and returns the authoritative position in correct_player_move_
  // prediction, which we apply. So setControlState only records intent; send() turns it into the move_vector/flags and
  // the server drives the actual motion. Verified live: forward input walks the bot and the corrections track it.
  const controlStateValues = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  bot.setControlState = (control, state) => {
    if (!(control in controlStateValues)) throw new Error(`unknown control state: ${control}`)
    state = !!state
    const wasPressed = controlStateValues[control]
    controlStateValues[control] = state
    // Jump is an impulse the physics engine consumes via jumpQueued (as mineflayer's Java controlState setter does).
    if (control === 'jump' && state && !wasPressed) bot.jumpQueued = true
  }
  bot.getControlState = (control) => {
    if (!(control in controlStateValues)) throw new Error(`unknown control state: ${control}`)
    return controlStateValues[control]
  }
  bot.clearControlStates = () => { for (const k of Object.keys(controlStateValues)) controlStateValues[k] = false }
  // Live proxy (Java parity): bot.controlState.jump = true routes through setControlState, so a direct assignment also
  // queues the jump impulse rather than silently not being consumed by the physics engine.
  bot.controlState = {}
  for (const k of Object.keys(controlStateValues)) {
    Object.defineProperty(bot.controlState, k, { enumerable: true, get: () => controlStateValues[k], set: (v) => bot.setControlState(k, v) })
  }

  // Wait for N physics ticks (mineflayer-java parity; used across the ecosystem to pace actions to the 20 Hz tick).
  bot.waitForTicks = async (ticks) => {
    if (!(ticks > 0)) return
    let remaining = ticks
    await new Promise((resolve) => {
      const onTick = () => { if (--remaining <= 0) { bot.removeListener('physicsTick', onTick); resolve() } }
      bot.on('physicsTick', onTick)
    })
  }

  // Steer the current vehicle (mineflayer-java parity). left/forward are -1..1; on Bedrock a ridden mount is driven by
  // the same move_vector the control states produce (verified: a saddled horse walks on forward), so map the analog
  // intent onto the control states. No-op with no vehicle.
  bot.moveVehicle = (left, forward) => {
    if (!bot.vehicle) return
    bot.setControlState('forward', forward > 0)
    bot.setControlState('back', forward < 0)
    bot.setControlState('left', left > 0)
    bot.setControlState('right', left < 0)
  }

  // Look control (mirrors the Java physics plugin). Bedrock transmits yaw/pitch on every player_auth_input tick, so
  // setting the entity look is enough; we keep vanilla's sensitivity rounding for anticheat parity. bot.lookAt/look are
  // what pathfinder and the interaction plugins call to aim before moving/placing/digging.
  bot.look = async (yaw, pitch, force) => {
    const sensitivity = conv.fromNotchianPitch(0.15) // 100% vanilla sensitivity
    const yawChange = Math.round((yaw - (bot.entity.yaw || 0)) / sensitivity) * sensitivity
    const pitchChange = Math.round((pitch - (bot.entity.pitch || 0)) / sensitivity) * sensitivity
    if (yawChange === 0 && pitchChange === 0) return
    bot.entity.yaw = (bot.entity.yaw || 0) + yawChange
    bot.entity.pitch = (bot.entity.pitch || 0) + pitchChange
    // Unless forced/ignored, await one send tick so the new orientation is transmitted in a player_auth_input before the
    // caller acts (Java's bot.look resolves only once the rotation has been applied). This keeps a look-then-attack /
    // useOn from firing with the pre-look yaw. force === 'ignore' (or true) resolves immediately, matching Java.
    if (force === 'ignore' || force === true) return
    if (typeof bot.waitForTicks === 'function' && bot.physicsEnabled !== false) await bot.waitForTicks(1)
  }
  bot.lookAt = async (point, force) => {
    const p = (point && typeof point.minus === 'function') ? point : new Vec3(point.x, point.y, point.z)
    const delta = p.minus(bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0))
    const yaw = Math.atan2(-delta.x, -delta.z)
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
    const pitch = Math.atan2(delta.y, groundDistance)
    await bot.look(yaw, pitch, force)
  }

  // Physics. Bedrock movement is server-authoritative, but BDS accepts a client that self-simulates and reports its
  // position (verified: near-vanilla walk/sprint on open ground with zero corrections). So we run the shared
  // prismarine-physics engine each tick - the same collision, step-up, gravity and jump that Java uses, now edition-aware
  // for Bedrock - and report the result over player_auth_input; correct_player_move_prediction is the authoritative
  // correction. Running the shared engine also gives bot.physics, bot.entity.onGround and a physicsTick, which is what
  // mineflayer-pathfinder consumes, so pathfinder works on Bedrock without a bespoke movement model.
  bot.physics = Physics(bot.registry, world)
  if (bot.physicsEnabled === undefined) bot.physicsEnabled = true
  bot.jumpTicks = bot.jumpTicks || 0
  bot.jumpQueued = false
  bot.fireworkRocketDuration = bot.fireworkRocketDuration || 0
  bot._glideQueued = false

  // Elytra flight (mineflayer-java bot.elytraFly). On Bedrock, gliding is a player_auth_input intent: send the
  // 'start_gliding' input flag while airborne with an elytra worn, and the server flips the 'gliding' actor flag, which
  // entities.js mirrors to bot.entity.elytraFlying + entityElytraFlew. Fire a firework while gliding (bot.activateItem
  // with a firework in hand) to boost, as on Java.
  bot.elytraFly = async () => {
    if (!bot.entity) throw new Error('elytraFly: no entity to glide')
    if (bot.entity.onGround) throw new Error('elytraFly: the bot must be airborne (jump or fall first)')
    if (bot.entity.isInWater) throw new Error('elytraFly: cannot start gliding in water')
    const torsoSlot = typeof bot.getEquipmentDestSlot === 'function' ? bot.getEquipmentDestSlot('torso') : null
    const chest = (torsoSlot != null && bot.inventory) ? bot.inventory.slots[torsoSlot] : null
    if (!chest || !/elytra/.test(chest.name || '')) throw new Error('elytraFly: an elytra must be equipped in the torso slot')
    if (bot.entity.elytraFlying) return
    bot._glideQueued = true
    return new Promise((resolve, reject) => {
      let done = false
      const onFlew = (e) => { if (e === bot.entity) finish(null) }
      const finish = (err) => { if (done) return; done = true; clearTimeout(to); bot.removeListener('entityElytraFlew', onFlew); if (err) reject(err); else resolve() }
      const to = setTimeout(() => finish(bot.entity.elytraFlying ? null : new Error('elytraFly: server did not confirm gliding')), 2500)
      bot.on('entityElytraFlew', onFlew)
    })
  }

  // prismarine-physics reads these entity fields; the Bedrock entity may not carry them yet, so default them in place.
  function ensurePhysicsEntity () {
    const e = bot.entity
    if (!e) return false
    if (!e.velocity) e.velocity = new Vec3(0, 0, 0)
    if (e.onGround === undefined) e.onGround = false
    if (!e.effects) e.effects = {}
    if (!e.attributes) e.attributes = {}
    for (const f of ['isInWater', 'isInLava', 'isInWeb', 'isCollidedHorizontally', 'isCollidedVertically', 'elytraFlying']) {
      if (e[f] === undefined) e[f] = false
    }
    if (!bot.inventory || !bot.inventory.slots) return false // PlayerState reads inventory slots; wait until it exists
    return true
  }

  bot._client.on('correct_player_move_prediction', (packet) => {
    // Re-anchor our tick to the server's authoritative tick so send-rate jitter never drifts us out of the rewind window.
    if (tickMode==='world_anchor' && packet.tick != null) {
      anchorTick = toTick(packet.tick); anchorTime = Date.now()
    }
    const pos = packet.position
    if (!pos || !bot.entity) return
    // While riding, the passenger position is driven from the vehicle (see send()); the standing-eye conversion below
    // does not apply to a seated player and would bury it, so ignore corrections until dismount.
    if (ridingSuspended) return
    // During creative flight we drive the position ourselves; ignore the server's ground-anchored correction so it does
    // not pull the bot back to the floor. (BDS keeps may_fly=false in the ability flags even in creative, so it treats an
    // ascent as an illegal move and would snap it down; a real creative client flies client-side the same way.)
    if (bot._creativeFlying) { return }
    // The engine predicts collision, so on valid terrain we track the server and it rarely corrects. When it does (real
    // divergence: knockback, a mis-predicted edge), take the server position and Y authoritatively and reset velocity.
    const oldPos = new Vec3(bot.entity.position.x, bot.entity.position.y, bot.entity.position.z)
    const feetY = pos.y - (bot.entity.eyeHeight || 1.62)
    const drift = Math.hypot(pos.x - bot.entity.position.x, pos.z - bot.entity.position.z)
    bot.entity.position.y = feetY
    if (drift > 0.5) {
      bot.entity.position.x = pos.x
      bot.entity.position.z = pos.z
      if (bot.entity.velocity) { bot.entity.velocity.x = 0; bot.entity.velocity.z = 0 }
    }
    if (packet.velocity) bot.entity.velocity = new Vec3(packet.velocity.x || 0, packet.velocity.y || 0, packet.velocity.z || 0)
    bot.emit('move', bot.entity.position)
    // Java fires 'forcedMove' when the server teleports the player; a large correction here (a real server-authoritative
    // move: teleport, knockback, anti-cheat pullback) is that signal. A threshold keeps routine reconciliation from
    // spamming it. Bots that watch forcedMove to detect an unexpected server move now see it on bedrock too.
    const displacement = Math.hypot(bot.entity.position.x - oldPos.x, bot.entity.position.y - oldPos.y, bot.entity.position.z - oldPos.z)
    if (displacement > 1) bot.emit('forcedMove')
  })

  // Local-frame move vector and the matching input flags for the current controls (Bedrock: +z forward, +x left).
  // Server-authoritative movement needs the edge/action flags (start_sprinting / start_sneaking / start_jumping and
  // their stop_* counterparts) to change the player's movement state, plus the sustained state flags (sprinting,
  // sneaking, sprint_down). Sending only the sustained flags leaves the server never entering the sprint/walk state,
  // so it holds the player in place. We latch the previous controls and emit the matching start_/stop_ flag on each edge.
  const prev = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  function movementInput () {
    const cs = bot.controlState
    let x = 0; let z = 0; const flags = []
    if (cs.forward) { z += 1; flags.push('up') }
    if (cs.back) { z -= 1; flags.push('down') }
    if (cs.left) { x += 1; flags.push('left') }
    if (cs.right) { x -= 1; flags.push('right') }
    if (cs.jump) { flags.push('jumping'); flags.push('want_up') }
    if (cs.jump && !prev.jump) flags.push('start_jumping')
    if (cs.sneak) { flags.push('sneaking'); flags.push('sneak_down') }
    if (cs.sneak && !prev.sneak) flags.push('start_sneaking')
    if (!cs.sneak && prev.sneak) flags.push('stop_sneaking')
    if (cs.sprint) { flags.push('sprinting'); flags.push('sprint_down') }
    if (cs.sprint && !prev.sprint) flags.push('start_sprinting')
    if (!cs.sprint && prev.sprint) flags.push('stop_sprinting')
    // Elytra: request gliding while queued and airborne; stop once the server confirms it (elytraFlying) or we land.
    // Bedrock's glide is jump-initiated, so pair start_gliding with a jump press on the first trigger tick.
    if (bot._glideQueued) {
      if (bot.entity.elytraFlying || bot.entity.onGround) { bot._glideQueued = false; bot._glideSent = false } else {
        flags.push('start_gliding')
        if (!bot._glideSent) { if (!flags.includes('jumping')) flags.push('jumping'); if (!flags.includes('want_up')) flags.push('want_up'); if (!flags.includes('start_jumping')) flags.push('start_jumping'); bot._glideSent = true }
      }
    }
    for (const k of Object.keys(prev)) prev[k] = cs[k]
    return { vector: { x, z }, flags }
  }

  // Each physics tick now emits its OWN input, orientation and predicted
  // position. Pathfinder updates controls on physicsTick; those updates belong
  // to the NEXT frame, never to the frame just simulated.
  function send () {
    if (!bot.entity) return
    const target=currentTick()
    const delta=lastEmittedTick==null?1:Number(target-lastEmittedTick)
    if(!Number.isSafeInteger(delta))return
    if(delta<=0)return // no duplicate movement tick (50ms scheduler jitter)
    timeline.batches++
    if(delta>MAX_CATCHUP_TICKS){
      // >1.6s: history too old for confident client simulation.
      // Do not invent many old physics steps, teleport or hide dropped ticks.
      timeline.overruns++
      timeline.skippedTicks+=delta
      timeline.lastOverrunReason='catchup_window_exceeded'
      timeline.lastBatchFrames=0
      lastEmittedTick=target
      bot.clearControlStates()
      bot.pathfinder?.stop?.()
      return
    }
    timeline.lastBatchFrames=delta
    timeline.maxBatchFrames=Math.max(timeline.maxBatchFrames,delta)
    if(delta>1)timeline.catchupFrames+=delta-1
    const firstTick=target-BigInt(delta-1)
    for(let i=0;i<delta;i++){
      const tick=firstTick+BigInt(i)
      const move=movementInput()
      const preFlags=move.flags
      const preYaw=bot.entity.yaw||0,prePitch=bot.entity.pitch||0
      const pitch=conv.toNotchianPitch(prePitch),yaw=conv.toNotchianYaw(preYaw)
      const blockActions=pendingBlockActions.splice(0)
      const flags=modern?['block_breaking_delay_enabled']:{block_breaking_delay_enabled:true}
      if(blockActions.length){if(Array.isArray(flags))flags.push('block_action');else flags.block_action=true}
      for(const f of preFlags){if(Array.isArray(flags))flags.push(f);else flags[f]=true}
      // One physics step (and its physicsTick callback) for precisely this tick.
      // A control change in callbacks must not retroactively affect packet input.
      if(bot._creativeFlying){
        bot.emit('physicsTick');bot.emit('physicTick')
      }else if(bot.physicsEnabled!==false&&!ridingSuspended&&ensurePhysicsEntity()){
        bot.physics.simulatePlayer(new PlayerState(bot,bot.controlState),world).apply(bot)
        if(bot.fireworkRocketDuration>0){
          bot.fireworkRocketDuration--
          if(bot.entity.onGround)bot.fireworkRocketDuration=0
        }
        // Capture the FINAL applied physics state BEFORE Pathfinder's
        // physicsTick callback. The pinned Pathfinder fullStop() can snap
        // x/z to block centre and zero vx/vz during that callback. Such
        // changes are NOT part of the just simulated input frame, and must
        // not contaminate its packet or the next frame's starting point.
        const physicalFrame=capturePhysicalFrame(bot.entity)
        try{
          bot.emit('physicsTick');bot.emit('physicTick')
        }finally{
          const corrected=restorePhysicalFrame(bot.entity,physicalFrame)
          if(corrected.positionMutated)timeline.callbackPositionMutationsPrevented++
          if(corrected.velocityMutated)timeline.callbackVelocityMutationsPrevented++
          if(corrected.contactMutated)timeline.callbackContactMutationsPrevented++
        }
      }else if(ridingSuspended&&bot.vehicle?.position){
        bot.entity.position.set(bot.vehicle.position.x,bot.vehicle.position.y,bot.vehicle.position.z)
        if(bot.entity.velocity)bot.entity.velocity.set(0,0,0)
        if(Array.isArray(flags))flags.push('client_predicted_vehicle')
        else flags.client_predicted_vehicle=true
      }
      if(bot.controlState.forward!==prev.forward||
         bot.controlState.back!==prev.back||bot.controlState.left!==prev.left||
         bot.controlState.right!==prev.right||bot.controlState.jump!==prev.jump||
         bot.controlState.sprint!==prev.sprint||bot.controlState.sneak!==prev.sneak)
        timeline.controlsChangedInsideFrame++
      if(Array.isArray(flags)){
        if(bot.entity.onGround)flags.push('vertical_collision')
        if(bot.entity.isCollidedHorizontally)flags.push('horizontal_collision')
      }else{
        if(bot.entity.onGround)flags.vertical_collision=true
        if(bot.entity.isCollidedHorizontally)flags.horizontal_collision=true
      }
      const vel=bot.entity.velocity||{x:0,y:0,z:0}
      const cosPitch=Math.cos(prePitch)
      const packet={
        pitch,yaw,
        position:{x:bot.entity.position.x,y:bot.entity.position.y+(bot.entity.eyeHeight||1.62),z:bot.entity.position.z},
        move_vector:{x:move.vector.x,z:move.vector.z},head_yaw:yaw,input_data:flags,
        input_mode:'mouse',play_mode:'screen',interaction_model:'touch',
        interact_rotation:{x:pitch,z:yaw},tick,
        delta:{x:vel.x,y:vel.y,z:vel.z},...presenceFlags,
        // Preserve the fork's default analog behaviour. An optional 2193
        // compatibility layer may align this with nonzero desired movement.
        analogue_move_vector:{x:0,z:0},
        camera_orientation:{x:-Math.sin(preYaw)*cosPitch,y:Math.sin(prePitch),z:-Math.cos(preYaw)*cosPitch},
        raw_move_vector:{x:move.vector.x,z:move.vector.z}
      }
      if(blockActions.length)packet.block_action=blockActions
      if(ridingSuspended&&bot.vehicle){
        const uid=bot.vehicle.uniqueId
        packet.predicted_vehicle=typeof uid==='bigint'?uid:BigInt(uid??0)
        packet.vehicle_rotation={x:conv.toNotchianPitch(bot.vehicle.pitch||0),
          z:conv.toNotchianYaw(bot.vehicle.yaw||preYaw||0)}
      }
      bot._client.queue('player_auth_input',packet)
      timeline.emitted++
      lastEmittedTick=tick
    }
  }
}
