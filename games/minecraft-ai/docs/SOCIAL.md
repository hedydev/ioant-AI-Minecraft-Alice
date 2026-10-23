# Alice social module — status, jokes and optional chat model

## Commands supported immediately

Alice accepts chat from **any player**, subject only to existing Mindcraft configuration (we add no owner whitelist).

- `你在干嘛？` — current action, target and verified instruction source.
- `你正在做什么？` / `当前任务` / `谁在指挥你` / `你在执行谁的命令`.
- `讲个笑话`, `聊聊天`, common Minecraft questions — optional dedicated chat-model path.

Status query runs without a language-model request and without ActionManager interruption. If two chat messages overlap, the task source is attributed only from a recent matching instruction/action event. Unknown source is explicitly labeled unknown. `AliceSocial` does not change Mindcraft's existing public chat / whisper handling or command authorization.

## Optional Ollama chat model

No new chat model is required. If not configured, ordinary smalltalk is processed by the same Mindcraft planning model (for example the current gpt-oss:20b). You can assign a faster model to **chat only** without changing Mindcraft's planner.

Create this file on **Mint** (not in Git or the deployed mirror):
`~/mindcraft-alice/bots/AliceAI/alice_social.json`

```json
{
  "chat_model": "qwen3:4b",
  "chat_url": "http://127.0.0.1:11434/api/chat",
  "timeout_ms": 5000,
  "spontaneous": true
}
```

The model name is an **example**, not a claim that it is installed. Check `ollama list` on the actual Ollama host and only select a model that is already available (or install one deliberately). The URL must be reachable **from the Mint process**; if Ollama is on Mac, maintain a suitable SSH tunnel or other secured local connectivity. No network-facing Ollama port should be exposed just for this feature. Environment overrides: `ALICE_CHAT_MODEL`, `ALICE_CHAT_URL`, `ALICE_CHAT_TIMEOUT_MS`.

The call uses standard Ollama HTTP `POST /api/chat`, non-streaming with a short response, a 5-second default timeout and limited concurrency. It cannot invoke Minecraft actions; its output is sanitized and routed via the ordinary Mindcraft response/chat channel. A failed or unavailable model does not pause FOLLOW, GATHER or combat; no second slow LLM request is launched as fallback.

## Natural presence without spam

Occasional short Minecraft observations and jokes may be broadcast **only** when:

- `IDLE`, no active ActionManager action, no FOLLOW intent;
- no nearby threat or survival intervention;
- at least one player is within about 16 blocks;
- 8 minutes have elapsed since the last message or Alice chatter;
- an additional random throttle passes.

These are friendly, scripted lines; chat-model conversations use a compact natural-language persona. Alice should be a recognizable AI teammate, not claim she is a human or invent in-game observations. The module does not move Alice or modify inventory while chatting.

## Implementation boundaries

The installer deploys `social_policy.js`, `activity.js`, and `social.js` as owned Alice files and updates `autonomy.js`. It does not rewrite Mint-local `agent.js`; instead, AliceAutonomy's startup decorates the instance method `handleMessage` and restores it on stop, while preserving existing command routes. This pattern is compatible with the currently known Mindcraft event-handler shape but should be validated on the real Mint checkout. Every unknown/command-like message falls through to the original agent handler.
