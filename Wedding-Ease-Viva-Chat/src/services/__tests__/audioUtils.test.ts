// Pure-function tests for audioUtils.ts (WAV encoder, downsampler, Int16 conversion).
// Run from Wedding-Ease-Viva-Chat:
//   npx ts-node --transpile-only --esm src/services/__tests__/audioUtils.test.ts
// Uses node:test — zero new deps.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  bytesToBase64,
  downsampleFloat32,
  encodeWav16,
  floatToInt16,
} from '../audioUtils.ts'

// ── downsampleFloat32 ───────────────────────────────────────────────────────

test('downsample: same-rate no-op returns input buffer', () => {
  const input = new Float32Array([0.1, 0.2, 0.3, 0.4])
  const out = downsampleFloat32(input, 48000, 48000)
  assert.equal(out, input, 'same-rate should return the same buffer reference')
})

test('downsample: srcRate < dstRate is a no-op (upsampling unsupported)', () => {
  const input = new Float32Array([0.1, 0.2, 0.3])
  const out = downsampleFloat32(input, 16000, 48000)
  assert.equal(out, input)
})

test('downsample: 48k → 16k produces length ≈ input / 3', () => {
  const input = new Float32Array(48000) // 1 second at 48k
  for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 100)
  const out = downsampleFloat32(input, 48000, 16000)
  // Allow ±1 bin slack for the boundary flush.
  assert.ok(out.length >= 16000 - 1 && out.length <= 16000 + 1, `got ${out.length}`)
})

test('downsample: 44.1k → 16k produces a reasonable length', () => {
  const input = new Float32Array(44100)
  const out = downsampleFloat32(input, 44100, 16000)
  assert.ok(out.length >= 15990 && out.length <= 16010, `got ${out.length}`)
})

test('downsample: DC signal stays DC (averaging preserves mean)', () => {
  const input = new Float32Array(9000).fill(0.5)
  const out = downsampleFloat32(input, 48000, 16000)
  for (let i = 0; i < out.length; i++) {
    assert.ok(Math.abs(out[i] - 0.5) < 1e-6, `sample ${i} drifted to ${out[i]}`)
  }
})

test('downsample: invalid rates fall back to input unchanged', () => {
  const input = new Float32Array([1, 2, 3])
  assert.equal(downsampleFloat32(input, 0, 16000), input)
  assert.equal(downsampleFloat32(input, 48000, 0), input)
})

// ── floatToInt16 ────────────────────────────────────────────────────────────

test('floatToInt16: full-scale positive maps to 32767', () => {
  const out = floatToInt16(new Float32Array([1.0]))
  assert.equal(out[0], 0x7FFF)
})

test('floatToInt16: full-scale negative maps to -32768', () => {
  const out = floatToInt16(new Float32Array([-1.0]))
  assert.equal(out[0], -0x8000)
})

test('floatToInt16: silence stays 0', () => {
  const out = floatToInt16(new Float32Array([0]))
  assert.equal(out[0], 0)
})

test('floatToInt16: clamps samples outside [-1, 1]', () => {
  const out = floatToInt16(new Float32Array([1.5, -2.0, 0.5]))
  assert.equal(out[0], 0x7FFF)
  assert.equal(out[1], -0x8000)
  assert.equal(out[2], Math.round(0.5 * 0x7FFF))
})

test('floatToInt16: NaN maps to 0 (defensive)', () => {
  const out = floatToInt16(new Float32Array([NaN]))
  assert.equal(out[0], 0)
})

// ── encodeWav16 ─────────────────────────────────────────────────────────────

test('encodeWav16: starts with literal "RIFF" + ends with data chunk of correct size', () => {
  const pcm = new Int16Array(800)      // 0.05 s at 16k
  const wav = encodeWav16(pcm, 16000)
  const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3])
  assert.equal(header, 'RIFF', 'header must start with RIFF — backend fast-path depends on this')
  // file length field at bytes 4-7 is 36 + dataBytes
  const fileLen =
    wav[4] | (wav[5] << 8) | (wav[6] << 16) | (wav[7] << 24)
  assert.equal(fileLen, 36 + pcm.length * 2)
  // WAVE tag at bytes 8-11
  const waveTag = String.fromCharCode(wav[8], wav[9], wav[10], wav[11])
  assert.equal(waveTag, 'WAVE')
  // fmt  tag at bytes 12-15
  const fmtTag = String.fromCharCode(wav[12], wav[13], wav[14], wav[15])
  assert.equal(fmtTag, 'fmt ')
})

test('encodeWav16: fmt chunk declares PCM mono 16-bit at the requested rate', () => {
  const pcm = new Int16Array(1600)
  const wav = encodeWav16(pcm, 16000)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint16(20, true), 1, 'format = PCM')
  assert.equal(view.getUint16(22, true), 1, 'channels = 1 (mono)')
  assert.equal(view.getUint32(24, true), 16000, 'sample rate')
  assert.equal(view.getUint32(28, true), 16000 * 2, 'byte rate (mono × 16-bit)')
  assert.equal(view.getUint16(32, true), 2, 'block align')
  assert.equal(view.getUint16(34, true), 16, 'bits per sample')
})

test('encodeWav16: data chunk size = pcm.length × 2', () => {
  const pcm = new Int16Array(1234)
  const wav = encodeWav16(pcm, 16000)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const dataTag = String.fromCharCode(wav[36], wav[37], wav[38], wav[39])
  assert.equal(dataTag, 'data')
  assert.equal(view.getUint32(40, true), 1234 * 2)
  // Total WAV length = 44 header + payload
  assert.equal(wav.length, 44 + 1234 * 2)
})

test('encodeWav16: PCM samples are written little-endian after the header', () => {
  const pcm = new Int16Array([0x1234, -0x1234])
  const wav = encodeWav16(pcm, 16000)
  // First sample: LSB then MSB
  assert.equal(wav[44], 0x34)
  assert.equal(wav[45], 0x12)
  // Second sample: -0x1234 in two's complement is 0xEDCC → LSB 0xCC, MSB 0xED
  assert.equal(wav[46], 0xCC)
  assert.equal(wav[47], 0xED)
})

test('encodeWav16: empty PCM produces a valid 44-byte header', () => {
  const wav = encodeWav16(new Int16Array(0), 16000)
  assert.equal(wav.length, 44)
  assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF')
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint32(40, true), 0, 'data chunk size = 0')
})

// ── bytesToBase64 ───────────────────────────────────────────────────────────

test('bytesToBase64: small buffer round-trips', () => {
  const input = new Uint8Array([72, 105, 33])     // "Hi!"
  const b64 = bytesToBase64(input)
  assert.equal(b64, 'SGkh')
})

test('bytesToBase64: handles >64 KB buffer without call-stack overflow', () => {
  // 200 KB — legacy `btoa(String.fromCharCode(...bytes))` pattern throws on this.
  const size = 200_000
  const input = new Uint8Array(size)
  for (let i = 0; i < size; i++) input[i] = i & 0xFF
  const b64 = bytesToBase64(input)
  // Length of base64 output = ceil(size / 3) × 4
  const expectedLen = Math.ceil(size / 3) * 4
  assert.equal(b64.length, expectedLen)
})

// ── Integration: "record → WAV" round-trip shape ────────────────────────────

test('integration: encode(downsample(floatBuffer)) → RIFF WAV accepted by backend fast-path', () => {
  // Simulate 1 s of a 440 Hz sine at 48 kHz source rate.
  const srcRate = 48000
  const dstRate = 16000
  const source = new Float32Array(srcRate)
  for (let i = 0; i < source.length; i++) {
    source[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / srcRate)
  }
  const ds = downsampleFloat32(source, srcRate, dstRate)
  const pcm = floatToInt16(ds)
  const wav = encodeWav16(pcm, dstRate)
  // Byte-level invariants the Azure STT fast-path relies on
  assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF')
  // Rough length check: ~1 s at 16 kHz mono 16-bit = 32 KB + header
  assert.ok(wav.length > 32000 && wav.length < 33000, `unexpected wav size: ${wav.length}`)
})
