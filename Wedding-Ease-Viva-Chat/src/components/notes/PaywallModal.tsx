import { useNavigate } from 'react-router-dom'
import { Crown, Check, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { tierLabel, upgradeTier, type PlanTier } from '@/config/tierConfig'

interface PaywallModalProps {
  open: boolean
  onClose: () => void
  currentTier: PlanTier
  /** What the user tried to do — shapes the headline copy. */
  trigger?: 'edit' | 'create' | 'template'
}

const FEATURES = [
  'Create unlimited notes',
  'Rich editor with images, tables, and to-dos',
  'Share notes with your partner, family, and vendors',
  'Real-time collaboration with comments',
  'Export notes as PDF',
]

const HEADLINES: Record<NonNullable<PaywallModalProps['trigger']>, string> = {
  edit: 'Editing is a Pro feature',
  create: 'Creating notes is a Pro feature',
  template: 'Templates are a Pro feature',
}

export default function PaywallModal({
  open,
  onClose,
  currentTier,
  trigger = 'edit',
}: PaywallModalProps) {
  const navigate = useNavigate()
  const nextTier = upgradeTier(currentTier) ?? 'pro'

  const handleUpgrade = () => {
    onClose()
    navigate('/pricing')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border bg-card">
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-8 pb-6 text-center border-b border-border/50">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 mb-3">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="text-xl font-headline text-foreground">
                {HEADLINES[trigger]}
              </DialogTitle>
              <p className="text-sm text-foreground/60">
                You're on the{' '}
                <span className="font-medium text-foreground/80">{tierLabel(currentTier)}</span> plan.
                Upgrade to {tierLabel(nextTier)} to unlock the full notes experience.
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-2.5">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
            <Button
              onClick={handleUpgrade}
              className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-medium"
            >
              Upgrade to {tierLabel(nextTier)}
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="w-full text-foreground/50 hover:text-foreground/80"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
