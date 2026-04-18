import React, { useState } from 'react'
import { MessageSquareHeart } from 'lucide-react'
import FeedbackDialog from './FeedbackDialog'

/**
 * FeedbackButton — a small wrapper that renders a children-as-trigger element
 * (or a default text button) and opens the FeedbackDialog on click. Works for
 * both guest and authenticated users; the dialog handles auth state internally.
 */
export interface FeedbackButtonProps {
  className?: string
  children?: React.ReactNode
  /** If true, render only the icon (used for collapsed sidebar on mobile). */
  iconOnly?: boolean
  /** Accessible label (also used as title for tooltip on icon-only). */
  label?: string
}

const FeedbackButton: React.FC<FeedbackButtonProps> = ({
  className,
  children,
  iconOnly = false,
  label = 'Send Feedback',
}) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={
          className ??
          'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs text-white/55 hover:text-white/90 hover:bg-white/[0.05]'
        }
      >
        <MessageSquareHeart className="h-4 w-4 flex-shrink-0 text-primary/80" />
        {!iconOnly && (children ?? <span>{label}</span>)}
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export default FeedbackButton
