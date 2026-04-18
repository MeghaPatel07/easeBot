// SettingsShell — Sprint 1 of the Settings & Profile redesign (PRD §9).
//
// Modal (shadcn Dialog) with a left nav + right content pane. Active tab is
// driven by the `?settings=<tab-id>` query param so the modal is deep-linkable
// (e.g. /?settings=plan-billing). Closing the modal removes ONLY the
// `settings` param, preserving everything else in the URL.
//
// Responsive:
//  • ≥1024px → side nav (240px) + content (flex-1)
//  • 768–1023px → top tab bar + content
//  • <768px → list-of-tabs view; selecting a tab swaps to content + back btn
//
// Accessibility: role=dialog (Radix Dialog), aria-labelledby, focus trap
// (Radix), Esc closes (Radix), Arrow keys move nav, all interactive elements
// ≥44×44px, focus rings via Tailwind tokens.
//
// Dark-mode aware: uses bg-background / text-white/90 / /
// bg-muted / text-white/90 / accent tokens — no hard-coded colours.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  User as UserIcon,
  CreditCard,
  Sparkles,
  Bot,
  // Palette,
  Bell,
  ShieldCheck,
  Info,
  ArrowLeft,
  X,
  LogOut,
  LogIn,
  type LucideIcon,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

import AccountTab from './tabs/AccountTab'
import PlanBillingTab from './tabs/PlanBillingTab'
import PersonalizationTab from './tabs/PersonalizationTab'
import AiBehaviorTab from './tabs/AiBehaviorTab'
// Appearance tab hidden — Language moved to AI Behavior.
// import AppearanceTab from './tabs/AppearanceTab'
import NotificationsTab from './tabs/NotificationsTab'
import DataPrivacyTab from './tabs/DataPrivacyTab'
import AboutTab from './tabs/AboutTab'

// ── Tab registry ─────────────────────────────────────────────────────────────

export type SettingsTabId =
  | 'account'
  | 'plan-billing'
  | 'personalization'
  | 'ai-behavior'
  | 'appearance'
  | 'notifications'
  | 'data-privacy'
  | 'about'

interface TabDef {
  id: SettingsTabId
  label: string
  icon: LucideIcon
  Component: React.ComponentType
  /** If true, this tab requires authentication and is hidden for guests. */
  authRequired?: boolean
}

const ALL_TABS: TabDef[] = [
  { id: 'account',         label: 'Account',         icon: UserIcon,    Component: AccountTab,         authRequired: true },
  { id: 'plan-billing',    label: 'Plan & Billing',  icon: CreditCard,  Component: PlanBillingTab,     authRequired: true },
  // { id: 'personalization', label: 'Personalization', icon: Sparkles,    Component: PersonalizationTab },
  { id: 'ai-behavior',     label: 'AI Behavior',     icon: Bot,         Component: AiBehaviorTab },
  // Appearance tab temporarily hidden — Language has moved to AI Behavior.
  // { id: 'appearance',      label: 'Appearance',      icon: Palette,     Component: AppearanceTab },
  // { id: 'notifications',   label: 'Notifications',   icon: Bell,        Component: NotificationsTab,   authRequired: true },
  { id: 'data-privacy',    label: 'Data & Privacy',  icon: ShieldCheck, Component: DataPrivacyTab },
  { id: 'about',           label: 'About',           icon: Info,        Component: AboutTab },
]

// All possible tab IDs for URL validation (includes auth-gated ones).
const ALL_TAB_IDS = ALL_TABS.map(t => t.id)

function isTabId(v: string | null): v is SettingsTabId {
  return !!v && (ALL_TAB_IDS as string[]).includes(v)
}

// ── Component ────────────────────────────────────────────────────────────────

interface SettingsShellProps {
  onShowSignIn?: () => void
  onShowSignUp?: () => void
}

export function SettingsShell({ onShowSignIn, onShowSignUp }: SettingsShellProps) {
  const { user, signOut } = useAuth()
  const TABS = useMemo(
    () => ALL_TABS.filter(t => !t.authRequired || !!user),
    [user],
  )
  const TAB_IDS = useMemo(() => TABS.map(t => t.id), [TABS])
  const defaultTab = TABS[0]?.id ?? 'ai-behavior'

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('settings')
  const open = isTabId(tabParam)
  // If the requested tab isn't visible (e.g. guest trying to open 'account'), fall back
  const activeTab: SettingsTabId = open && TAB_IDS.includes(tabParam as SettingsTabId)
    ? (tabParam as SettingsTabId)
    : defaultTab

  // Mobile (<768px) sub-state: when a tab is selected from the list view we
  // show the content; the back button returns to the list. Driven locally so
  // the URL doesn't churn on every back/forward.
  const [mobileShowingContent, setMobileShowingContent] = useState(false)
  useEffect(() => {
    if (!open) {
      // Reset when modal closes so next open starts at the list view.
      setMobileShowingContent(false)
      return
    }
    // On mobile, don't auto-show content — let the user pick a tab from the
    // list first. The MobileTabList onSelect handler sets mobileShowingContent
    // directly. On tablet/desktop, always show the content pane immediately.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (!isMobile) {
      setMobileShowingContent(true)
    }
  }, [open, activeTab])

  // ── URL helpers ────────────────────────────────────────────────────────────

  const setTab = useCallback(
    (next: SettingsTabId) => {
      const sp = new URLSearchParams(searchParams)
      sp.set('settings', next)
      setSearchParams(sp, { replace: false })
    },
    [searchParams, setSearchParams],
  )

  const closeModal = useCallback(() => {
    const sp = new URLSearchParams(searchParams)
    sp.delete('settings')
    setSearchParams(sp, { replace: false })
  }, [searchParams, setSearchParams])

  // ── Keyboard nav across the side nav ───────────────────────────────────────

  const navRef = useRef<HTMLDivElement>(null)
  const tabletBarRef = useRef<HTMLDivElement>(null)
  const mobileListRef = useRef<HTMLUListElement>(null)

  const moveFocusTo = (container: HTMLElement | null, tabId: SettingsTabId) => {
    requestAnimationFrame(() => {
      const btn = container?.querySelector<HTMLButtonElement>(
        `button[data-tab-id="${tabId}"]`,
      )
      btn?.focus()
    })
  }

  const onNavKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const idx = TAB_IDS.indexOf(activeTab)
    let nextIdx = idx
    if (e.key === 'ArrowDown') nextIdx = (idx + 1) % TAB_IDS.length
    if (e.key === 'ArrowUp') nextIdx = (idx - 1 + TAB_IDS.length) % TAB_IDS.length
    if (e.key === 'Home') nextIdx = 0
    if (e.key === 'End') nextIdx = TAB_IDS.length - 1
    setTab(TAB_IDS[nextIdx])
    moveFocusTo(navRef.current, TAB_IDS[nextIdx])
  }

  // Sprint 4 (Hana, Marcus QA N-9): roving tabindex + arrow-key nav on the
  // tablet horizontal tab bar AND the mobile vertical list. Tablet uses
  // ArrowLeft/Right (horizontal); mobile uses ArrowUp/Down (vertical list).
  const onHorizontalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const idx = TAB_IDS.indexOf(activeTab)
    let nextIdx = idx
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TAB_IDS.length
    if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TAB_IDS.length) % TAB_IDS.length
    if (e.key === 'Home') nextIdx = 0
    if (e.key === 'End') nextIdx = TAB_IDS.length - 1
    setTab(TAB_IDS[nextIdx])
    moveFocusTo(tabletBarRef.current, TAB_IDS[nextIdx])
  }

  const onMobileListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const idx = TAB_IDS.indexOf(activeTab)
    let nextIdx = idx
    if (e.key === 'ArrowDown') nextIdx = (idx + 1) % TAB_IDS.length
    if (e.key === 'ArrowUp') nextIdx = (idx - 1 + TAB_IDS.length) % TAB_IDS.length
    if (e.key === 'Home') nextIdx = 0
    if (e.key === 'End') nextIdx = TAB_IDS.length - 1
    setTab(TAB_IDS[nextIdx])
    moveFocusTo(mobileListRef.current, TAB_IDS[nextIdx])
  }

  const ActiveComponent = useMemo(
    () => TABS.find(t => t.id === activeTab)?.Component ?? TABS[0]?.Component ?? AboutTab,
    [activeTab, TABS],
  )
  const activeLabel = useMemo(
    () => TABS.find(t => t.id === activeTab)?.label ?? 'Settings',
    [activeTab, TABS],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal()
      }}
    >
      <DialogContent
        // Override the default sm:max-w-lg constraint with a wider settings shell.
        // Hide the shadcn DialogContent default close button (a direct-child <button>
        // rendered by DialogPrimitive.Close) so only our contextual X in each
        // responsive pane header is visible — avoids duplicate X icons.
        className={cn(
          'w-[100vw] h-[100dvh] max-w-none translate-x-0 translate-y-0 left-0 top-0 rounded-none p-0 border-0',
          'sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:w-[95vw] sm:max-w-[960px] sm:h-[85dvh] sm:rounded-2xl sm:border sm:border-white/[0.08]',
          'bg-[#0F0D0C]/90 backdrop-blur-2xl text-white/90 flex flex-col overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)]',
          '[&>button.absolute]:hidden',
        )}
        aria-labelledby="settings-shell-title"
        aria-describedby="settings-shell-desc"
      >
        {/* Visually hidden title/desc for screen readers; visual title lives in the panes. */}
        <DialogTitle id="settings-shell-title" className="sr-only">
          Settings
        </DialogTitle>
        <DialogDescription id="settings-shell-desc" className="sr-only">
          Manage your account, plan, personalization, and preferences.
        </DialogDescription>

        {/* Decorative blurs — matching sign-in/sign-up modals */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        {/* ── Desktop ≥1024px: side nav + content ─────────────────────────── */}
        <div className="hidden lg:flex flex-1 min-h-0">
          <DesktopSideNav
            ref={navRef}
            tabs={TABS}
            activeTab={activeTab}
            onSelect={setTab}
            onKeyDown={onNavKeyDown}
            onClose={closeModal}
            user={user}
            onShowSignIn={onShowSignIn}
            onShowSignUp={onShowSignUp}
            onSignOut={signOut}
          />
          <div className="flex-1 min-w-0 overflow-y-auto p-8 bg-transparent">
            <ActiveComponent />
          </div>
        </div>

        {/* ── Tablet 768–1023px: top tab bar + content ─────────────────────── */}
        <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0">
          <TopTabBar
            ref={tabletBarRef}
            tabs={TABS}
            activeTab={activeTab}
            onSelect={setTab}
            onKeyDown={onHorizontalKeyDown}
            onClose={closeModal}
            user={user}
            onShowSignIn={onShowSignIn}
            onShowSignUp={onShowSignUp}
            onSignOut={signOut}
          />
          <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-transparent">
            <ActiveComponent />
          </div>
        </div>

        {/* ── Mobile <768px: list view ↔ content view ──────────────────────── */}
        <div className="flex md:hidden flex-col flex-1 min-h-0">
          {!mobileShowingContent ? (
            <MobileTabList
              ref={mobileListRef}
              tabs={TABS}
              activeTab={activeTab}
              onSelect={(id) => {
                setTab(id)
                setMobileShowingContent(true)
              }}
              onKeyDown={onMobileListKeyDown}
              onClose={closeModal}
              user={user}
              onShowSignIn={onShowSignIn}
              onShowSignUp={onShowSignUp}
              onSignOut={signOut}
            />
          ) : (
            <>
              <MobileContentHeader
                title={activeLabel}
                onBack={() => setMobileShowingContent(false)}
                onClose={closeModal}
              />
              <div className="flex-1 overflow-y-auto p-4 bg-transparent">
                <ActiveComponent />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Desktop side nav ─────────────────────────────────────────────────────────

interface DesktopSideNavProps {
  tabs: TabDef[]
  activeTab: SettingsTabId
  onSelect: (id: SettingsTabId) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClose: () => void
  user: any
  onShowSignIn?: () => void
  onShowSignUp?: () => void
  onSignOut: () => void
}

const DesktopSideNav = React.forwardRef<HTMLDivElement, DesktopSideNavProps>(
  function DesktopSideNav({ tabs, activeTab, onSelect, onKeyDown, onClose, user, onShowSignIn, onShowSignUp, onSignOut }, ref) {
    return (
      <aside
        className="w-[220px] shrink-0 m-3 flex flex-col rounded-2xl backdrop-blur-2xl bg-white/[0.04] overflow-hidden font-body"
        aria-label="Settings sections"
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
          <h1 className="text-sm font-medium tracking-tight text-white/70 px-2">
            Settings
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <nav
          ref={ref}
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="flex-1 overflow-y-auto custom-scrollbar px-3 pt-2 pb-3 flex flex-col gap-0.5"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-panel-${id}`}
                tabIndex={active ? 0 : -1}
                data-tab-id={id}
                onClick={() => onSelect(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-xs text-left',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40',
                  active
                    ? 'bg-white/[0.1] text-[#A17A63] font-medium'
                    : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]',
                )}
              >
                <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-[#A17A63]' : 'text-white/35')} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Auth footer */}
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.06]">
          {user ? (
            <button
              type="button"
              onClick={() => { onSignOut(); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Log out</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { onClose(); onShowSignIn?.() }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-primary hover:bg-primary/[0.08] transition-all font-medium"
              >
                <LogIn className="h-4 w-4 flex-shrink-0" />
                <span>Sign in</span>
              </button>
              <span className="text-white/20 text-xs">|</span>
              <button
                type="button"
                onClick={() => { onClose(); onShowSignUp?.() }}
                className="flex-1 flex items-center justify-center px-3 py-2 rounded-xl text-xs text-white/45 hover:text-white/70 hover:bg-white/[0.04] transition-all"
              >
                <span>Sign up</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    )
  },
)

// ── Tablet top tab bar ───────────────────────────────────────────────────────

interface TopTabBarProps {
  tabs: TabDef[]
  activeTab: SettingsTabId
  onSelect: (id: SettingsTabId) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClose: () => void
  user: any
  onShowSignIn?: () => void
  onShowSignUp?: () => void
  onSignOut: () => void
}

const TopTabBar = React.forwardRef<HTMLDivElement, TopTabBarProps>(
  function TopTabBar({ tabs, activeTab, onSelect, onKeyDown, onClose, user, onShowSignIn, onShowSignUp, onSignOut }, ref) {
    return (
      <div className="flex flex-col m-3 rounded-2xl backdrop-blur-2xl bg-white/[0.04] overflow-hidden font-body">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-sm font-medium tracking-tight text-white/70">
            Settings
          </h1>
          <div className="flex items-center gap-2">
            {user ? (
              <button
                type="button"
                onClick={() => { onSignOut(); onClose() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onClose(); onShowSignIn?.() }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-primary font-medium hover:bg-primary/[0.08] transition-all"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); onShowSignUp?.() }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all"
                >
                  Sign up
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div
          ref={ref}
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="flex gap-0.5 overflow-x-auto custom-scrollbar px-3 pb-3"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`settings-panel-${id}`}
                tabIndex={active ? 0 : -1}
                data-tab-id={id}
                onClick={() => onSelect(id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40',
                  active
                    ? 'bg-white/[0.1] text-[#A17A63] font-medium'
                    : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-[#A17A63]' : 'text-white/35')} aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  },
)

// ── Mobile list view ─────────────────────────────────────────────────────────

interface MobileTabListProps {
  tabs: TabDef[]
  activeTab: SettingsTabId
  onSelect: (id: SettingsTabId) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClose: () => void
  user: any
  onShowSignIn?: () => void
  onShowSignUp?: () => void
  onSignOut: () => void
}

const MobileTabList = React.forwardRef<HTMLUListElement, MobileTabListProps>(
  function MobileTabList({ tabs, activeTab, onSelect, onKeyDown, onClose, user, onShowSignIn, onShowSignUp, onSignOut }, ref) {
    return (
      <div className="flex flex-col flex-1 min-h-0 m-3 rounded-2xl backdrop-blur-2xl bg-white/[0.04] overflow-hidden font-body">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <h1 className="text-sm font-medium tracking-tight text-white/70">
            Settings
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul
          ref={ref}
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="flex-1 overflow-y-auto custom-scrollbar px-3 pt-2 pb-3 flex flex-col gap-0.5"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab
            return (
              <li key={id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`settings-panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  data-tab-id={id}
                  onClick={() => onSelect(id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-xs text-left',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A17A63]/40',
                    active
                      ? 'bg-white/[0.1] text-[#A17A63] font-medium'
                      : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]',
                  )}
                >
                  <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-[#A17A63]' : 'text-white/35')} aria-hidden="true" />
                  <span className="flex-1 truncate">{label}</span>
                  <span aria-hidden="true" className="text-white/30">›</span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* Auth footer */}
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.06]">
          {user ? (
            <button
              type="button"
              onClick={() => { onSignOut(); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Log out</span>
            </button>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { onClose(); onShowSignIn?.() }}
                className="flex-1 py-2.5 rounded-full text-xs text-primary font-medium border border-primary/20 hover:bg-primary/[0.08] transition-all"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onShowSignUp?.() }}
                className="flex-1 py-2.5 rounded-full text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>
    )
  },
)

function MobileContentHeader({
  title,
  onBack,
  onClose,
}: {
  title: string
  onBack: () => void
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 pt-3 pb-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to settings list"
        className="h-11 w-11 inline-flex items-center justify-center rounded-md text-white/90 hover:text-white/90 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h2 className="flex-1 text-base font-semibold text-white/90 truncate">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        className="h-11 w-11 inline-flex items-center justify-center rounded-md text-white/90 hover:text-white/90 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default SettingsShell
