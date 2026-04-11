import sharp from 'sharp'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

// ── Types ────────────────────────────────────────────────────────────────────

export interface PostProcessOptions {
  upscale?: boolean
  outputFormat?: 'png' | 'webp' | 'jpeg'
  transparent?: boolean
}

// ── Post-processing pipeline ─────────────────────────────────────────────────

export async function postProcessImage(
  b64: string,
  options: PostProcessOptions = {}
): Promise<string> {
  // Kill switch
  if (process.env.ENABLE_IMAGE_UPSCALE === 'false' && !options.outputFormat) {
    return b64
  }

  let buffer: Buffer = Buffer.from(b64, 'base64')

  try {
    const meta = await sharp(buffer).metadata()

    // Stage 6A: Resolution upscaling (if enabled and image is small)
    if (options.upscale && process.env.ENABLE_IMAGE_UPSCALE !== 'false' && meta.width && meta.width < 2048) {
      buffer = Buffer.from(await sharp(buffer)
        .resize(meta.width * 2, meta.height! * 2, {
          kernel: 'lanczos3',
          withoutEnlargement: false,
        })
        .toBuffer())
      console.log(`[imagePostProcessor] Upscaled ${meta.width}x${meta.height} → ${meta.width * 2}x${meta.height! * 2}`)
    }

    // Stage 6B: Format optimization
    if (options.outputFormat === 'webp') {
      buffer = Buffer.from(await sharp(buffer).webp({ quality: 90 }).toBuffer())
    } else if (options.outputFormat === 'jpeg') {
      buffer = Buffer.from(await sharp(buffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer())
    }
    // PNG stays as-is (lossless)

    // Stage 6C: Compression if over 2MB
    if (buffer.length > MAX_IMAGE_BYTES) {
      buffer = await compressImage(buffer)
    }

    return buffer.toString('base64')
  } catch (err) {
    console.error('[imagePostProcessor] Error, returning original:', err)
    return b64
  }
}

// ── Compression cascade ──────────────────────────────────────────────────────

async function compressImage(inputBuffer: Buffer): Promise<Buffer> {
  for (const quality of [92, 85, 78, 70]) {
    const compressed = await sharp(inputBuffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()

    if (compressed.length <= MAX_IMAGE_BYTES) {
      console.log(`[imagePostProcessor] Compressed ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (q=${quality})`)
      return compressed
    }
  }

  // Last resort: resize
  const resized = await sharp(inputBuffer)
    .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 65, mozjpeg: true })
    .toBuffer()

  console.log(`[imagePostProcessor] Compressed+resized → ${Math.round(resized.length / 1024)}KB`)
  return resized
}
