/**
 * Live header inspection (WE-20260527-047) — boots each rate-limiter on an
 * ephemeral port, hammers it until 429, and dumps the response headers + body.
 *
 * Run:
 *   npx ts-node --transpile-only src/middleware/__tests__/inspectHeaders.ts
 *
 * Equivalent to:
 *   for i in $(seq 1 100); do curl -sI http://localhost:PORT/ | head -20; done
 * but self-contained so we don't need full backend env vars.
 *
 * Output is captured in qa-harness/evidence/WE-20260527-047/after-headers.txt.
 */
import http from 'http'
import { AddressInfo } from 'net'
import express from 'express'
import { apiRateLimiter, chatBurstRateLimiter, imageRateLimiter } from '../rateLimiter'

async function fetch(url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) headers[k] = v.join(',')
            else if (typeof v === 'string') headers[k] = v
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      })
      .on('error', reject)
  })
}

async function inspect(label: string, limiter: express.RequestHandler, max: number): Promise<void> {
  const app = express()
  app.use(limiter)
  app.get('/probe', (_req, res) => res.json({ ok: true }))
  const server = app.listen(0)
  await new Promise<void>((r) => server.on('listening', () => r()))
  const port = (server.address() as AddressInfo).port
  console.log(`\n========================================`)
  console.log(`${label} (hammering until 429…)`)
  console.log(`========================================`)
  let r: Awaited<ReturnType<typeof fetch>> | null = null
  for (let i = 0; i < max + 5; i++) {
    r = await fetch(`http://127.0.0.1:${port}/probe`)
    if (r.status === 429) break
  }
  if (!r) return
  console.log(`HTTP/1.1 ${r.status}`)
  for (const k of Object.keys(r.headers).sort()) {
    if (/^(ratelimit|retry-after|x-ratelimit|content-type)/i.test(k)) {
      console.log(`${k}: ${r.headers[k]}`)
    }
  }
  console.log(`\nBody:`)
  console.log(r.body)
  await new Promise<void>((r) => server.close(() => r()))
}

void (async () => {
  await inspect('apiRateLimiter (30/min)', apiRateLimiter, 30)
  await inspect('imageRateLimiter (5/min)', imageRateLimiter, 5)
  await inspect('chatBurstRateLimiter (10/10s, per-uid|guest-fp)', chatBurstRateLimiter, 10)
})()
