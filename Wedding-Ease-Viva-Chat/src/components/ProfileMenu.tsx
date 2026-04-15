// ProfileMenu — Sprint 1 of the Settings & Profile redesign (PRD §5).
//
// Renders the *content* of the avatar dropdown. Designed to be dropped
// directly inside an existing <DropdownMenuContent> in ChatHeader.tsx — it
// owns no trigger of its own. This keeps the existing avatar button + all
// auth modal callbacks intact while replacing only the menu body.
//
// Authenticated state shows: avatar, display name, email, plan badge,
// usage meter (when present), Settings, Upgrade, Help, Sign out.
// Unauthenticated state preserves the existing Sign in / Create account
// callbacks.
//
// Data comes from useAccount(), which gracefully falls back to AuthContext
// when the backend isn't ready, so this menu always renders something useful.
//
// Dark-mode aware via Tailwind tokens, keyboard accessible (DropdownMenuItem
// from Radix already handles arrow nav + roving tabindex), responsive.

import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Sparkles,
  HelpCircle,
  LogOut,
  LogIn,
  UserPlus,
  User as UserIcon,
} from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAccount } from '@/hooks/useAccount'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

export interface ProfileMenuProps {
  /** Whether a user is currently authenticated. ChatHeader already knows this. */
  isAuthenticated: boolean
  /** Existing callbacks from ChatHeader — preserved exactly. */
  onShowSignIn: () => void
  onShowSignUp: () => void
  onSignOut: () => void
  /** Optional Help callback. If omitted, the Help button navigates to /help. */
  onShowHelp?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsFor(name?: string | null): string {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function planLabel(tier: 'free' | 'pro' | 'promax' | undefined): string {
  if (tier === 'pro') return 'Pro'
  if (tier === 'promax') return 'Pro Max'
  return 'Free'
}

function planBadgeClass(tier: 'free' | 'pro' | 'promax' | undefined): string {
  if (tier === 'pro' || tier === 'promax') {
    return 'bg-primary/15 text-primary border-primary/30'
  }
  return 'bg-muted text-muted-foreground border-border'
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProfileMenu({
  isAuthenticated,
  onShowSignIn,
  onShowSignUp,
  onSignOut,
  onShowHelp,
}: ProfileMenuProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile, plan, usage } = useAccount()

  const openSettings = (tab: string) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('settings', tab)
    setSearchParams(sp, { replace: false })
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!isAuthenticated || !profile) {
    return (
      <>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Account</p>
            <p className="text-xs leading-none text-muted-foreground">
              Sign in to save your wedding plans
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer min-h-11" onClick={onShowSignIn}>
          <LogIn className="mr-2 h-4 w-4" />
          <span>Sign In</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer min-h-11" onClick={onShowSignUp}>
          <UserPlus className="mr-2 h-4 w-4" />
          <span>Create Account</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer min-h-11">
          <UserIcon className="mr-2 h-4 w-4" />
          <span>Continue as Guest</span>
        </DropdownMenuItem>
      </>
    )
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const tier = plan?.tier ?? profile.plan
  const messagesUsed = usage?.messagesUsed
  const messagesAllowed = usage?.messagesAllowed
  const showMeter =
    typeof messagesUsed === 'number' &&
    typeof messagesAllowed === 'number' &&
    messagesAllowed > 0
  const meterPct = showMeter
    ? Math.min(100, Math.round((messagesUsed! / messagesAllowed!) * 100))
    : 0

  const handleHelp = () => {
    if (onShowHelp) onShowHelp()
    else navigate('/help')
  }

  return (
    <>
      {/* ── Identity header ─────────────────────────────────────────────── */}
      <DropdownMenuLabel className="font-normal px-3 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
              {initialsFor(profile.name) || <UserIcon className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground truncate">
              {profile.name || 'Wedding planner'}
            </p>
            <p className="text-xs leading-tight text-muted-foreground truncate">
              {profile.email}
            </p>
            <span
              className={cn(
                'mt-1.5 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                planBadgeClass(tier),
              )}
            >
              {planLabel(tier)}
            </span>
          </div>
        </div>


      </DropdownMenuLabel>

      <DropdownMenuSeparator />

      {/* ── Quick actions ───────────────────────────────────────────────── */}
      <DropdownMenuItem
        className="cursor-pointer min-h-11"
        onClick={() => openSettings('account')}
      >
        <SettingsIcon className="mr-2 h-4 w-4" />
        <span>Settings</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer min-h-11"
        onClick={() => openSettings('plan-billing')}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        <span>{tier === 'free' ? 'Upgrade plan' : 'Manage plan'}</span>
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer min-h-11" onClick={handleHelp}>
        <HelpCircle className="mr-2 h-4 w-4" />
        <span>Help & feedback</span>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        className="cursor-pointer min-h-11 text-destructive focus:text-destructive"
        onClick={onSignOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        <span>Sign out</span>
      </DropdownMenuItem>
    </>
  )
}

export default ProfileMenu
