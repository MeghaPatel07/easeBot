/**
 * Retry utility with exponential backoff and jitter.
 */

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors?: (error: any) => boolean
}

/** Default: retry on common transient HTTP status codes */
function defaultRetryable(error: any): boolean {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status
  if (status && [429, 500, 502, 503, 504].includes(status)) return true
  // Retry on network-level errors (ECONNRESET, ETIMEDOUT, etc.)
  const code = error?.code
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(code)) return true
  // Retry on generic fetch failures
  if (error?.message && /fetch failed|network|socket hang up/i.test(error.message)) return true
  return false
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * Delay formula: min(baseDelay * 2^attempt, maxDelay) + jitter (0-30%)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors = defaultRetryable } = options

  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (attempt >= maxRetries || !retryableErrors(err)) {
        throw err
      }

      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = Math.random() * 0.3 * exponentialDelay
      const delay = Math.round(exponentialDelay + jitter)

      console.log(
        `[retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`,
        err instanceof Error ? err.message : err
      )

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // Unreachable, but satisfies TypeScript
  throw lastError
}
