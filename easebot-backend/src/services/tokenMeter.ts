/**
 * tokenMeter — single source of truth for every cost-bearing call.
 *
 * Uses the Admin SDK (adminDb), which bypasses Firestore rules entirely —
 * matching every other Firestore consumer in accountController.ts and the
 * sibling Cloud Functions implementations (Wedding-Ease-Viva-Chat/functions,
 * theweddingbot v1). This reverses the original Sprint 2 override that pinned
 * this file to the client SDK purely to avoid a Firebase console change
 * (.orchestrator/specs/token-meter.md, "Sprint 2 architectural overrides" #1);
 * that override assumed the target project's rules would stay wide open,
 * which broke once a second, properly-locked-down Firestore project
 * (weddingease-1) came online for local dev.
 *
 * Tier read path: users/{uid}.tierMirror. NOT custom claims.
 * Guest TTL 7d. Written here; console TTL enablement is human action.
 */

import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'
import { emit } from '../lib/observability'
import type {
  Principal,
  Subject,
  Service,
  Tier,
  RawCost,
  ChargeResult,
  UsageSnapshot,
  EstimateInput,
  EstimateResult,
} from '../types/billing'

export type {
  Principal,
  Subject,
  Service,
  Tier,
  RawCost,
  ChargeResult,
  UsageSnapshot,
  EstimateInput,
  EstimateResult,
}

// ---------------------------------------------------------------------------
// Caps (PRD §4 / spec §4.4)
// ---------------------------------------------------------------------------

const MONTHLY_CAPS: Record<Tier, number> = {
  guest: 0,
  free: 300_000,
  pro: 3_000_000,
  promax: 8_000_000,
}

const DAILY_CAPS: Record<Tier, number> = {
  guest: 0,
  free: 50_000,
  pro: 300_000,
  promax: 800_000,
}

const GUEST_LIMITS: Record<string, number> = {
  chat: 10,
  image: 3,
  tts: 3,
  stt: 3,
  vision: 3,
}

const MAX_TOPUPS_PER_MONTH = 10
const GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TIER_CACHE_TTL_MS = 60_000

// ---------------------------------------------------------------------------
// Pure conversion (spec §3)
// ---------------------------------------------------------------------------

export function rawToTokens(raw: RawCost): number {
  const clamp = (n: number | undefined) =>
    !n || n < 0 || !Number.isFinite(n) ? 0 : n

  switch (raw.kind) {
    case 'chat': {
      const prompt = clamp(raw.promptTokens)
      const completion = clamp(raw.completionTokens)
      if (prompt === 0 && completion === 0) {
        console.warn('[tokenMeter] zeroed chat cost')
      }
      return Math.ceil(prompt * 1 + completion * 4)
    }
    case 'image': {
      const count = clamp(raw.count ?? 1)
      const per = raw.quality === 'hd' ? 32_000 : 16_000
      return Math.ceil(per * count)
    }
    case 'tts':
      return Math.ceil(clamp(raw.characters) * 0.3)
    case 'stt':
      return Math.ceil((clamp(raw.seconds) / 60) * 7_000)
    case 'vision':
      return Math.ceil(2_000 * clamp(raw.imageCount))
    case 'algolia':
      return Math.ceil(50 * clamp(raw.queries))
    case 'whatsapp':
      return Math.ceil(2_000 * clamp(raw.messages))
    default: {
      const _exhaustive: never = raw
      void _exhaustive
      return 0
    }
  }
}

function serviceOf(raw: RawCost): Service {
  return raw.kind
}

function counterForGuest(kind: RawCost['kind']): keyof GuestDoc['counters'] | null {
  switch (kind) {
    case 'chat':
      return 'msgCount'
    case 'image':
      return 'imgCount'
    case 'tts':
    case 'stt':
      return 'voiceCount'
    case 'vision':
      return 'visionCount'
    case 'algolia':
      return null
    case 'whatsapp':
      return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentUtcYearMonth(d: Date = new Date()): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  )
}

function endOfUtcMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1, 0, 0, 0))
}

function zeroByService(): Record<Service, number> {
  return {
    chat: 0,
    image: 0,
    tts: 0,
    stt: 0,
    vision: 0,
    algolia: 0,
    whatsapp: 0,
  }
}

// ---------------------------------------------------------------------------
// Tier cache (getTier)
// ---------------------------------------------------------------------------

type TierCacheEntry = { tier: Tier; fetchedAt: number }
const tierCache = new Map<string, TierCacheEntry>()

export async function getTier(uid: string): Promise<Tier> {
  const cached = tierCache.get(uid)
  if (cached && Date.now() - cached.fetchedAt < TIER_CACHE_TTL_MS) {
    return cached.tier
  }
  try {
    const snap = await adminDb.doc(`users/${uid}`).get()
    const raw = snap.exists ? (snap.data()?.tierMirror as string | undefined) : undefined
    const tier: Tier =
      raw === 'pro' || raw === 'promax' || raw === 'free' ? raw : 'free'
    tierCache.set(uid, { tier, fetchedAt: Date.now() })
    return tier
  } catch (err) {
    console.warn('[tokenMeter.getTier] lookup failed, defaulting to free', err)
    return 'free'
  }
}

export function invalidateTierCache(uid?: string): void {
  if (uid) tierCache.delete(uid)
  else tierCache.clear()
}

// ---------------------------------------------------------------------------
// Firestore shapes (internal)
// ---------------------------------------------------------------------------

interface MonthDoc {
  tier: Tier
  monthlyTokensUsed: number
  monthlyTokensCap: number
  extrasPurchasedThisMonth: number
  dailyTokensUsed: number
  dailyResetAt: Timestamp
  byService: Record<Service, number>
  updatedAt: Timestamp
  lastTxnIds?: string[]
}

interface GuestDoc {
  guestId: string
  counters: {
    msgCount: number
    imgCount: number
    voiceCount: number
    visionCount: number
  }
  firstSeenAt: Timestamp
  lastActivityAt: Timestamp
  ttlExpiresAt: Timestamp
  ipHash?: string
}

// ---------------------------------------------------------------------------
// Pre-call estimate (spec §4.2) — non-transactional
// ---------------------------------------------------------------------------

export async function estimateCost(input: EstimateInput): Promise<EstimateResult> {
  const { principal, raw } = input
  const estimatedTokens = rawToTokens(raw)

  if (principal.kind === 'guest') {
    const guestSnap = await adminDb.doc(`guests/${principal.id}`).get().catch(() => null)
    const counters: GuestDoc['counters'] = guestSnap?.exists
      ? ((guestSnap.data() as GuestDoc).counters ?? {
          msgCount: 0,
          imgCount: 0,
          voiceCount: 0,
          visionCount: 0,
        })
      : { msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0 }

    const key = counterForGuest(raw.kind)
    let wouldExceedGuestLimit = false
    if (raw.kind === 'whatsapp') {
      wouldExceedGuestLimit = true
    } else if (key) {
      const limit = GUEST_LIMITS[raw.kind] ?? 0
      wouldExceedGuestLimit = counters[key] + 1 > limit
    }

    return {
      estimatedTokens,
      wouldExceedDaily: false,
      wouldExceedMonthly: false,
      wouldExceedGuestLimit,
      remainingDaily: 0,
      remainingMonthly: 0,
      remainingExtras: 0,
    }
  }

  const monthKey = currentUtcYearMonth()
  const userRef = adminDb.doc(`users/${principal.id}`)
  const monthRef = adminDb.doc(`users/${principal.id}/usage/${monthKey}`)

  const [userSnap, monthSnap] = await Promise.all([
    userRef.get().catch(() => null),
    monthRef.get().catch(() => null),
  ])

  const extras = Number((userSnap?.data() as { extrasBucket?: number } | undefined)?.extrasBucket ?? 0)
  const month = monthSnap?.exists ? (monthSnap.data() as MonthDoc) : null

  const dailyCap = DAILY_CAPS[principal.tier]
  const monthlyCap = MONTHLY_CAPS[principal.tier]
  const monthlyUsed = month?.monthlyTokensUsed ?? 0
  const now = new Date()
  const dailyResetAtMs = month?.dailyResetAt?.toMillis?.() ?? 0
  const dailyUsed = dailyResetAtMs && now.getTime() < dailyResetAtMs ? (month?.dailyTokensUsed ?? 0) : 0

  const remainingMonthly = Math.max(0, monthlyCap - monthlyUsed)
  const remainingDaily = Math.max(0, dailyCap - dailyUsed)
  const totalRoom = remainingMonthly + extras

  return {
    estimatedTokens,
    wouldExceedDaily: estimatedTokens > remainingDaily,
    wouldExceedMonthly: estimatedTokens > totalRoom,
    wouldExceedGuestLimit: false,
    remainingDaily,
    remainingMonthly,
    remainingExtras: extras,
  }
}

// ---------------------------------------------------------------------------
// Transactional charge (spec §4.1)
// ---------------------------------------------------------------------------

function fail(
  reason: ChargeResult['reason'],
  remainingDaily: number,
  remainingMonthly: number,
  remainingExtras: number,
  resetAt?: Date,
): ChargeResult {
  return {
    allowed: false,
    tokensCharged: 0,
    consumedFrom: 'none',
    remainingDaily,
    remainingMonthly,
    remainingExtras,
    reason,
    resetAt: resetAt?.toISOString(),
  }
}

export async function chargeTokens(
  subject: Subject,
  raw: RawCost,
  _opts?: { idempotencyKey?: string },
): Promise<ChargeResult> {
  try {
    if (subject.kind === 'guest') return await chargeGuest(subject, raw)
    return await chargeUser(subject, raw)
  } catch (err) {
    console.error('[tokenMeter.chargeTokens] firestore failure', {
      subject: { kind: subject.kind, id: subject.id },
      serviceKind: raw.kind,
      err: err instanceof Error ? err.message : String(err),
    })
    return fail('firestore_unreachable', 0, 0, 0)
  }
}

async function chargeUser(subject: Subject, raw: RawCost): Promise<ChargeResult> {
  // P1-1: fail-closed guard against unknown tiers. If something upstream
  // corrupted the tier cache or a new tier lands before the table is
  // updated, we would otherwise read `undefined` from MONTHLY_CAPS and
  // silently treat the user as having 0 tokens (or worse, NaN arithmetic).
  if (!(subject.tier in MONTHLY_CAPS) || !(subject.tier in DAILY_CAPS)) {
    console.warn('[tokenMeter] unknown_tier for charge', {
      uid: subject.id,
      tier: subject.tier,
      service: raw.kind,
    })
    return fail('unknown_tier', 0, 0, 0)
  }

  const tokens = Math.max(0, rawToTokens(raw))
  if (tokens === 0) {
    console.log('[tokenMeter] charge=0, skipping ledger write', {
      uid: subject.id,
      service: raw.kind,
    })
    return {
      allowed: true,
      tokensCharged: 0,
      consumedFrom: 'none',
      remainingDaily: DAILY_CAPS[subject.tier],
      remainingMonthly: MONTHLY_CAPS[subject.tier],
      remainingExtras: 0,
      reason: 'ok',
    }
  }

  const monthKey = currentUtcYearMonth()
  const userRef = adminDb.doc(`users/${subject.id}`)
  const monthRef = adminDb.doc(`users/${subject.id}/usage/${monthKey}`)

  return adminDb.runTransaction(async (tx) => {
    const [userSnap, monthSnap] = await Promise.all([tx.get(userRef), tx.get(monthRef)])
    const now = new Date()
    const nowTs = Timestamp.fromDate(now)

    const tier = subject.tier
    const dailyCap = DAILY_CAPS[tier]
    const monthlyCap = MONTHLY_CAPS[tier]

    let month: MonthDoc
    if (monthSnap.exists) {
      month = monthSnap.data() as MonthDoc
      const ms = month.dailyResetAt?.toMillis?.() ?? 0
      if (!ms || now.getTime() >= ms) {
        month.dailyTokensUsed = 0
        month.dailyResetAt = Timestamp.fromDate(nextUtcMidnight(now))
      }
      if (!month.byService) month.byService = zeroByService()
      if (month.monthlyTokensCap !== monthlyCap) month.monthlyTokensCap = monthlyCap
      if (month.tier !== tier) month.tier = tier
    } else {
      month = {
        tier,
        monthlyTokensUsed: 0,
        monthlyTokensCap: monthlyCap,
        extrasPurchasedThisMonth: 0,
        dailyTokensUsed: 0,
        dailyResetAt: Timestamp.fromDate(nextUtcMidnight(now)),
        byService: zeroByService(),
        updatedAt: nowTs,
      }
    }

    const extras = Number((userSnap.data() as { extrasBucket?: number } | undefined)?.extrasBucket ?? 0)
    const monthRoom = Math.max(0, month.monthlyTokensCap - month.monthlyTokensUsed)
    const totalRoom = monthRoom + extras
    const dailyRoom = Math.max(0, dailyCap - month.dailyTokensUsed)

    if (tokens > dailyRoom) {
      emit('token_cap_hit_daily', { uid: subject.id, service: raw.kind, attempted: tokens, dailyRoom, tier })
      return fail('daily_cap_exceeded', dailyRoom, monthRoom, extras, nextUtcMidnight(now))
    }
    if (tokens > totalRoom) {
      emit('token_cap_hit_monthly', { uid: subject.id, service: raw.kind, attempted: tokens, totalRoom, tier })
      return fail('monthly_cap_exceeded', dailyRoom, monthRoom, extras, endOfUtcMonth(monthKey))
    }

    const fromMonthly = Math.min(tokens, monthRoom)
    const fromExtras = tokens - fromMonthly
    const consumedFrom: ChargeResult['consumedFrom'] =
      fromMonthly > 0 && fromExtras > 0 ? 'both' : fromMonthly > 0 ? 'monthly' : 'extras'

    month.monthlyTokensUsed += fromMonthly
    month.dailyTokensUsed += tokens
    month.byService[serviceOf(raw)] = (month.byService[serviceOf(raw)] ?? 0) + tokens
    month.updatedAt = nowTs

    tx.set(monthRef, month, { merge: true })
    if (fromExtras > 0) {
      if (userSnap.exists) {
        tx.update(userRef, { extrasBucket: extras - fromExtras })
      } else {
        tx.set(userRef, { extrasBucket: Math.max(0, extras - fromExtras) }, { merge: true })
      }
    }

    console.log('[tokenMeter] charge_ok', {
      uid: subject.id,
      service: raw.kind,
      tokens,
      consumedFrom,
    })

    return {
      allowed: true,
      tokensCharged: tokens,
      consumedFrom,
      remainingDaily: dailyCap - month.dailyTokensUsed,
      remainingMonthly: month.monthlyTokensCap - month.monthlyTokensUsed,
      remainingExtras: extras - fromExtras,
      reason: 'ok',
    }
  })
}

async function chargeGuest(subject: Subject, raw: RawCost): Promise<ChargeResult> {
  if (raw.kind === 'whatsapp') {
    return fail('guest_limit_exceeded', 0, 0, 0)
  }

  const guestRef = adminDb.doc(`guests/${subject.id}`)

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(guestRef)
    const now = new Date()
    const nowTs = Timestamp.fromDate(now)
    const ttlTs = Timestamp.fromDate(new Date(now.getTime() + GUEST_TTL_MS))

    let g: GuestDoc
    if (snap.exists) {
      g = snap.data() as GuestDoc
      if (!g.counters) {
        g.counters = { msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0 }
      }
    } else {
      g = {
        guestId: subject.id,
        counters: { msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0 },
        firstSeenAt: nowTs,
        lastActivityAt: nowTs,
        ttlExpiresAt: ttlTs,
        ipHash: subject.ipHash,
      }
    }

    const key = counterForGuest(raw.kind)
    if (raw.kind === 'algolia') {
      // free for guests, no counter
      g.lastActivityAt = nowTs
      tx.set(guestRef, g, { merge: true })
      return {
        allowed: true,
        tokensCharged: 0,
        consumedFrom: 'none',
        remainingDaily: 0,
        remainingMonthly: 0,
        remainingExtras: 0,
        reason: 'ok',
      }
    }
    if (!key) {
      return fail('guest_limit_exceeded', 0, 0, 0)
    }

    const limit = GUEST_LIMITS[raw.kind] ?? 0
    const current = g.counters[key] ?? 0
    if (current + 1 > limit) {
      emit('guest_limit_hit', { guestId: subject.id, counter: key, current, limit, service: raw.kind })
      return fail('guest_limit_exceeded', 0, 0, 0)
    }

    g.counters[key] = current + 1
    g.lastActivityAt = nowTs
    tx.set(guestRef, g, { merge: true })

    return {
      allowed: true,
      tokensCharged: 0,
      consumedFrom: 'none',
      remainingDaily: 0,
      remainingMonthly: 0,
      remainingExtras: 0,
      reason: 'ok',
    }
  })
}

// ---------------------------------------------------------------------------
// System-principal helper for scheduler cost sites (spec §9 item 5)
// ---------------------------------------------------------------------------

export async function chargeTokensAsSystem(
  uid: string,
  raw: RawCost,
): Promise<ChargeResult> {
  const tier = await getTier(uid)
  const subject: Principal = { kind: 'user', id: uid, tier }
  return chargeTokens(subject, raw)
}

// ---------------------------------------------------------------------------
// Read-only snapshot
// ---------------------------------------------------------------------------

export async function getUsage(subject: Subject): Promise<UsageSnapshot> {
  if (subject.kind === 'guest') {
    const snap = await adminDb.doc(`guests/${subject.id}`).get()
    const counters = snap.exists
      ? (snap.data() as GuestDoc).counters ?? {
          msgCount: 0,
          imgCount: 0,
          voiceCount: 0,
          visionCount: 0,
        }
      : { msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0 }
    return {
      tier: 'guest',
      monthlyTokensUsed: 0,
      monthlyTokensCap: 0,
      extrasBucket: 0,
      extrasPurchasedThisMonth: 0,
      dailyTokensUsed: 0,
      dailyResetAt: new Date().toISOString(),
      byService: zeroByService(),
      updatedAt: new Date().toISOString(),
      guestCounters: counters,
    }
  }

  const monthKey = currentUtcYearMonth()
  const userRef = adminDb.doc(`users/${subject.id}`)
  const monthRef = adminDb.doc(`users/${subject.id}/usage/${monthKey}`)
  const [userSnap, monthSnap] = await Promise.all([userRef.get(), monthRef.get()])

  const extras = Number((userSnap.data() as { extrasBucket?: number } | undefined)?.extrasBucket ?? 0)
  const tier = subject.tier
  const monthlyCap = MONTHLY_CAPS[tier]

  if (!monthSnap.exists) {
    return {
      tier,
      monthlyTokensUsed: 0,
      monthlyTokensCap: monthlyCap,
      extrasBucket: extras,
      extrasPurchasedThisMonth: 0,
      dailyTokensUsed: 0,
      dailyResetAt: nextUtcMidnight().toISOString(),
      byService: zeroByService(),
      updatedAt: new Date().toISOString(),
    }
  }
  const m = monthSnap.data() as MonthDoc
  return {
    tier,
    monthlyTokensUsed: m.monthlyTokensUsed ?? 0,
    monthlyTokensCap: m.monthlyTokensCap ?? monthlyCap,
    extrasBucket: extras,
    extrasPurchasedThisMonth: m.extrasPurchasedThisMonth ?? 0,
    dailyTokensUsed: m.dailyTokensUsed ?? 0,
    dailyResetAt: m.dailyResetAt?.toDate?.()?.toISOString?.() ?? nextUtcMidnight().toISOString(),
    byService: m.byService ?? zeroByService(),
    updatedAt: m.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Top-up extras (paymentController consumer)
// ---------------------------------------------------------------------------

export class TopUpCapExceededError extends Error {
  constructor() {
    super('top_up_cap_exceeded')
    this.name = 'TopUpCapExceededError'
  }
}

export async function addExtras(
  uid: string,
  tokens: number,
  txnid: string,
): Promise<{ newExtrasBalance: number; extrasPurchasedThisMonth: number }> {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    throw new Error('addExtras requires positive token count')
  }
  const monthKey = currentUtcYearMonth()
  const userRef = adminDb.doc(`users/${uid}`)
  const monthRef = adminDb.doc(`users/${uid}/usage/${monthKey}`)
  // P1-2: permanent per-txn idempotency record. Sharded per uid, keyed by
  // PayU txnid so replays (controller retry, webhook double-fire, resumed
  // status poll) are a no-op regardless of how old the first run was.
  const txnRef = adminDb.doc(`users/${uid}/extrasTxns/${txnid}`)

  return adminDb.runTransaction(async (tx) => {
    const [userSnap, monthSnap, txnSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(monthRef),
      tx.get(txnRef),
    ])
    const now = new Date()
    const nowTs = Timestamp.fromDate(now)

    const currentExtras = Number(
      (userSnap.data() as { extrasBucket?: number } | undefined)?.extrasBucket ?? 0,
    )
    let month: MonthDoc
    if (monthSnap.exists) {
      month = monthSnap.data() as MonthDoc
    } else {
      // Read tier from the userSnap already loaded via tx.get() above —
      // calling getTier() here would violate Firestore's "reads before writes,
      // all via tx" rule (it does an external getDoc outside the transaction).
      const tierFromMirror = (userSnap.data() as { tierMirror?: Tier } | undefined)?.tierMirror
      const tier: Tier = (tierFromMirror && tierFromMirror in MONTHLY_CAPS)
        ? tierFromMirror
        : 'free'
      month = {
        tier,
        monthlyTokensUsed: 0,
        monthlyTokensCap: MONTHLY_CAPS[tier],
        extrasPurchasedThisMonth: 0,
        dailyTokensUsed: 0,
        dailyResetAt: Timestamp.fromDate(nextUtcMidnight(now)),
        byService: zeroByService(),
        updatedAt: nowTs,
      }
    }

    // P1-2: month-scoped lookup replaces the fragile 20-slot lastTxnIds
    // rolling window. If this exact txnid was already credited, return
    // current balances unchanged.
    if (txnSnap.exists) {
      return {
        newExtrasBalance: currentExtras,
        extrasPurchasedThisMonth: month.extrasPurchasedThisMonth ?? 0,
      }
    }
    if ((month.extrasPurchasedThisMonth ?? 0) >= MAX_TOPUPS_PER_MONTH) {
      throw new TopUpCapExceededError()
    }

    const newExtras = currentExtras + tokens
    month.extrasPurchasedThisMonth = (month.extrasPurchasedThisMonth ?? 0) + 1
    month.updatedAt = nowTs

    tx.set(monthRef, month, { merge: true })
    // Mark the txnid as credited atomically with the balance update.
    tx.set(txnRef, {
      txnid,
      tokens,
      creditedAt: nowTs,
      monthKey,
    })
    if (userSnap.exists) {
      tx.update(userRef, { extrasBucket: newExtras })
    } else {
      tx.set(userRef, { extrasBucket: newExtras }, { merge: true })
    }

    console.log('[tokenMeter] addExtras_ok', { uid, tokens, txnid, newExtras })
    return {
      newExtrasBalance: newExtras,
      extrasPurchasedThisMonth: month.extrasPurchasedThisMonth,
    }
  })
}

// ---------------------------------------------------------------------------
// Reset monthly pool (subscriptionStateMachine consumer — Sprint 3 calls this)
// ---------------------------------------------------------------------------

export async function resetMonthly(uid: string, tier: Tier): Promise<void> {
  const monthKey = currentUtcYearMonth()
  const monthRef = adminDb.doc(`users/${uid}/usage/${monthKey}`)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(monthRef)
    const now = new Date()
    const nowTs = Timestamp.fromDate(now)
    const base: MonthDoc = snap.exists
      ? (snap.data() as MonthDoc)
      : {
          tier,
          monthlyTokensUsed: 0,
          monthlyTokensCap: MONTHLY_CAPS[tier],
          extrasPurchasedThisMonth: 0,
          dailyTokensUsed: 0,
          dailyResetAt: Timestamp.fromDate(nextUtcMidnight(now)),
          byService: zeroByService(),
          updatedAt: nowTs,
        }
    // A tier change / new billing cycle grants a fresh slate: zero both the
    // monthly pool AND the daily counter so the user can spend the new caps
    // immediately. Without resetting daily, a free user who exhausts 50k and
    // then upgrades to Pro would still be blocked until the next UTC midnight.
    base.monthlyTokensUsed = 0
    base.monthlyTokensCap = MONTHLY_CAPS[tier]
    base.dailyTokensUsed = 0
    base.dailyResetAt = Timestamp.fromDate(nextUtcMidnight(now))
    base.byService = zeroByService()
    base.tier = tier
    base.updatedAt = nowTs
    tx.set(monthRef, base, { merge: true })
  })
  invalidateTierCache(uid)
  console.log('[tokenMeter] resetMonthly', { uid, tier })
}

// ---------------------------------------------------------------------------
// Refund (LH-06)
// ---------------------------------------------------------------------------

export async function refundTokens(
  subject: Subject,
  tokens: number,
  originalConsumedFrom: 'monthly' | 'extras' | 'both',
  service: Service,
): Promise<void> {
  if (subject.kind === 'guest') return
  if (!Number.isFinite(tokens) || tokens <= 0) return

  const monthKey = currentUtcYearMonth()
  const userRef = adminDb.doc(`users/${subject.id}`)
  const monthRef = adminDb.doc(`users/${subject.id}/usage/${monthKey}`)

  await adminDb.runTransaction(async (tx) => {
    const [userSnap, monthSnap] = await Promise.all([tx.get(userRef), tx.get(monthRef)])
    if (!monthSnap.exists) return
    const month = monthSnap.data() as MonthDoc

    // Reverse in opposite order: extras first, then monthly.
    let toExtras = 0
    let toMonthly = 0
    if (originalConsumedFrom === 'extras') {
      toExtras = tokens
    } else if (originalConsumedFrom === 'monthly') {
      toMonthly = tokens
    } else {
      // 'both': we don't know the exact split after the fact; return everything
      // to monthly first (conservative — user loses nothing), then extras if
      // monthly would go negative.
      toMonthly = Math.min(tokens, month.monthlyTokensUsed)
      toExtras = tokens - toMonthly
    }

    month.monthlyTokensUsed = Math.max(0, month.monthlyTokensUsed - toMonthly)
    month.dailyTokensUsed = Math.max(0, month.dailyTokensUsed - tokens)
    month.byService[service] = Math.max(0, (month.byService[service] ?? 0) - tokens)
    month.updatedAt = Timestamp.fromDate(new Date())

    tx.set(monthRef, month, { merge: true })
    if (toExtras > 0) {
      const extras = Number(
        (userSnap.data() as { extrasBucket?: number } | undefined)?.extrasBucket ?? 0,
      )
      if (userSnap.exists) {
        tx.update(userRef, { extrasBucket: extras + toExtras })
      } else {
        tx.set(userRef, { extrasBucket: extras + toExtras }, { merge: true })
      }
    }
  })

  console.log('[tokenMeter] refundTokens', {
    uid: subject.id,
    tokens,
    originalConsumedFrom,
    service,
  })
}
