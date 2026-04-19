// pcm-recorder-processor — runs inside AudioWorkletGlobalScope.
// Captures raw PCM Float32 samples at the AudioContext's sample rate
// (typically 44.1 or 48 kHz) and posts them to the main thread every
// process() tick (~128 samples ≈ 2.7 ms at 48 kHz).
//
// The main thread is responsible for:
//   - maintaining a ring buffer
//   - slicing with a pre-roll offset when the user starts recording
//   - downsampling to 16 kHz + WAV encoding at stop
//
// The worklet stays alive as long as the AudioContext is running — it is
// pre-warmed and reused across recordings to eliminate click-to-capture
// latency. This is the engine backing fixes A (persistent stream) + B
// (verified-capture UI signal) + C (300 ms pre-click lookback).
//
// Single-channel mono: we take input[0][0] (first input, first channel).
// If the source is stereo we ignore the right channel — STT only needs mono.

class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const ch0 = input[0]
    if (!ch0 || ch0.length === 0) return true

    // Copy the Float32Array (the underlying buffer is reused by the host
    // every tick, so we must clone before transferring).
    const copy = new Float32Array(ch0.length)
    copy.set(ch0)

    // Transfer ownership to avoid copying across the thread boundary.
    // The main thread receives a Float32Array it can consume freely.
    this.port.postMessage(copy, [copy.buffer])
    return true // keep the processor alive
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor)
