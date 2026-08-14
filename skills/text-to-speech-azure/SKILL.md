---
name: text-to-speech-azure
description: 需要免费/低门槛试跑一遍"笔记转播客"完整流程、但用户还没有火山引擎账号时使用。封装微软 Azure AI Speech 的 TTS REST API 调用方式，命令行用法和 script.json 输入格式跟 text-to-speech-doubao 完全一致，可以直接替换着用。**中文语气/情绪表现力明显弱于豆包版本，只适合免费试用阶段，不建议作为正式/长期使用的默认选项**——效果满意后应该引导用户换成 text-to-speech-doubao。
---

# Azure AI Speech：免费试用版 TTS

## 什么时候用

用户想先跑通一遍"笔记→脚本→语音"的完整流程看看效果，但还没有火山引擎账号、不想为了试一次专门去注册开通付费服务。Azure 每月有 50 万字符免费额度，注册一个 Azure 账号（很多人已经有，比如学生/企业订阅送的额度）就能免费试听。

**这是给"还没决定要不要用"的人准备的低门槛入口，不是长期方案。** 效果、成本都不如 `text-to-speech-doubao`，用户认可整个流程之后，应该建议对方切换过去，见下面「跟豆包版本的关键差异」。

## 前提

- 一个 Azure 账号，在 Azure Portal 创建一个「语音服务」（Speech）资源，拿到：
  - **密钥**（Keys and Endpoint 页面）
  - **区域**（比如 `eastasia`、`eastus`，创建资源时选的那个）
- 通过环境变量传入，不要硬编码：

  ```bash
  export AZURE_SPEECH_KEY=xxx
  export AZURE_SPEECH_REGION=eastasia
  ```

- Node.js 18+（脚本只用内置 `fetch`/`fs`，不依赖任何 npm 包）。
- **免费额度：每月 50 万字符**（Neural 语音），超出后按量付费，约 $16/百万字符（Neural HD 约 $22/百万字符）——换算下来大概是豆包价格（0.0003 元/字）的**两三百倍**，只适合免费额度内的试用量，不要在这个额度用完后继续拿 Azure 跑生产。

## 用法

跟 `text-to-speech-doubao` 完全对齐，输入同一份 `script.json`（`note-to-podcast-script` skill 的产出），互相替换着用即可：

```bash
node scripts/synthesize.mjs --script script.json --out-dir ./audio
```

单句试听：

```bash
node scripts/synthesize.mjs --text "你好，这是一段测试" \
  --speaker zh-CN-XiaoxiaoNeural \
  --out /tmp/test.mp3
```

输出格式（`audio/0001.mp3` + `manifest.json`）跟豆包版本一模一样，下游 `podcast-deliver` skill 不需要区分是哪家 TTS 产出的。

## 音色参考

Azure 中文 Neural 语音里质量和自然度相对较好的几个（完整列表见 Azure 文档「支持的语言和语音」）：

| 音色 id | 说明 |
|---|---|
| `zh-CN-XiaoxiaoNeural` | 女声，晓晓，通用场景常用 |
| `zh-CN-YunxiNeural` | 男声，云希，年轻活力 |
| `zh-CN-YunyangNeural` | 男声，云扬，新闻播报风 |
| `zh-CN-XiaoyiNeural` | 女声，晓伊 |

## 跟豆包版本的关键差异（务必告知用户）

1. **没有语气/情绪控制**：豆包版本用 `context_texts` 字段传一句自然语言语气指令（比如"用又惊讶又想反驳的语气说这句话"），能让情绪爆发点听起来更真实。Azure 的对应机制是 SSML 里的 `<mstts:express-as style="...">`，只支持预设的固定风格词（cheerful/sad/angry 等），且只有少数音色支持，跟 `script.json` 里 `tone` 字段的自然语言描述不是一回事，**这个脚本目前直接忽略了 `tone` 字段**，所有台词都用平铺语气朗读——这是当前"免费试用版"和"正式版"听感差距最大的地方，务必提前跟用户说清楚，不要让对方以为是同一个脚本换个厂商这么简单。
2. **价格差 200~300 倍**：见上面前提部分。
3. **中文自然度**：主观听感上，海外厂商的中文语调/韵律普遍不如国内厂商针对中文场景专门调优的效果，建议用户实际对比听一下同一段文本两边生成的音频，而不是只看这份文档的描述。

## 常见坑

- 密钥和区域必须匹配——用错区域会报 401/403，区域填的是创建 Speech 资源时选的那个 Azure 区域代码，不是"离你最近的机房"这种模糊描述。
- 免费额度是按 Azure 账号/订阅算的，不是按 Speech 资源算的，同一个订阅下开多个 Speech 资源不会获得多份免费额度。
