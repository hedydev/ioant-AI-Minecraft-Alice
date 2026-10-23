# AliceAI — Minecraft Bedrock 自主玩家

> 正式开发仓库：**https://github.com/hedydev/ioant-AI-Minecraft-Alice**  
> 由 `hedydev/hero-skills` 的 `games/minecraft-ai/` 独立迁移。Hero Skills 今后只维护可复用方法与项目链接，不再存放 Alice 产品代码。

## 源码

为避免改坏既有 Mac ↔ Mint 运维与 Python/Node 测试路径，迁移第一阶段**保留**原项目相对路径：

- [完整 Alice 项目](games/minecraft-ai/)
- [Bedrock 原生运行代码](games/minecraft-ai/bedrock-native/experiment/)
- [Mac 3D 控制台](games/minecraft-ai/dashboard/)
- [标准运维手册](games/minecraft-ai/docs/OPERATIONS.md)
- [现状与已知问题](games/minecraft-ai/docs/CURRENT_STATE.md)
- [AI 工程约束](games/minecraft-ai/AGENTS.md)
- [非刷屏 BDS 坐标见证设计](games/minecraft-ai/docs/SILENT_BDS_WITNESS_20261023.md)

本仓库的代码、Dashboard、脚本、测试和文档从源 commit `71fc8e2d13386e338dc4e103efccc087034957c6` **逐文件复制并核对相对路径、Git blob SHA、执行位一致**。原 Git 历史仍可在 Hero Skills 的历史提交查看，当前新仓库包含分批导入提交；不应把重新初始化的 Git 提交历史称为保留全部 Git 父子历史。

## Mac 开发及同步（不会擅自重启）

```bash
cd ~/Documents/workspace
git clone https://github.com/hedydev/ioant-AI-Minecraft-Alice.git
cd ioant-AI-Minecraft-Alice
git status --short
node --test games/minecraft-ai/bedrock-native/experiment/test/world_camera.test.cjs
python3 -m unittest discover -s games/minecraft-ai/tests -v

export ALICE_SSH_TARGET=tedz@192.168.0.104
bash games/minecraft-ai/scripts/alice-mac.sh status
bash games/minecraft-ai/scripts/alice-mac.sh diagnose
# 测试无误后才由操作员决定是否同步/部署：
# bash games/minecraft-ai/scripts/alice-mac.sh sync
```

`sync` 仅安全备份同步并测试；`deploy` 才会按既有单实例流程重启 Alice。BDS/MCSManager、Xbox 缓存、Minecraft 世界存档、Mint 私有历史记忆和用户手动停用的 querytarget 轮询不得被隐式变更。

## 当前未解决问题

- 真实自主移动需要新鲜、独立的 BDS 位置证据。最近已知 `scout_bds_position_unavailable`，属于**安全阻塞**而非 Ollama 一直思考。
- 非刷屏 BDS Script API 行为包**尚未实机启用与验证兼容性**，不可宣称 Alice 已恢复采集。
- 3D Canvas 已移除人为淡出假蒙版、收敛画布宽高比，Mac 浏览器视觉验收仍待完成。
- 近期验收存在大量死亡与长时间安全阻塞，不能依据 GitHub 回归用例冒充真实生存效果。

**继续开发直接在本仓库 `main`；所有 GitHub 写入先检查最新 remote HEAD，原子提交并保留 `AI-Agent` / `AI-Session`。**
