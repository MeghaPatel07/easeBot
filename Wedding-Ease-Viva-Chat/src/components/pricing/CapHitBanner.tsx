import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { onQuotaExceeded, type QuotaExceededPayload } from '@/services/accountService'
import { cn } from '@/lib/utils'

export function CapHitBanner({ className }: { className?: string }) {
  const [payload, setPayload] = useState<QuotaExceededPayload | null>(null)

  useEffect(() => onQuotaExceeded(setPayload), [])

  if (!payload) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive backdrop-blur',
        className,
      )}
    >
      <div className="mx-auto flex max-w-4xl items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 text-foreground/90/90">
          <p className="font-medium text-destructive">{payload.message}</p>
          {payload.resetAt && (
            <p className="text-xs text-foreground/90">
              Resets {new Date(payload.resetAt).toLocaleString()}
            </p>
          )}
        </div>
        <Link
          to={payload.upgradeUrl.replace(/^\//, '/')}
          className="inline-flex min-h-9 items-center rounded-md border border-destructive/50 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20"
        >
          {payload.reason === 'guest_limit_exceeded' ? 'Sign up' : 'Upgrade'}
        </Link>
        <button
          type="button"
          onClick={() => setPayload(null)}
          aria-label="Dismiss quota banner"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground/90 hover:bg-foreground/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default CapHitBanner
