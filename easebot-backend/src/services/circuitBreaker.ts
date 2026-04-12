/**
 * Circuit Breaker pattern implementation.
 *
 * States: CLOSED (normal) -> OPEN (blocking) -> HALF_OPEN (testing)
 */

export class CircuitBreakerError extends Error {
  constructor(breakerName: string) {
    super(`Circuit breaker "${breakerName}" is OPEN — requests are being rejected`)
    this.name = 'CircuitBreakerError'
  }
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold: number   // failures before opening
  windowMs: number           // time window for counting failures
  cooldownMs: number         // time to wait before half-open
  name: string               // for logging
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures: { timestamp: number }[] = []
  private lastFailureTime?: Date
  private openedAt?: number

  private readonly failureThreshold: number
  private readonly windowMs: number
  private readonly cooldownMs: number
  private readonly name: string

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold
    this.windowMs = options.windowMs
    this.cooldownMs = options.cooldownMs
    this.name = options.name
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if cooldown has elapsed -> transition to HALF_OPEN
      if (this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN'
        console.log(`[circuitBreaker:${this.name}] OPEN -> HALF_OPEN (cooldown elapsed)`)
      } else {
        throw new CircuitBreakerError(this.name)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  getState(): CircuitState {
    // Check for cooldown transition without executing
    if (this.state === 'OPEN' && this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) {
      return 'HALF_OPEN'
    }
    return this.state
  }

  getStats(): { state: string; failures: number; lastFailure?: Date } {
    return {
      state: this.getState(),
      failures: this.getRecentFailureCount(),
      lastFailure: this.lastFailureTime,
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      console.log(`[circuitBreaker:${this.name}] HALF_OPEN -> CLOSED (success)`)
      this.state = 'CLOSED'
      this.failures = []
      this.openedAt = undefined
    }
  }

  private onFailure(): void {
    const now = Date.now()
    this.failures.push({ timestamp: now })
    this.lastFailureTime = new Date(now)

    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN -> back to OPEN
      console.log(`[circuitBreaker:${this.name}] HALF_OPEN -> OPEN (test request failed)`)
      this.state = 'OPEN'
      this.openedAt = now
      return
    }

    // CLOSED state: check if threshold exceeded within window
    const recentCount = this.getRecentFailureCount()
    if (recentCount >= this.failureThreshold) {
      console.log(
        `[circuitBreaker:${this.name}] CLOSED -> OPEN (${recentCount} failures in ${this.windowMs}ms window)`
      )
      this.state = 'OPEN'
      this.openedAt = now
    }
  }

  private getRecentFailureCount(): number {
    const cutoff = Date.now() - this.windowMs
    // Prune old failures
    this.failures = this.failures.filter(f => f.timestamp >= cutoff)
    return this.failures.length
  }
}

// ── Pre-configured circuit breakers ─────────────────────────────────────────────

export const llmCircuitBreaker = new CircuitBreaker({
  name: 'AzureOpenAI',
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
})

export const imageCircuitBreaker = new CircuitBreaker({
  name: 'ImageGen',
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
})

export const speechCircuitBreaker = new CircuitBreaker({
  name: 'AzureSpeech',
  failureThreshold: 3,
  windowMs: 60_000,
  cooldownMs: 60_000,
})

export const translatorCircuitBreaker = new CircuitBreaker({
  name: 'AzureTranslator',
  failureThreshold: 3,
  windowMs: 60_000,
  cooldownMs: 30_000,
})
