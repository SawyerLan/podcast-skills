---
name: text-to-speech-doubao
description: 需要把文本（一段话、或一份带角色/语气标注的播客脚本 script.json）转成语音文件时使用。封装火山引擎豆包语音合成2.0（Seed-TTS 2.0）的正确调用方式：认证、请求格式、流式响应解析、用 context_texts 控制语气（不是往文本里塞方括号）。只负责"文字→音频文件"这一步，不管音频合并、上传或推送——那些交给 podcast-deliver skill 或调用方自己处理。
---

# 豆包语音合成2.0：文字转语音

## 什么时候用

任何需要把中文文本变成语音文件的场景：单句试听、或者把一份多角色播客脚本批量合成成一段段音频。
这个 skill 只产出本地 mp3 文件，不负责后续怎么处理（合并成一集、发布 RSS、推送到某个 IM）——那是下游的事，可以接 `podcast-deliver` skill，也可以自己写。

## 前提

- 火山引擎账号已开通「语音合成2.0」（控制台产品名，模型内部代号 `seed-tts-2.0`），后付费，约 `0.0003 元/字`。
- 需要一个火山引擎 **API Key**（新版 v3 接口用 API Key，不是老版本的 appid/token/cluster）。获取路径：控制台 > 语音技术 > 系统管理 > API Key 管理（`console.volcengine.com/speech/new/setting/apikeys`）。
- 通过环境变量传入，**不要硬编码**：

  ```bash
  export DOUBAO_API_KEY=xxx
  ```

- Node.js 18+（脚本只用内置的 `fetch`/`fs`/`crypto`，不依赖任何 npm 包——目标使用场景是各种 agent CLI 工具的运行环境，这些工具本身大多是 npm 生态分发的，比起 Python，Node 更可能已经装好）。

## 用法

### 单句试听

```bash
node scripts/synthesize.mjs --text "你好，这是一段测试" \
  --speaker zh_female_xiaohe_uranus_bigtts \
  --out /tmp/test.mp3
```

### 批量合成一份播客脚本

输入 `script.json`（可以是 `note-to-podcast-script` skill 的产出，也可以手写）：

```json
{
  "mode": "dialogue",
  "speakers": {
    "A": {"name": "小林", "voice": "zh_male_dayi_uranus_bigtts"},
    "B": {"name": "阿May", "voice": "zh_female_xiaohe_uranus_bigtts"}
  },
  "segments": [
    {"speaker": "A", "text": "哎，这个问题听起来就很有意思啊！", "tone": "用好奇又略带兴奋的语气说这句话"},
    {"speaker": "B", "text": "……", "tone": null}
  ]
}
```

- `mode` 是 `dialogue`（双人对谈）或 `monologue`（单人朗读），只影响下游怎么理解，这一步不区分处理。
- 单人朗读模式 `speakers` 里只有一个 key，所有 segment 的 `speaker` 都指向它。
- `tone` 是可选的自然语言语气指令，会作为 `context_texts` 传给 API（见下面"控制语气"一节），不写就是默认语气朗读。

```bash
node scripts/synthesize.mjs --script script.json --out-dir ./audio
```

输出：

```
audio/
  0001.mp3
  0002.mp3
  ...
  manifest.json   # 记录每个文件对应的 speaker/text，供下游合并/RSS 使用
```

`manifest.json` 结构：

```json
{
  "mode": "dialogue",
  "segments": [
    {"index": 1, "file": "0001.mp3", "speaker": "A", "speaker_name": "小林", "text": "……", "bytes": 12345}
  ]
}
```

## 音色参考

完整音色列表在控制台"音色库"里看，目前验证过效果不错的组合：

| 音色 id | 说明 |
|---|---|
| `zh_male_dayi_uranus_bigtts` | 男声，大吉2.0 |
| `zh_female_xiaohe_uranus_bigtts` | 女声，小何2.0 |

## 控制语气/情绪表现力

**不要往 `text` 里塞【】方括号描述**——那是火山引擎控制台网页版"音频生成"功能自己做的前端预处理，直接调 API 的 `text` 字段塞方括号会被逐字念出来（实测验证过）。

正确方式是用 `req_params.context_texts` 字段（数组），传一句自然语言描述的语气指令，`text` 保持干净：

```json
{
  "req_params": {
    "text": "哎，这个问题听起来就很有意思啊！",
    "speaker": "zh_female_xiaohe_uranus_bigtts",
    "context_texts": ["用好奇又略带兴奋的语气说这句话"],
    "audio_params": {"format": "mp3", "sample_rate": 24000}
  }
}
```

注意：
- `context_texts` 只在音色是「豆包语音合成模型2.0音色」时生效，复刻音色（`seed-icl-2.0`）不支持。
- 该字段文本不参与计费。
- 每次调用只能带一条整体语气指令，做不到"前半句轻快、后半句转严肃"这种句内变调——想要变调效果，要在脚本生成阶段就把这句话拆成两个更短的独立 segment，分别配不同的 `tone`。但**不要把情绪爆发点这种本该连贯的句子强行拆开**——实测拆分会导致两段音频拼接处出现明显的语气断层，比不拆更难听。只在语义上本来就能自然断句的地方拆。

## 成本估算

字符数 × 0.0003 元。一集几千字的双人对谈，合成成本通常在几毛到一块钱人民币，测试时不用省着跑。

## 常见坑

- **不要用老版本 TTS 接口**（`api/v1/tts` 或 `tts_middle_layer/tts`）——那是"语音合成1.0"的鉴权体系（appid/cluster/token），跟"语音合成2.0"的 API Key 不是一回事，混用会报 `Missing required: app.appid` 之类的错。
- 响应是 chunked 流式的多个 JSON 对象首尾相连、没有分隔符，**不能当单个 JSON 解析**，脚本里已经用逐字符扫描（跟踪字符串/转义状态和括号深度）的方式切分处理了，自己重写时注意这点。
- 控制台默认展示的"预付费大额套餐"是企业采购套餐，日常测试切到"后付费"看"语音合成2.0"零售单价，别被大额套餐吓到。
