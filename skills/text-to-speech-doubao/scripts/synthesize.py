#!/usr/bin/env python3
"""
调用火山引擎豆包语音合成2.0（Seed-TTS 2.0），把 script.json 里的每一段台词合成一个 mp3。

用法：
  export DOUBAO_API_KEY=xxx
  python3 synthesize.py --script script.json --out-dir ./audio

  # 单句临时试听，不需要 script.json：
  python3 synthesize.py --text "你好，这是一段测试" --speaker zh_female_xiaohe_uranus_bigtts --out /tmp/test.mp3

script.json 格式（由 note-to-podcast-script skill 产出，也可以手写）：
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

输出：out-dir 下 0001.mp3, 0002.mp3, ... 按 segments 顺序编号，
以及一份 manifest.json 记录每个文件对应的 speaker/text/时长未知（下游合并/RSS 步骤用得上）。
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
import uuid
from typing import Optional

API_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
DEFAULT_VOICE = "zh_female_xiaohe_uranus_bigtts"


def tts_call(api_key: str, text: str, voice: str, tone: Optional[str], retries: int = 3) -> bytes:
    req_params = {
        "text": text,
        "speaker": voice,
        "audio_params": {"format": "mp3", "sample_rate": 24000},
    }
    if tone:
        req_params["context_texts"] = [tone]
    body = json.dumps({"req_params": req_params}).encode("utf-8")

    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            API_URL,
            data=body,
            method="POST",
            headers={
                "X-Api-Key": api_key,
                "X-Api-Resource-Id": "seed-tts-2.0",
                "X-Api-Request-Id": str(uuid.uuid4()),
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8")
            decoder = json.JSONDecoder()
            audio = bytearray()
            idx = 0
            while idx < len(raw):
                while idx < len(raw) and raw[idx] in " \n\r\t":
                    idx += 1
                if idx >= len(raw):
                    break
                obj, idx = decoder.raw_decode(raw, idx)
                if obj.get("code") not in (0, 20000000):
                    raise RuntimeError(f"豆包 TTS 返回错误: {obj}")
                if obj.get("data"):
                    audio += base64.b64decode(obj["data"])
            if not audio:
                raise RuntimeError("豆包 TTS 返回了空音频")
            return bytes(audio)
        except (urllib.error.URLError, RuntimeError) as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"豆包 TTS 调用失败（已重试 {retries} 次）: {last_err}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", help="script.json 路径（批量模式）")
    ap.add_argument("--out-dir", help="批量模式输出目录")
    ap.add_argument("--text", help="单句模式：直接给文本")
    ap.add_argument("--speaker", default=DEFAULT_VOICE, help="单句模式：音色 id")
    ap.add_argument("--tone", default=None, help="单句模式：语气指令（可选）")
    ap.add_argument("--out", default="/tmp/tts_output.mp3", help="单句模式：输出路径")
    args = ap.parse_args()

    api_key = os.environ.get("DOUBAO_API_KEY")
    if not api_key:
        print("请先 export DOUBAO_API_KEY=你的火山引擎语音合成2.0 API Key", file=sys.stderr)
        sys.exit(1)

    if args.script:
        with open(args.script, encoding="utf-8") as f:
            script = json.load(f)
        speakers = script.get("speakers", {})
        segments = script["segments"]
        out_dir = args.out_dir or "./audio"
        os.makedirs(out_dir, exist_ok=True)

        manifest = []
        for i, seg in enumerate(segments, start=1):
            speaker_key = seg["speaker"]
            voice = speakers.get(speaker_key, {}).get("voice", DEFAULT_VOICE)
            text = seg["text"]
            tone = seg.get("tone")
            print(f"[{i}/{len(segments)}] {speaker_key} ({voice}): {text[:24]}...")
            audio = tts_call(api_key, text, voice, tone)
            filename = f"{i:04d}.mp3"
            path = os.path.join(out_dir, filename)
            with open(path, "wb") as f:
                f.write(audio)
            manifest.append({
                "index": i,
                "file": filename,
                "speaker": speaker_key,
                "speaker_name": speakers.get(speaker_key, {}).get("name", speaker_key),
                "text": text,
                "bytes": len(audio),
            })

        manifest_path = os.path.join(out_dir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump({"mode": script.get("mode", "dialogue"), "segments": manifest}, f, ensure_ascii=False, indent=2)
        print(f"完成：{len(segments)} 段音频写入 {out_dir}，manifest 见 {manifest_path}")

    elif args.text:
        audio = tts_call(api_key, args.text, args.speaker, args.tone)
        with open(args.out, "wb") as f:
            f.write(audio)
        print(f"生成完成: {args.out}（{len(audio)} 字节）")

    else:
        print("必须指定 --script（批量模式）或 --text（单句模式）", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
