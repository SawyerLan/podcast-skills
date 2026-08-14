#!/bin/bash
# 把 text-to-speech-doubao 产出的分段 mp3 推给一个 ob-podcast-backend 兼容的后端，
# 由后端用真正的 ffmpeg 合并成单文件并加入私有 RSS Feed。
#
# 用法：
#   export PODCAST_BACKEND_API_KEY=xxx   # 可选，取决于后端是否要求鉴权
#   ./push_to_backend.sh <audio目录> "<集标题>" "<集简介>" <后端baseurl>
#
# 示例：
#   ./push_to_backend.sh ./audio "APISIX 路由前缀重叠踩坑记" "一次真实的排障复盘" http://localhost:8787

set -euo pipefail

AUDIO_DIR="${1:?用法: push_to_backend.sh <audio目录> <标题> <简介> <后端baseurl>}"
TITLE="${2:?缺少标题}"
DESCRIPTION="${3:?缺少简介}"
BASE_URL="${4:?缺少后端 base url，比如 http://localhost:8787}"

MANIFEST="${AUDIO_DIR}/manifest.json"
[ -f "$MANIFEST" ] || { echo "找不到 $MANIFEST" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "需要本机装 jq" >&2; exit 1; }

ARGS=(-s -X POST "${BASE_URL%/}/merge" -F "title=${TITLE}" -F "description=${DESCRIPTION}")
if [ -n "${PODCAST_BACKEND_API_KEY:-}" ]; then
  ARGS+=(-H "X-Api-Key: ${PODCAST_BACKEND_API_KEY}")
fi

while read -r f; do
  ARGS+=(-F "segments=@${AUDIO_DIR}/${f}")
done < <(jq -r '.segments[].file' "$MANIFEST")

RESPONSE="$(curl "${ARGS[@]}")"
echo "$RESPONSE" | jq .

URL="$(echo "$RESPONSE" | jq -r '.url // empty')"
if [ -n "$URL" ]; then
  echo ""
  echo "单集音频: $URL"
  echo "订阅地址是后端 /feed/<FEED_TOKEN>.xml，具体 token 找部署这个后端的人要（后端环境变量 FEED_TOKEN）。"
else
  echo "后端没有返回 url 字段，检查上面的响应内容排查问题" >&2
  exit 1
fi
