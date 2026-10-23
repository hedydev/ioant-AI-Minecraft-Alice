'use strict'

function parseInstruction(message, botName = 'AliceAI') {
  const raw = String(message ?? '').trim()
  if (!raw || raw.length > 400) return null
  const pattern = /^(?:@?aliceai|@?alice|ai)(?:[\s,:，：]+)(.+)$/i
  const match = raw.match(pattern)
  if (match) return match[1].trim()
  // Short, unambiguous game commands can be addressed without a prefix.
  if (/^(你在干嘛[？?]?|你在哪里[？?]?|状态|帮助|背包有什么|跟着我|跟我走|跟随我|收集木头|停止)$/u.test(raw)) return raw
  return null
}

function responseFor(command, { spawned = false, playerCount = null } = {}) {
  const content = String(command || '').trim()
  if (/^(状态|你在干嘛[？?]?|你在哪里[？?]?)$/u.test(content)) {
    return spawned
      ? `我已进入基岩世界。当前为连接与聊天验证阶段；跟随、采集和战斗尚未接入。${Number.isInteger(playerCount) ? ` 已观察到${playerCount}名玩家。` : ''}`
      : '我正在连接基岩服务器，尚未确认生成。'
  }
  if (/^(帮助|help|能力|能做什么)$/iu.test(content)) {
    return '已接入基岩聊天。可用：AliceAI 状态、AliceAI 帮助。跟随/采集/保护玩家仍待协议动作验证。'
  }
  if (/(跟着我|跟随|收集|采集|挖|建造|攻击|保护|制作|给我|箱子)/u.test(content)) {
    return '指令已收到，但基岩世界中的移动/采集/战斗还未完成安全适配，我不会假装执行成功。'
  }
  return null
}

module.exports = { parseInstruction, responseFor }