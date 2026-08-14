# podcast-skills

一套跟具体 Obsidian 插件、具体 agent 框架都解耦的 skills，把"源文档 → 播客脚本 → 语音合成 → 交付"这条流水线拆成三个可以独立复用、通过文件系统接口串联的环节。任何能读写文件、跑 shell 命令的 agent（Claude Code、龙虾、Hermes agent、opencode……）都能按顺序调用。

这套 skill 是从 [ob-podcast](https://github.com/)（一个把 Obsidian 笔记转播客的插件）里"笔记→播客脚本"这一环的 prompt 设计中提炼出来的通用版本，脚本质量是这条流水线的核心价值，不是随便找个 LLM 摘要一下就行——具体规则见各 skill 内的说明。

## 三段流水线

```
source.md ──[note-to-podcast-script]──▶ script.json ──[text-to-speech-doubao 或 text-to-speech-azure]──▶ audio/*.mp3 + manifest.json ──[podcast-deliver]──▶ episode.mp3 / RSS Feed / 飞书消息
```

| Skill | 做什么 | 依赖 |
|---|---|---|
| `note-to-podcast-script` | 把源文档改写成播客对话脚本（策划大纲→写台词→自我质检三阶段），产出 `script.json` | 无外部依赖——执行 skill 的 agent 自己就是 LLM，直接照指令推理产出，不调用任何 LLM API |
| `text-to-speech-doubao` | 把 `script.json` 批量合成成分段音频，**推荐/默认路径** | 火山引擎语音合成2.0 API Key（`DOUBAO_API_KEY`），纯 BYOK |
| `text-to-speech-azure` | 同上，命令行用法和输入输出格式跟豆包版本完全对齐，**免费试用路径**：没有语气/情绪控制、中文自然度弱于豆包、长期成本约为豆包的 200~300 倍，只用来先免费体验一遍完整流程 | 微软 Azure Speech 密钥+区域（`AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`），每月 50 万字符免费额度 |
| `podcast-deliver` | 把分段音频合并/发布/推送成最终交付物 | 按需：`ffmpeg`+`jq`（本地合并）、自建 `ob-podcast-backend` 兼容后端（RSS）、Hermes（飞书，个人环境专用，多数人跳过） |

## 为什么用文件系统做接口

三个环节之间不传内存对象，只传文件（`script.json` → `audio/manifest.json` → 最终产物）。这样任何 agent 只要能读写文件、跑 shell 命令，不需要理解任何特定框架的"skill 调用协议"就能串起整条流水线，也方便中途手动检查/修改某一步的产出（比如脚本生成完先给用户看一遍，改到满意了再花钱合成音频）。

## 使用方式

把 `skills/` 下的子目录整个复制（或 `git submodule`）进你所用 agent 框架的 skills 目录即可，比如 Claude Code 是 `~/.claude/skills/<name>/`。每个 skill 目录都是自包含的：一份 `SKILL.md` 说明 + `scripts/` 下的可运行脚本，没有跨 skill 目录的隐藏依赖。

## 凭证

全部 BYOK（Bring Your Own Key），不依赖任何托管账号：

- 语音合成：自己的火山引擎账号，`export DOUBAO_API_KEY=xxx`；或者先用 Azure 免费额度试用，`export AZURE_SPEECH_KEY=xxx AZURE_SPEECH_REGION=xxx`
- 脚本生成：不需要单独的 LLM API Key——用执行 skill 的 agent 自带的模型能力
- RSS 发布（可选）：自己部署 `ob-podcast-backend` 或等价服务，自己的 `PODCAST_BACKEND_API_KEY` / `FEED_TOKEN`
