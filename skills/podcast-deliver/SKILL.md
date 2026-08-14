---
name: podcast-deliver
description: 需要把 text-to-speech-doubao skill 产出的分段音频（audio/manifest.json + 若干 mp3）整理成最终可听的成品时使用——本地合并成一个文件、发布成私有 RSS 订阅、或推送到某个 IM。这是流水线最后一步，三种交付方式都是可选的，按用户实际有的环境挑一种或组合用，缺哪个环境就跳过哪个，不强制要求。
---

# 播客交付：合并 / 发布 / 推送

## 什么时候用

上一步 `text-to-speech-doubao` skill 已经把脚本合成成了 `audio/` 目录（一堆按顺序编号的 mp3 + `manifest.json`），现在需要把它变成用户能实际听的东西。下面三种方式互不依赖，按用户环境选：

| 方式 | 前提 | 产出 |
|---|---|---|
| 本地合并 | 本机有 `ffmpeg` + `jq` | 一个单文件 mp3 |
| RSS 发布 | 用户自己部署了 `ob-podcast-backend`（或等价服务） | 播客 App 能订阅的私有 RSS Feed |
| 飞书推送 | 用户本地配了 Hermes agent + 飞书 gateway（**这是原作者的个人环境，多数人没有，没有就跳过这一项，不要假装能用**） | 消息直接发到飞书 |

如果用户什么下游环境都没有，交付到"本地合并出一个 mp3 文件"为止就已经是完整可用的结果——不要因为凑不齐 RSS/IM 环境就卡住不交付。

## 方式一：本地合并成单文件

用 `ffmpeg` 的 concat demuxer 做真正的音频混流（不是字节拼接，拼接处不会有杂音/断层）：

```bash
./scripts/merge_local.sh ./audio ./episode.mp3
```

依赖 `ffmpeg` 和 `jq`，没有就提示用户装一下（`apt install ffmpeg jq` / `brew install ffmpeg jq`），不要退化成字节拼接——那种方式音频层面不连续，只是能播放，听感会有问题，只在实在没有 ffmpeg 的临时场景下才作为最后手段。

## 方式二：发布私有 RSS Feed（需要自建后端）

如果用户有自己部署的、跟 [ob-podcast-backend](https://github.com) 接口兼容的服务（`POST /merge` 接收分段音频、返回单文件 URL 并自动加入 `/feed/:token.xml`），可以直接把分段 mp3 推过去，让后端用真正的 ffmpeg 处理并维护一份可持续订阅的 RSS：

```bash
./scripts/push_to_backend.sh ./audio "<集标题>" "<集简介>" "<后端 base url>"
```

- 需要环境变量 `PODCAST_BACKEND_API_KEY`（对应后端的 `X-Api-Key`），没有就不带这个 header（取决于后端是否要求鉴权）。
- 成功后脚本会打印这一集的 mp3 URL，以及订阅用的 Feed URL（后端环境变量 `FEED_TOKEN` 决定的那个 token 拼出来的地址）——把 Feed URL 发给用户，粘贴进 Apple Podcasts / Overcast / Pocket Casts 等 App 的"添加订阅/URL 订阅"即可。
- 这条路径**必须用户自己已经部署了兼容后端**，这个 skill 不负责帮忙部署后端服务；如果用户没有，直接跳过这一项，用方式一交付本地文件就够了。

## 方式三：推送到飞书（仅限本机已配置 Hermes 环境）

**先确认再用**：`which hermes` 或 `ssh mac '~/.local/bin/hermes --version'` 探测一下，探测不到就直接跳过、不要往下走这条分支、也不要向用户解释"你需要装 Hermes"——这是原作者本人的个人自动化环境，不是这套 skill 的通用能力，对大多数使用者没有意义。

如果确实探测到了：

```bash
scp <本地 mp3 路径> mac:/tmp/episode.mp3
ssh mac '~/.local/bin/hermes send --to feishu:<目标ID> "生成的播客，MEDIA:/tmp/episode.mp3"'
```

- `<目标ID>` 用 `hermes send --list` 现查，不要硬编码任何人的飞书 ID。
- `MEDIA:<路径>` 必须是 Mac 本机路径，不是 WSL/Linux 路径，所以要先 `scp` 过去。

## 交付方式的选择建议

按下面顺序问用户（或按已探测到的环境自动选择，不用每次都打断用户确认）：

1. 有没有已部署的 RSS 后端？有 → 优先推 RSS Feed，能在任意播客 App 里长期订阅、支持后台播放和离线缓存，体验最完整。
2. 没有后端，但本机有 ffmpeg？→ 合并成单文件 mp3，交给用户自己传到手机/网盘听。
3. 都没有 → 直接把 `audio/` 目录（分段 mp3）连同 `manifest.json` 交给用户，按 `manifest.json` 里的顺序播放也是能听的，只是没有合并成一个文件。

不要在用户没有对应环境时假装能完成某个交付方式，宁可交付一个更基础但真实可用的结果。
