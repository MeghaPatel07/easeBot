// Pure audio utilities used by the PCM recorder. Split out from the
// recorder class so they can be unit-tested without a browser AudioContext.

/**
 * Naive low-pass + decimation from srcRate → dstRate.
 *
 * For voice (not music), a linear-phase anti-alias + pick-every-N approach
 * is fine. Azure STT is tolerant to minor aliasing; we're trading off a
 * small accuracy delta for zero new dependencies and deterministic output.
 *
 * When srcRate === dstRate, returns the input buffer unchanged (no-op).
 * When srcRate < dstRate (shouldn't happen in browsers), returns input unchanged.
 */
export function downsampleFloat32(
  samples: Float32Array,
  srcRate: number,
  dstRate: number,
): Float32Array {
  if (dstRate <= 0 || srcRate <= 0) return samples
  if (srcRate === dstRate) return samples
  if (srcRate < dstRate) return samples
  const ratio = srcRate / dstRate
  const outLength = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLength)
  // Simple box-average over each output bin — the box acts as a crude LPF.
  // Faster and cheaper than an FIR, and for speech at 16 kHz target this
  // is inaudible vs. a proper filter.
  let outIdx = 0
  let acc = 0
  let count = 0
  let nextBoundary = ratio
  for (let i = 0; i < samples.length && outIdx < outLength; i++) {
    acc += samples[i]
    count += 1
    if (i + 1 >= nextBoundary) {
      out[outIdx++] = acc / count
      acc = 0
      count = 0
      nextBoundary += ratio
    }
  }
  // Flush any tail if we ran out before the last bin.
  if (outIdx < outLength && count > 0) {
    out[outIdx] = acc / count
  }
  return out
}

/**
 * Convert Float32 PCM in [-1, 1] to Int16 PCM (little-endian integer).
 * Clamps out-of-range samples (should be rare but protects against NaN).
 */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]
    if (Number.isNaN(s)) s = 0
    if (s > 1) s = 1
    else if (s < -1) s = -1
    // Asymmetric scaling: negative full-scale = -32768, positive = 32767.
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF)
  }
  return out
}

/**
 * Wrap Int16 PCM in a RIFF/WAVE container. The backend STT route checks
 * for the literal "RIFF" magic bytes and skips ffmpeg when present —
 * producing a valid WAV here saves ~400-900 ms per request.
 *
 * Layout (standard PCM WAV, 16-bit mono):
 *   RIFF  [size]  WAVE
 *   fmt  [16]  1 (PCM)  1 (mono)  [rate]  [byte rate]  2 (block)  16 (bits)
 *   data [size]  <PCM bytes>
 */
export function encodeWav16(pcm16: Int16Array, sampleRate: number): Uint8Array {
  const byteLength = pcm16.length * 2
  const buffer = new ArrayBuffer(44 + byteLength)
  const view = new DataView(buffer)

  // RIFF header
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + byteLength, true)
  writeAscii(view, 8, 'WAVE')

  // fmt  chunk
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)          // chunk size
  view.setUint16(20, 1, true)           // format = PCM
  view.setUint16(22, 1, true)           // channels = 1 (mono)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate (mono × 16-bit = rate × 2)
  view.setUint16(32, 2, true)           // block align (mono × 2 bytes)
  view.setUint16(34, 16, true)          // bits per sample

  // data chunk
  writeAscii(view, 36, 'data')
  view.setUint32(40, byteLength, true)

  // Little-endian copy of Int16 samples
  const bytes = new Uint8Array(buffer, 44)
  // Int16Array shares memory with its ArrayBuffer, but we must respect
  // byteOffset + byteLength in case it's a subarray view.
  const pcmBytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
  bytes.set(pcmBytes)

  return new Uint8Array(buffer)
}

function writeAscii(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}

/**
 * Chunk-safe Uint8Array → base64. The built-in `btoa(String.fromCharCode(...bytes))`
 * pattern blows the call stack on >64 KB buffers; iterate in 32 KB windows.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[])
  }
  return btoa(binary)
}
