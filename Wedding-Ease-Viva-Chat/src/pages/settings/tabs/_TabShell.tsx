// _TabShell — shared layout wrapper used by every Settings tab.
// Sprint 1 of Settings & Profile redesign (PRD §9). Keeps title/description
// consistent across all 8 tabs.

import React from 'react'

interface TabShellProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function TabShell({ title, description, children }: TabShellProps) {
  // Sprint 4 (Hana, Marcus QA "density does nothing"):
  // `settings-dense` opts in to the --dense-spacing CSS variable defined in
  // index.css. AppearanceTab toggles data-density on <html>; the inner
  // container collapses from 1rem→0.5rem when `compact` is active.
  return (
    <section className="settings-dense flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2
          id="settings-tab-title"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      <div
        className="flex flex-col"
        style={{ gap: 'var(--dense-spacing, 1rem)' }}
      >
        {children}
      </div>
    </section>
  )
}

export default TabShell
