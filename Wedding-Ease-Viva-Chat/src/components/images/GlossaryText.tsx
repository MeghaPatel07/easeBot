import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { findGlossaryTerms, lookupGlossaryTerm, type GlossaryEntry } from '@/data/vibeGlossary'
import { cn } from '@/lib/utils'

interface GlossaryTermProps {
  entry: GlossaryEntry
  /** The exact surface text to display (preserves original casing / plural). */
  children: React.ReactNode
}

/**
 * A single glossary term rendered as a keyboard-focusable, screen-reader-reachable
 * definition tooltip. Uses the shared Radix/shadcn Tooltip primitive.
 *
 * Accessibility:
 *  - The trigger is a real <button>, so it is in the tab order and operable by
 *    keyboard. Radix opens the tooltip on focus as well as hover.
 *  - Radix wires `aria-describedby` from the trigger to the tooltip content, so
 *    screen readers announce the definition — it is NOT hover-only.
 *  - We also expose the definition via `<dfn title>` (the WCAG 3.1.3 pattern) as
 *    a native fallback for environments where the JS tooltip is unavailable.
 */
function GlossaryTerm({ entry, children }: GlossaryTermProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // The button only reveals a definition; it performs no action when
          // clicked, so keep it visually inline with the surrounding text.
          className={cn(
            'cursor-help underline decoration-dotted decoration-foreground/40 underline-offset-2',
            'rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          )}
          // onClick is intentionally a no-op: prevents the click from bubbling to
          // a parent (e.g. a VibeCard select button) when used inside one.
          onClick={(e) => e.stopPropagation()}
        >
          <dfn title={entry.definition} className="not-italic">
            {children}
          </dfn>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem] text-left">
        <span className="font-semibold">{entry.term}</span>
        {': '}
        {entry.definition}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Inline native-tooltip variant for use INSIDE an interactive parent (e.g. a
 * selectable VibeCard button). Nesting a <button> inside a <button> is invalid
 * HTML and breaks keyboard order, so here we render a plain `<dfn title>` — the
 * canonical WCAG 3.1.3 pattern, which is still reachable by screen readers and
 * surfaces the definition on hover/focus of the surrounding control.
 */
function GlossaryDfn({ entry, children }: GlossaryTermProps) {
  return (
    <dfn
      title={`${entry.term}: ${entry.definition}`}
      className="cursor-help text-inherit underline decoration-dotted underline-offset-2 not-italic"
    >
      {children}
    </dfn>
  )
}

interface GlossaryTextProps {
  /** Free text that may contain one or more specialist terms. */
  text: string
  className?: string
  /**
   * When true, render terms as non-interactive `<dfn title>` rather than a
   * focusable button tooltip. Use inside another interactive element.
   */
  inline?: boolean
}

/**
 * Renders a string, wrapping any recognised specialist / cultural term in a
 * GlossaryTerm tooltip while leaving the rest of the copy untouched. Cultural
 * vocabulary (jaali, jharokha, brocade, …) is preserved verbatim — only an
 * inline definition is layered on top.
 *
 * If the text contains no glossary terms, the original string is returned as-is
 * (no extra DOM), so this is safe to use everywhere a vibe string renders.
 */
export function GlossaryText({ text, className, inline = false }: GlossaryTextProps) {
  const terms = findGlossaryTerms(text)
  if (terms.length === 0) {
    return <>{text}</>
  }

  // Build a single regex that matches any known term as a whole word
  // (case-insensitive, plural-tolerant via an optional trailing "s").
  const pattern = new RegExp(
    `\\b(${terms.map((t) => escapeRegExp(t.term)).join('|')})(s)?\\b`,
    'gi',
  )

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    const matched = match[0]
    const entry = lookupGlossaryTerm(matched)
    if (!entry) continue
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const Wrap = inline ? GlossaryDfn : GlossaryTerm
    nodes.push(
      <Wrap key={`g-${key++}`} entry={entry}>
        {matched}
      </Wrap>,
    )
    lastIndex = match.index + matched.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return <span className={className}>{nodes}</span>
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
