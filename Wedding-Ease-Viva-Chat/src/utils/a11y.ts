/**
 * Accessibility label constants for the EaseBot application.
 * Apply these to components via `aria-label` to provide screen reader support.
 */
export const A11Y_LABELS = {
  sendButton: 'Send message',
  voiceButton: 'Start voice recording',
  stopVoiceButton: 'Stop voice recording',
  newChatButton: 'Start new conversation',
  settingsButton: 'Open settings',
  sidebarToggle: 'Toggle sidebar',
  chatMessages: 'Chat messages',
  chatInput: 'Type your message',
  modeSelector: 'Select conversation mode',
} as const;

/**
 * ARIA role constants for landmark regions.
 */
export const A11Y_ROLES = {
  main: 'main' as const,
  navigation: 'navigation' as const,
  status: 'status' as const,
};

/**
 * Helper to build a props object for an aria-live region.
 * Useful for message lists so screen readers announce new messages.
 */
export function ariaLiveRegionProps(mode: 'polite' | 'assertive' = 'polite') {
  return {
    'aria-live': mode,
    'aria-relevant': 'additions text' as const,
  } as const;
}
