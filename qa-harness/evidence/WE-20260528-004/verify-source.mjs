/**
 * Standalone harness — exercises a replica of the patched
 * paymentController.frontendBaseUrl + handleReturn early-exit redirect
 * without requiring Firebase/Azure/PayU credentials.
 *
 * Run from inside easebot-backend/ (so `express` resolves):
 *   cp qa-harness/evidence/WE-20260528-004/verify-source.mjs \
 *      easebot-backend/verify-WE-20260528-004.mjs
 *   cd easebot-backend && node verify-WE-20260528-004.mjs
 *   rm easebot-backend/verify-WE-20260528-004.mjs
 */
import express from 'express'
import http from 'http'

const DEV_FRONTEND_FALLBACK = 'http://localhost:8081'
function frontendBaseUrl() {
  const v = process.env.FRONTEND_BASE_URL
  if (v) return v
  if (process.env.NODE_ENV !== 'production') return DEV_FRONTEND_FALLBACK
  throw new Error('missing env: FRONTEND_BASE_URL')
}

const app = express()
app.use(express.urlencoded({ extended: true }))
app.post('/api/payment/return', (req, res) => {
  const payload = req.body ?? {}
  const txnid = payload.txnid
  const expectedHash = payload.hash
  const frontend = frontendBaseUrl()
  if (!txnid || !expectedHash) {
    res.redirect(302, `${frontend}/payment/failure?reason=bad_payload`)
    return
  }
  res.status(200).send('would have gone to finalize')
})

const server = http.createServer(app)
server.listen(0, async () => {
  const port = server.address().port
  const cases = [
    { name: 'dev, FRONTEND_BASE_URL unset (NEW fallback)',  env: { NODE_ENV: 'development' } },
    { name: 'dev, FRONTEND_BASE_URL=http://localhost:8081 (explicit)', env: { NODE_ENV: 'development', FRONTEND_BASE_URL: 'http://localhost:8081' } },
    { name: 'dev, FRONTEND_BASE_URL=http://localhost:8080 (legacy override still honored)', env: { NODE_ENV: 'development', FRONTEND_BASE_URL: 'http://localhost:8080' } },
    { name: 'prod, FRONTEND_BASE_URL=https://app.example.com', env: { NODE_ENV: 'production', FRONTEND_BASE_URL: 'https://app.example.com' } },
  ]
  for (const c of cases) {
    delete process.env.FRONTEND_BASE_URL
    Object.assign(process.env, c.env)
    const loc = await new Promise((resolve, reject) => {
      const req = http.request({
        port, method: 'POST', path: '/api/payment/return',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        const l = res.headers.location ?? ''
        res.resume()
        res.on('end', () => resolve(String(l)))
      })
      req.on('error', reject)
      req.write('status=success&txnid=test')
      req.end()
    })
    console.log(`[${c.name}]\n  -> Location: ${loc}\n`)
  }
  delete process.env.FRONTEND_BASE_URL
  process.env.NODE_ENV = 'production'
  try {
    frontendBaseUrl()
    console.log('[prod, FRONTEND_BASE_URL unset] -> UNEXPECTED: no throw')
  } catch (err) {
    console.log(`[prod, FRONTEND_BASE_URL unset]\n  -> throws: ${err.message} (validatePaymentConfig also exits at boot)`)
  }
  server.close()
})
