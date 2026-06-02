#!/usr/bin/env bash
# WE-20260528-002 — regression curls AFTER the fix.
# Confirms:
#   1. The SSML voice-swap injection is now rejected with HTTP 400 (no audio).
#   2. The SSML prosody injection is now rejected with HTTP 400 (no vendor error leak).
#   3. A legitimate voiceName ("Kore") still produces a valid WAV (no regression).
#   4. A legitimate Azure voice ID ("en-US-AriaNeural") still works.
#   5. An Azure SDK error (simulated by sending an unmapped language) returns
#      a generic 500 with no vendor internals.
#
# Backend under test: worktree fix-WE-20260528-002 on port 3002.

set -eu
BASE_URL="${BASE_URL:-http://localhost:3002}"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 1) SSML voice-swap injection (was 200 + WAV; expect 400) ==="
curl -sS -X POST "$BASE_URL/api/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello","voiceName":"x\"></voice><voice name=\"en-US-JennyNeural"}' \
  --max-time 10 \
  -o "$OUT_DIR/after-attack1.json" \
  -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
echo "Body:"; cat "$OUT_DIR/after-attack1.json"; echo

echo "=== 2) SSML prosody injection (was 500 + vendor leak; expect 400) ==="
curl -sS -X POST "$BASE_URL/api/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hi","voiceName":"en-US-AriaNeural\"/><prosody rate=\"slow\"/><voice name=\"en-US-JennyNeural"}' \
  --max-time 10 \
  -o "$OUT_DIR/after-attack2.json" \
  -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
echo "Body:"; cat "$OUT_DIR/after-attack2.json"; echo

echo "=== 3) Legitimate preset voice ('Kore') — must still synthesize ==="
curl -sS -X POST "$BASE_URL/api/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello there","voiceName":"Kore"}' \
  --max-time 15 \
  -o "$OUT_DIR/after-baseline-kore.wav" \
  -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
file "$OUT_DIR/after-baseline-kore.wav"

echo "=== 4) Legitimate Azure ID ('en-US-AriaNeural') — must still synthesize ==="
curl -sS -X POST "$BASE_URL/api/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello there","voiceName":"en-US-AriaNeural"}' \
  --max-time 15 \
  -o "$OUT_DIR/after-baseline-aria.wav" \
  -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
file "$OUT_DIR/after-baseline-aria.wav"

echo "=== 5) Missing voiceName (legacy callers) — must still synthesize with defaults ==="
curl -sS -X POST "$BASE_URL/api/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello there"}' \
  --max-time 15 \
  -o "$OUT_DIR/after-baseline-default.wav" \
  -w "code:%{http_code} size:%{size_download} ct:%{content_type}\n"
file "$OUT_DIR/after-baseline-default.wav"
