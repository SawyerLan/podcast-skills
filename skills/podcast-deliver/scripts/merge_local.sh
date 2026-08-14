#!/bin/bash
# 用 ffmpeg concat demuxer 把 text-to-speech-doubao 产出的分段 mp3 真正混流成一个文件
# （不是字节拼接，是标准的音频合并，前提是本机装了 ffmpeg）。
#
# 用法：
#   ./merge_local.sh <audio目录（含 manifest.json 和分段 mp3）> <输出文件路径>
#
# 示例：
#   ./merge_local.sh ./audio ./episode.mp3

set -euo pipefail

AUDIO_DIR="${1:?用法: merge_local.sh <audio目录> <输出mp3路径>}"
OUTPUT="${2:?用法: merge_local.sh <audio目录> <输出mp3路径>}"

command -v ffmpeg >/dev/null 2>&1 || { echo "需要本机装 ffmpeg" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "需要本机装 jq" >&2; exit 1; }

MANIFEST="${AUDIO_DIR}/manifest.json"
[ -f "$MANIFEST" ] || { echo "找不到 $MANIFEST" >&2; exit 1; }

LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT

jq -r '.segments[].file' "$MANIFEST" | while read -r f; do
  echo "file '$(realpath "${AUDIO_DIR}/${f}")'" >> "$LIST"
done

ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$OUTPUT" -loglevel error
echo "合并完成: $OUTPUT"
