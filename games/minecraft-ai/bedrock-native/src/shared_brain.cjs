'use strict'
// Shares the SAME protocol-neutral policies as Java/Paper Alice.
// Deliberately does not import Mineflayer-bound movement, crafting or combat executors.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const SOURCE = path.resolve(__dirname, '..', '..', 'runtime', 'alice_modules')
const FRESH_POSITION_MS = 30_000
const COUNT_REPLY_MS = 45_000
const finite = v => typeof v === 'number' && Number.isFinite(v)
const sanePosition = p => p && [p.x, p.y, p.z].every(finite) && Math.abs(p.x) <= 30_000_000 && Math.abs(p.z) <= 30_000_000 && Math.abs(p.y) <= 4096
const dim = x => ({0:'主世界',1:'下界',2:'末地'})[String(x)] || null

async function loadPaperPolicies () {
  const names = ['inventory_policy', 'wood_policy', 'safety_policy', 'social_policy', 'recipe_plan', 'terrain_policy', 'task_observation', 'intent_policy']
  const modules = await Promise.all(names.map(name => import(pathToFileURL(path.join(SOURCE, name + '.js')).href)))
  return Object.fromEntries(names.map((name, i) => [name, modules[i]]))
}

class NativeAliceBrain {
  constructor (policies, clock = () => Date.now()) {
    this.policies = policies
    this.clock = clock
    this.spawned = false
    this.intent = { state:'IDLE', source:null, at:0 }
    this.position = null
    this.positionKind = null
    this.positionAt = 0
    this.dimension = null
    this.entityId = null
    this.health = null
    this.maxHealth = null
    this.inventory = null // Never interpret numeric network IDs as item names.
    this.pendingCounts = new Map()
    this.latestRisk = null
  }

  onSpawn () { this.spawned = true }
  onEnd () { this.spawned = false; this.pendingCounts.clear() }

  observeStartGame (packet) {
    if (!packet || typeof packet !== 'object') return
    const id = packet.runtime_entity_id
    if (typeof id === 'bigint' || typeof id === 'string' || typeof id === 'number') this.entityId = String(id)
    if (dim(packet.dimension)) this.dimension = dim(packet.dimension)
    // A start_game position is a spawn snapshot, not continuous tracking.
    if (sanePosition(packet.player_position)) {
      this.position = { x:packet.player_position.x, y:packet.player_position.y, z:packet.player_position.z }
      this.positionAt = this.clock()
      this.positionKind = 'spawn'
    }
  }

  observeMovePlayer (packet) {
    if (!packet || this.entityId === null || String(packet.runtime_entity_id) !== this.entityId) return
    if (!sanePosition(packet.position)) return
    this.position = { x:packet.position.x, y:packet.position.y, z:packet.position.z }
    this.positionAt = this.clock()
    this.positionKind = 'observed'
  }

  observeAttributes (packet) {
    if (!packet || this.entityId === null || String(packet.runtime_entity_id) !== this.entityId || !Array.isArray(packet.attributes)) return
    const h = packet.attributes.find(attr => attr?.name === 'minecraft:health' && finite(attr.current))
    if (h && h.current >= 0 && h.current <= 2048) {
      this.health = h.current
      const maximum = h.max ?? h.max_value
      if (finite(maximum) && maximum >= h.current && maximum <= 2048) this.maxHealth = maximum
    }
  }

  // The Bedrock item wire format is not Mineflayer's inventory item API.
  // Only a verified, named adapter may furnish canonical item stacks.
  observeVerifiedInventory (stacks, {slots, inventoryStart, inventoryEnd} = {}) {
    if (!Array.isArray(stacks) || stacks.some(i => !/^[a-z0-9_]{1,80}$/.test(i?.name || '') || !Number.isSafeInteger(i.count) || i.count < 1))
      throw new Error('Inventory adapter must provide validated canonical item names and positive counts')
    const proxy = { inventory: { items: () => stacks.map(i => ({...i})) } }
    if (Array.isArray(slots) && Number.isInteger(inventoryStart) && Number.isInteger(inventoryEnd)) {
      proxy.inventory.slots = slots
      proxy.inventory.inventoryStart = inventoryStart
      proxy.inventory.inventoryEnd = inventoryEnd
    }
    this.inventory = this.policies.inventory_policy.inventorySnapshot(proxy)
  }

  hasPendingCount (sender) {
    const pending = this.pendingCounts.get(sender)
    if (!pending) return false
    if (this.clock() - pending.at > COUNT_REPLY_MS) { this.pendingCounts.delete(sender); return false }
    return true
  }

  stateSummary () {
    if (!this.spawned) return '还没有确认进入基岩世界。'
    const suffix = this.intent.state !== 'IDLE'
      ? `最近请求：${this.intent.state}（${this.intent.source}）。动作接口尚未验证，没有开始执行。`
      : '目前没有正在执行的游戏动作。'
    const hp = this.health === null ? '生命值尚未有可信同步。' : `已观察生命值 ${this.health}${this.maxHealth == null ? '' : '/' + this.maxHealth}。`
    return '我已进入基岩世界。' + suffix + hp
  }

  locationSummary () {
    if (!this.position) return '还没有从服务器收到可信的角色坐标。'
    const p = this.position
    const age = this.clock() - this.positionAt
    const coords = `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`
    if (this.positionKind !== 'observed' || age > FRESH_POSITION_MS)
      return `${this.dimension || '维度未知'}，最后记录坐标 ${coords}（${this.positionKind === 'spawn' ? '生成时位置' : '已过期'}，不是实时位置）。`
    return `${this.dimension || '维度未知'}，最近收到的角色坐标 ${coords}。`
  }

  inventorySummary () {
    if (!this.inventory) return '还没有接入经核实的基岩物品 ID 转换和背包槽位同步，不能报告物品数量或假装背包为空。'
    return this.policies.inventory_policy.formatInventory(this.inventory)
  }

  respond (command, sender = '未知玩家') {
    const q = String(command || '').trim()
    if (!q || q.length > 400) return null
    if (/^(状态|你在干嘛[？?]?|现在的任务|你在执行谁的命令)$/u.test(q) || this.policies.social_policy.isStatusQuery(q)) return this.stateSummary()
    if (/^(帮助|help|能力|能做什么)$/iu.test(q))
      return '已复用 Paper Alice 的中文识别、木头数量、背包统计和状态规则；可问状态、位置、背包、收集木头。移动/挖掘/战斗需基岩执行器实机验收。'
    if (this.policies.inventory_policy.isLocationQuery(q)) return this.locationSummary()
    if (this.policies.inventory_policy.isInventoryQuery(q)) return this.inventorySummary()
    if (this.hasPendingCount(sender)) {
      const amount = this.policies.wood_policy.parseCountReply(q)
      if (amount !== null) {
        this.pendingCounts.delete(sender)
        this.intent = {state:'GATHER_REQUESTED', source:sender, at:this.clock(), amount}
        return `收到${sender}要采集${amount}个原木。数量已确认，但基岩挖掘执行器尚未验证，因此没有开始砍树。`
      }
    }
    if (this.policies.wood_policy.parseWoodCountRequest(q)) {
      this.pendingCounts.set(sender, {at:this.clock()})
      return `${sender}，需要多少个木头？请回复1到128之间的数字。`
    }
    if (/^(停止|别动|停下|取消|别跟了)$/u.test(q)) {
      this.intent = {state:'IDLE',source:sender,at:this.clock()}
      this.pendingCounts.delete(sender)
      return '已取消待执行的意图。当前没有基岩动作执行器需要中断。'
    }
    if (/^(跟着我|跟我走|跟随我)$/u.test(q)) {
      this.intent = {state:'FOLLOW_REQUESTED',source:sender,at:this.clock()}
      return `收到${sender}的跟随请求并记录了目标。但基岩寻路执行器尚未验证，我现在不会假装在跟随。`
    }
    if (/^(?:收集|采集|砍)(?:\s*\d{1,3}\s*(?:个|根|块)?)?(?:木头|原木|木材)$/u.test(q)) {
      return '已收到采集请求，但基岩方块破坏和物品拾取尚未验证，未开始采集。'
    }
    if (/制作|合成|工作台|剑|保护|攻击|箱子|给我|搬家|交付|挖矿|砍树|建造/u.test(q))
      return '已有 Paper Alice 的任务与安全策略，尚缺当前基岩版对应的可靠操作/结果核验接口，不能宣称已执行。'
    return null
  }
}

async function createNativeAliceBrain (clock) {
  return new NativeAliceBrain(await loadPaperPolicies(), clock)
}
module.exports = { createNativeAliceBrain, NativeAliceBrain, loadPaperPolicies }