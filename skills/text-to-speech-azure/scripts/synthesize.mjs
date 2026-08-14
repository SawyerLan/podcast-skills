#!/usr/bin/env node
/**
 * 调用微软 Azure AI Speech 的 TTS REST API，把 script.json 里的每一段台词合成一个 mp3。
 * 只用 Node.js 内置能力（fetch/fs），不依赖任何 npm 包，Node 18+ 即可跑。
 * 命令行参数、script.json 输入格式、audio/manifest.json 输出格式跟 text-to-speech-doubao
 * 的 synthesize.mjs 保持一致，可以互相替换着用。
 *
 * 用法：
 *   export AZURE_SPEECH_KEY=xxx
 *   export AZURE_SPEECH_REGION=eastasia   # 你 Azure 资源所在的区域
 *   node synthesize.mjs --script script.json --out-dir ./audio
 *
 *   node synthesize.mjs --text "你好，这是一段测试" --speaker zh-CN-XiaoxiaoNeural --out /tmp/test.mp3
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

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

function escapeSSML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSSML(text, voice) {
  // 注意：这里没有做 tone/情绪映射，见 SKILL.md「跟豆包版本的关键差异」一节。
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">${escapeSSML(text)}</voice>
</speak>`;
}

async function ttsCall(key, region, text, voice, retries = 3) {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = buildSSML(text, voice);

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        },
        body: ssml,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Azure TTS 返回 ${resp.status}: ${body.slice(0, 300)}`);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0) throw new Error("Azure TTS 返回了空音频");
      return buf;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`Azure TTS 调用失败（已重试 ${retries} 次）: ${lastErr}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    console.error("请先 export AZURE_SPEECH_KEY=你的密钥 AZURE_SPEECH_REGION=资源区域（比如 eastasia）");
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
      console.log(`[${index}/${segments.length}] ${speakerKey} (${voice}): ${text.slice(0, 24)}...`);
      const audio = await ttsCall(key, region, text, voice);
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
    const voice = args.speaker || DEFAULT_VOICE;
    const out = args.out || "/tmp/tts_output.mp3";
    const audio = await ttsCall(key, region, args.text, voice);
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
