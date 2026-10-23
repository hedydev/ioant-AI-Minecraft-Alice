'use strict'
// Safe, bounded Bedrock connection diagnostics. Never dump login packets,
// certificates, session tokens, profiles or arbitrary packet contents.
const PHASES = Object.freeze({
  created: 'created',
  transport: 'transport_connected',
  network: 'network_settings_received',
  login: 'login_sent',
  joined: 'encryption_handshake_accepted',
  game: 'start_game_received',
  spawned: 'spawn_confirmed'
})
const MAX_MESSAGE = 180
function cleanScalar(value, limit = MAX_MESSAGE) {
  if (value == null) return null
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null
  // Hide accidental JWT/base64-like blobs from server-supplied kick messages.
  const s = String(value).replace(/[\r\n\t\x00-\x1f]/g, ' ').trim()
  if (s.length > limit || /eyJ[A-Za-z0-9_-]{50,}/.test(s) || /[A-Za-z0-9+/_-]{100,}/.test(s)) return '[redacted]'
  return s.slice(0, limit)
}
function safeDisconnect(packet) {
  if (!packet || typeof packet !== 'object') return { received: Boolean(packet), message: cleanScalar(packet) }
  return {
    received: true,
    message: cleanScalar(packet.message),
    reason: cleanScalar(packet.reason),
    filteredMessage: cleanScalar(packet.filtered_message),
    hideDisconnectScreen: packet.hide_disconnect_screen === true,
    hideDisconnectReason: packet.hide_disconnect_reason === true
  }
}
function attachConnectionDiagnostics(bot, { log = console, clock = Date.now } = {}) {
  if (!bot || !bot._client || typeof bot._client.on !== 'function') throw Error('Bedrock protocol client required')
  const client = bot._client
  let phase = PHASES.created
  const started = clock()
  let disconnect = null
  const advance = (name) => {
    phase = name
    log.log('[Alice wire] phase=' + name + ' elapsedMs=' + Math.max(0, clock() - started))
  }
  client.on('connect', () => advance(PHASES.transport))
  client.on('network_settings', () => advance(PHASES.network))
  client.on('loggingIn', () => advance(PHASES.login))
  client.on('join', () => advance(PHASES.joined))
  client.on('start_game', () => advance(PHASES.game))
  client.on('spawn', () => advance(PHASES.spawned))
  client.on('alice_initialization', () => {
    log.log('[Alice wire] initial_loading_complete_queued protocol=2193 packets=3')
  })
  client.on('play_status', (packet) => {
    const status = cleanScalar(packet?.status, 60)
    if (status !== null) log.log('[Alice wire] play_status=' + status + ' phase=' + phase)
  })
  client.on('disconnect', (packet) => {
    disconnect = safeDisconnect(packet)
    log.warn('[Alice wire] server_disconnect phase=' + phase + ' details=' + JSON.stringify(disconnect))
  })
  client.on('close', () => {
    const diagnostic = { phase, elapsedMs: Math.max(0, clock() - started), receivedServerDisconnect: disconnect !== null }
    log.warn('[Alice wire] session_closed ' + JSON.stringify(diagnostic))
    if (phase !== PHASES.spawned) {
      if(disconnect?.reason==='server_id_conflict'){
        log.warn('[Alice wire] SERVER_ID_CONFLICT: recurring intermittent pre-spawn rejection, NOT proven fixed by the successful legacy-native-injected login. Prior native/chat vs Mineflayer A/B and authenticated spawn have already been verified; do not repeat that comparison as default troubleshooting. The specific server rejection cause remains unknown until BDS authentication/session evidence exists. No automatic retry, Xbox cache deletion, online-mode downgrade or world modification.')
      }else{
        log.warn('[Alice wire] pre-spawn disconnect: inspect the bedrock-default MCManager console and ensure no other Alice client is active. Do NOT delete auth cache or disable online-mode.')
      }
    }
  })
  return { getPhase: () => phase, getDisconnect: () => disconnect }
}
module.exports = { attachConnectionDiagnostics, safeDisconnect, cleanScalar, PHASES }
