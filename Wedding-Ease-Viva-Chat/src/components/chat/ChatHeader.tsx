import React, { useState } from 'react';
import {
  PanelLeft, SquarePen, Globe, Bell,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import type { UserProfile } from '@/types';
import { MODE_CONFIG, SUPPORTED_LANGUAGES, type ModeOrAuto } from './constants';
import ThemeToggle from '@/components/ui/theme-toggle';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatHeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  user: { uid: string } | null;
  profile: UserProfile | null;
  selectedMode: ModeOrAuto;
  onModeChange: (mode: ModeOrAuto) => void;
  preferredLang: string;
  onLanguageChange: (code: string) => void;
  onShowReminders: () => void;
  onShowSignIn: () => void;
  onShowSignUp: () => void;
  onSignOut: () => void;
  onShowSettings: () => void;
  // Auth modal state
  showSignInModal: boolean;
  onShowSignInModalChange: (v: boolean) => void;
  showSignUpModal: boolean;
  onShowSignUpModalChange: (v: boolean) => void;
  signUpPrefillEmail?: string;
  onSignUpPrefillEmailChange: (email: string | undefined) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar toggle buttons (shown when sidebar is closed)
// ─────────────────────────────────────────────────────────────────────────────
export const SidebarToggle: React.FC<{
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
}> = ({ isSidebarOpen, onToggleSidebar, onNewChat }) => {
  if (isSidebarOpen) return null;
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <Button onClick={onToggleSidebar} variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-foreground/10 text-foreground/70" title="Open sidebar">
        <PanelLeft className="h-4 w-4 text-foreground/60" />
      </Button>
      <Button onClick={onNewChat} variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-foreground/10 text-foreground/70" title="New Chat">
        <SquarePen className="h-4 w-4 text-foreground/60" />
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile icon — opens Settings modal (swapped from dropdown in Sprint 5)
// PM decision (responsive wave): ChatHeader no longer renders this — the
// sidebar ProfileMenu is the single source of truth. The component remains
// exported so other surfaces (non-chat headers in Index.tsx) can still use
// it while we migrate fully to sidebar-only profile access.
// ─────────────────────────────────────────────────────────────────────────────
export const ProfileIcon: React.FC<{
  user: { uid: string } | null;
  profile: UserProfile | null;
  onShowSettings: () => void;
}> = ({ user, profile, onShowSettings }) => (
  <div>
    <button
      onClick={onShowSettings}
      className="h-8 w-8 rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.1] flex items-center justify-center transition-colors"
      title="Settings"
    >
      <Avatar className="h-6 w-6">
        <AvatarImage src="" alt="Profile" />
        <AvatarFallback className="bg-primary/10 text-primary text-2xs font-semibold">
          {profile?.name ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : <User className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BetaBadge — "Beta" pill near the logo with hover (desktop) + tap (mobile)
// tooltip describing the beta program.
// ─────────────────────────────────────────────────────────────────────────────
const BETA_TOOLTIP_TEXT =
  "We're currently in beta, actively collecting feedback. Please test the product and tell us what you think!";

export const BetaBadge: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={() => setOpen(v => !v)}
          aria-label="Beta program info"
          className="flex-shrink-0 bg-primary/20 text-primary rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide hover:bg-primary/30 transition-colors cursor-pointer"
        >
          Beta
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-[260px] text-xs leading-relaxed bg-surface-tooltip border-primary/30 text-foreground/85"
      >
        {BETA_TOOLTIP_TEXT}
      </PopoverContent>
    </Popover>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MobileLanguageSelector — compact language button visible below `sm:`, mirrors
// the desktop dropdown so preferredLang state stays in sync.
// ─────────────────────────────────────────────────────────────────────────────
const MobileLanguageSelector: React.FC<{
  preferredLang: string;
  onLanguageChange: (code: string) => void;
}> = ({ preferredLang, onLanguageChange }) => (
  <div className="sm:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-full text-foreground/60 hover:bg-foreground/10 transition-colors"
          aria-label="Response language"
          title="Response language"
        >
          <Globe className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 text-soft">
        <DropdownMenuLabel className="text-3xs text-foreground/40 uppercase tracking-widest">Response Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map(({ code, label }) => (
          <DropdownMenuItem key={code} className="cursor-pointer text-label py-1" onClick={() => onLanguageChange(code)}>
            <span className="flex-1">{label}</span>
            {preferredLang === code && <span className="text-primary font-bold text-2xs">&#10003;</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ChatHeader — the top bar with mode selector, language, profile
// ─────────────────────────────────────────────────────────────────────────────
const ChatHeader: React.FC<ChatHeaderProps> = ({
  isSidebarOpen, onToggleSidebar, onNewChat,
  user,
  selectedMode, onModeChange,
  preferredLang, onLanguageChange,
  onShowReminders,
  onShowSignIn, onShowSignUp, onSignOut,
  onShowSettings,
}) => {
  // Silence unused-prop warnings for props still wired from Index.tsx.
  void selectedMode; void onModeChange; void onShowSignIn; void onShowSignUp;
  void onSignOut; void onShowSettings; void MODE_CONFIG;
  return (
    <header className="flex items-center gap-1.5 w-full px-3 sm:px-5 h-14  z-10 flex-shrink-0">
      <SidebarToggle isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} onNewChat={onNewChat} />
      <img src="/images/typo.png" alt="TheWeddingBot" className="h-7 sm:h-8 object-contain [.light_&]:brightness-0" />
      <BetaBadge />
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        {/* Mobile: compact language button. Desktop: full dropdown with label. */}
        <MobileLanguageSelector preferredLang={preferredLang} onLanguageChange={onLanguageChange} />
        <div className="hidden sm:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-foreground/60 text-xs font-medium px-2 py-1 rounded-full hover:bg-foreground/10 transition-colors">
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {SUPPORTED_LANGUAGES.find((l) => l.code === preferredLang)?.label ?? 'Lang'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-soft">
              <DropdownMenuLabel className="text-3xs text-foreground/40 uppercase tracking-widest">Response Language</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                <DropdownMenuItem key={code} className="cursor-pointer text-label py-1" onClick={() => onLanguageChange(code)}>
                  <span className="flex-1">{label}</span>
                  {preferredLang === code && <span className="text-primary font-bold text-2xs">&#10003;</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ThemeToggle size="sm" />
        {user && (
          <button className="inline-flex items-center justify-center h-10 w-10 sm:h-auto sm:w-auto sm:p-1.5 text-foreground/60 hover:text-primary transition-colors" onClick={onShowReminders}>
            <Bell className="h-4 w-4" />
          </button>
        )}
        {/* Profile icon intentionally removed — PM decision: single profile
            entry point in the sidebar (ProfileMenu, bottom-left) to match
            ChatGPT/Claude UX. Sidebar ProfileMenu wires Settings + sign-in. */}
      </div>
    </header>
  );
};

export default ChatHeader;
