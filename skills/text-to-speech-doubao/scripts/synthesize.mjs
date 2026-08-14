#!/usr/bin/env node
/**
 * 调用火山引擎豆包语音合成2.0（Seed-TTS 2.0），把 script.json 里的每一段台词合成一个 mp3。
 * 只用 Node.js 内置能力（fetch/fs/crypto），不依赖任何 npm 包，Node 18+ 即可跑。
 *
 * 用法：
 *   export DOUBAO_API_KEY=xxx
 *   node synthesize.mjs --script script.json --out-dir ./audio
 *
 *   # 单句临时试听，不需要 script.json：
 *   node synthesize.mjs --text "你好，这是一段测试" --speaker zh_female_xiaohe_uranus_bigtts --out /tmp/test.mp3
 *
 * script.json 格式见 SKILL.md，简述：
 * {
 *   "mode": "dialogue",
 *   "speakers": { "A": {"name": "小林", "voice": "zh_male_dayi_uranus_bigtts"}, ... },
 *   "segments": [ {"speaker": "A", "text": "……", "tone": "……"}, ... ]
 * }
 *
 * 输出：out-dir 下 0001.mp3, 0002.mp3, ... 按顺序编号，加一份 manifest.json 供下游合并/RSS 使用。
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const DEFAULT_VOICE = "zh_female_xiaohe_uranus_bigtts";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

/** 响应是多个 JSON 对象首尾相连、没有分隔符，逐个扫描切分出来，等价于 Python 的 json.JSONDecoder.raw_decode 循环。*/
function splitConcatenatedJSON(text) {
  const results = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < n; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    results.push(JSON.parse(text.slice(start, i)));
  }
  return results;
}

async function ttsCall(apiKey, text, voice, tone, retries = 3) {
  const reqParams = {
    text,
    speaker: voice,
    audio_params: { format: "mp3", sample_rate: 24000 },
  };
  if (tone) reqParams.context_texts = [tone];

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "X-Api-Resource-Id": "seed-tts-2.0",
          "X-Api-Request-Id": randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ req_params: reqParams }),
      });
      const raw = await resp.text();
      const objects = splitConcatenatedJSON(raw);
      const chunks = [];
      for (const obj of objects) {
        if (obj.code !== 0 && obj.code !== 20000000) {
          throw new Error(`豆包 TTS 返回错误: ${JSON.stringify(obj)}`);
        }
        if (obj.data) chunks.push(Buffer.from(obj.data, "base64"));
      }
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) throw new Error("豆包 TTS 返回了空音频");
      return audio;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`豆包 TTS 调用失败（已重试 ${retries} 次）: ${lastErr}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    console.error("请先 export DOUBAO_API_KEY=你的火山引擎语音合成2.0 API Key");
    process.exit(1);
  }

  if (args.script) {
    const script = JSON.parse(await readFile(args.script, "utf-8"));
    const speakers = script.speakers || {};
    const segments = script.segments;
    const outDir = args["out-dir"] || "./audio";
    await mkdir(outDir, { recursive: true });

    const manifest = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const index = i + 1;
      const speakerKey = seg.speaker;
      const voice = (speakers[speakerKey] && speakers[speakerKey].voice) || DEFAULT_VOICE;
      const text = seg.text;
      const tone = seg.tone;
      console.log(`[${index}/${segments.length}] ${speakerKey} (${voice}): ${text.slice(0, 24)}...`);
      const audio = await ttsCall(apiKey, text, voice, tone);
      const filename = `${String(index).padStart(4, "0")}.mp3`;
      await writeFile(path.join(outDir, filename), audio);
      manifest.push({
        index,
        file: filename,
        speaker: speakerKey,
        speaker_name: (speakers[speakerKey] && speakers[speakerKey].name) || speakerKey,
        text,
        bytes: audio.length,
      });
    }

    const manifestPath = path.join(outDir, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ mode: script.mode || "dialogue", segments: manifest }, null, 2),
      "utf-8"
    );
    console.log(`完成：${segments.length} 段音频写入 ${outDir}，manifest 见 ${manifestPath}`);
  } else if (args.text) {
    const speaker = args.speaker || DEFAULT_VOICE;
    const out = args.out || "/tmp/tts_output.mp3";
    const audio = await ttsCall(apiKey, args.text, speaker, args.tone);
    await writeFile(out, audio);
    console.log(`生成完成: ${out}（${audio.length} 字节）`);
  } else {
    console.error("必须指定 --script（批量模式）或 --text（单句模式）");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
