/**
 * Reverse proxy for PostHog ingestion. The browser posts to /ingest/* on our
 * own origin (bypassing ad-blockers that target *.posthog.com). We forward to
 * the configured PostHog instance.
 *
 * The body must be passed through untouched. posthog-js sends gzipped payloads
 * as content-type: text/plain with `?compression=gzip-js`, and also sends
 * application/x-www-form-urlencoded for /e/ without compression. Parsing and
 * re-serializing any of those corrupts the payload, so we attach a raw body
 * parser scoped to this router.
 */
import express, { type Request, type Response } from 'express'

const router = express.Router()

const UPSTREAM = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com'
// PostHog SDK fetches:
//   /e, /s, /i                    — event capture
//   /decide, /flags               — feature-flag eval
//   /array.js                     — legacy single-file SDK bundle
//   /array/<api_key>/config.js    — per-project SDK config (newer SDKs)
//   /static/...                   — additional bundle assets
//   /batch, /capture              — batched capture
// The trailing `array/` (with slash) covers the per-project config path. Without
// it, dev-mode and prod both 404 on the project config request and the SDK
// silently degrades to defaults.
const ALLOWED_PATHS = /^\/(e|s|i|decide|flags|array\.js|array\/|static\/|batch|capture)/

router.use(express.raw({ type: '*/*', limit: '5mb' }))

async function proxy(req: Request, res: Response): Promise<void> {
  if (!ALLOWED_PATHS.test(req.path)) {
    res.status(404).end()
    return
  }
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const target = `${UPSTREAM}${req.path}${qs}`
  try {
    const isBodyless = req.method === 'GET' || req.method === 'HEAD'
    const rawBody = Buffer.isBuffer(req.body)
      ? new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength)
      : undefined
    const upstreamRes = await fetch(target, {
      method: req.method,
      headers: {
        'content-type': req.header('content-type') ?? 'application/json',
        'user-agent': req.header('user-agent') ?? 'easebot-proxy',
        'x-forwarded-for': req.header('x-forwarded-for') ?? req.ip ?? '',
      },
      body: isBodyless ? undefined : (rawBody as BodyInit | undefined),
    })
    res.status(upstreamRes.status)
    upstreamRes.headers.forEach((v, k) => {
      if (k === 'content-encoding' || k === 'transfer-encoding') return
      res.setHeader(k, v)
    })
    const buf = Buffer.from(await upstreamRes.arrayBuffer())
    res.end(buf)
  } catch (err) {
    console.warn('[ingest] proxy error', err)
    res.status(502).end()
  }
}

router.get(/.*/, proxy)
router.post(/.*/, proxy)

export default router
