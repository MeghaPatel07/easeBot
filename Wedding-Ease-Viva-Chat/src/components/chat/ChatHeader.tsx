import React from 'react';
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
import type { UserProfile } from '@/types';
import { MODE_CONFIG, SUPPORTED_LANGUAGES, type ModeOrAuto } from './constants';

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
      <Button onClick={onToggleSidebar} variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-white/10 text-white/70" title="Open sidebar">
        <PanelLeft className="h-4 w-4 text-white/60" />
      </Button>
      <Button onClick={onNewChat} variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-white/10 text-white/70" title="New Chat">
        <SquarePen className="h-4 w-4 text-white/60" />
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile icon — opens Settings modal (swapped from dropdown in Sprint 5)
// ─────────────────────────────────────────────────────────────────────────────
export const ProfileIcon: React.FC<{
  user: { uid: string } | null;
  profile: UserProfile | null;
  onShowSettings: () => void;
}> = ({ user, profile, onShowSettings }) => (
  <div>
    <button
      onClick={onShowSettings}
      className="h-8 w-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
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
// ChatHeader — the top bar with mode selector, language, profile
// ─────────────────────────────────────────────────────────────────────────────
const ChatHeader: React.FC<ChatHeaderProps> = ({
  isSidebarOpen, onToggleSidebar, onNewChat,
  user, profile,
  selectedMode, onModeChange,
  preferredLang, onLanguageChange,
  onShowReminders,
  onShowSignIn, onShowSignUp, onSignOut,
  onShowSettings,
}) => {
  return (
    <header className="flex items-center gap-1.5 w-full px-3 sm:px-5 h-14  z-10 flex-shrink-0">
      <SidebarToggle isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} onNewChat={onNewChat} />
      <img src="/images/logo.png" alt="TheWeddingBot" className="h-7 sm:h-8 object-contain" />
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <div className="hidden sm:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-white/60 text-xs font-medium px-2 py-1 rounded-full hover:bg-white/10 transition-colors">
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {SUPPORTED_LANGUAGES.find((l) => l.code === preferredLang)?.label ?? 'Lang'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-soft">
              <DropdownMenuLabel className="text-3xs text-white/40 uppercase tracking-widest">Response Language</DropdownMenuLabel>
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
        {user && (
          <button className="p-1.5 text-white/60 hover:text-primary transition-colors" onClick={onShowReminders}>
            <Bell className="h-4 w-4" />
          </button>
        )}
        <ProfileIcon
          user={user}
          profile={profile}
          onShowSettings={onShowSettings}
        />
      </div>
    </header>
  );
};

export default ChatHeader;
