import { useEffect, useCallback } from 'react';

export interface KeyboardShortcutHandlers {
  /** Called on Ctrl+N / Cmd+N to start a new chat */
  onNewChat?: () => void;
  /** Called on Ctrl+/ to focus the search input */
  onFocusSearch?: () => void;
  /** Called on Escape to close sidebar or modals */
  onEscape?: () => void;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Shortcuts:
 * - `Ctrl+N` / `Cmd+N` — New chat
 * - `Ctrl+/` — Focus search
 * - `Escape` — Close sidebar on mobile / close modals
 *
 * All listeners are cleaned up automatically on unmount.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isModifier = event.ctrlKey || event.metaKey;

      // Ctrl+N / Cmd+N  — New chat
      if (isModifier && event.key === 'n') {
        event.preventDefault();
        handlers.onNewChat?.();
        return;
      }

      // Ctrl+/  — Focus search
      if (isModifier && event.key === '/') {
        event.preventDefault();
        handlers.onFocusSearch?.();
        return;
      }

      // Escape  — Close sidebar / modals
      if (event.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }
    },
    [handlers],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
