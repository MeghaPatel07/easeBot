import React from 'react';
import {
  PanelLeft, SquarePen, Globe, Bell, Keyboard,
  User, LogIn, UserPlus, LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
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
  onShowShortcuts: () => void;
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
// Profile icon + dropdown (user avatar, language, sign in/out)
// ─────────────────────────────────────────────────────────────────────────────
export const ProfileIcon: React.FC<{
  user: { uid: string } | null;
  profile: UserProfile | null;
  preferredLang: string;
  onLanguageChange: (code: string) => void;
  onShowShortcuts: () => void;
  onShowSignIn: () => void;
  onShowSignUp: () => void;
  onSignOut: () => void;
}> = ({ user, profile, preferredLang, onLanguageChange, onShowShortcuts, onShowSignIn, onShowSignUp, onSignOut }) => (
  <div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-8 w-8 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <Avatar className="h-6 w-6">
            <AvatarImage src="" alt="Profile" />
            <AvatarFallback className="bg-primary/10 text-primary text-2xs font-semibold">
              {profile?.name ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-[#3A0E20]/95 backdrop-blur-sm border border-white/10 text-white/80" align="end" forceMount>
        {profile ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{profile.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{profile.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal text-xs text-white/40 flex items-center gap-1.5 pb-1">
              <Globe className="h-3 w-3" />Response language
            </DropdownMenuLabel>
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <DropdownMenuItem key={code} className="cursor-pointer text-xs py-1.5" onClick={() => onLanguageChange(code)}>
                <span className="flex-1">{label}</span>
                {preferredLang === code && <span className="text-primary font-bold">&#10003;</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="cursor-pointer sm:hidden" onClick={onShowShortcuts}>
              <Keyboard className="mr-2 h-4 w-4" /><span>Keyboard Shortcuts</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-500 focus:text-red-500" onClick={onSignOut}>
              <LogOut className="mr-2 h-4 w-4" /><span>Sign Out</span>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Account</p>
                <p className="text-xs leading-none text-muted-foreground">Sign in to save your wedding plans</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={onShowSignIn}><LogIn className="mr-2 h-4 w-4" /><span>Sign In</span></DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={onShowSignUp}><UserPlus className="mr-2 h-4 w-4" /><span>Create Account</span></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer"><User className="mr-2 h-4 w-4" /><span>Continue as Guest</span></DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuLabel className="font-normal text-xs text-white/40 flex items-center gap-1.5 pb-1 sm:hidden">
              <Globe className="h-3 w-3" />Response Language
            </DropdownMenuLabel>
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <DropdownMenuItem key={`guest-lang-${code}`} className="cursor-pointer text-xs py-1.5 sm:hidden" onClick={() => onLanguageChange(code)}>
                <span className="flex-1">{label}</span>
                {preferredLang === code && <span className="text-primary font-bold">&#10003;</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem className="cursor-pointer sm:hidden" onClick={onShowShortcuts}>
              <Keyboard className="mr-2 h-4 w-4" /><span>Keyboard Shortcuts</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  onShowReminders, onShowShortcuts,
  onShowSignIn, onShowSignUp, onSignOut,
}) => {
  return (
    <header className="flex items-center gap-1.5 w-full px-3 sm:px-5 h-14  z-10 flex-shrink-0">
      <SidebarToggle isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} onNewChat={onNewChat} />
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <div className="hidden sm:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-white/60 text-xs font-medium px-2 py-1 rounded-full hover:bg-white/10 transition-colors">
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lang</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-[#3A0E20]/95 backdrop-blur-sm border border-white/10 shadow-lg text-white/80">
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
        <div className="hidden sm:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1.5 text-white/60 hover:text-primary transition-colors" onClick={onShowShortcuts}>
                <Keyboard className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Shortcuts (Ctrl+/)</p></TooltipContent>
          </Tooltip>
        </div>
        <ProfileIcon
          user={user}
          profile={profile}
          preferredLang={preferredLang}
          onLanguageChange={onLanguageChange}
          onShowShortcuts={onShowShortcuts}
          onShowSignIn={onShowSignIn}
          onShowSignUp={onShowSignUp}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
};

export default ChatHeader;
