# WE-20260527-251 — DOM before/after

## Before fix

```html
<!-- src/components/chat/ChatMessages.tsx line 246 (pre-fix) -->
<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6 space-y-6 noise-overlay relative">
  <!-- messages list, NO role, NO aria-live, NO aria-label -->
  <div class="flex justify-start ...">
    <div class="chat-msg-text mb-1 ...">
      <!-- TypewriterMarkdown content — no SR announcement when reply lands -->
    </div>
  </div>
</div>
```

VoiceOver / NVDA behavior: silent on new assistant reply. User must navigate
back to find new content.

## After fix

```html
<!-- src/components/chat/ChatMessages.tsx — post-fix -->
<div
  role="log"
  aria-label="Chat messages"
  aria-live="off"
  aria-relevant="additions"
  class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6 space-y-6 noise-overlay relative"
>
  <!-- Visually-hidden sidecar live region; fires ONCE per settled reply -->
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    Assistant replied: Sure! For a beachside ceremony I'd suggest …
  </div>

  <!-- existing visible messages list unchanged -->
  <div class="flex justify-start ...">
    <div class="chat-msg-text mb-1 ...">
      <!-- TypewriterMarkdown content — visible, not in a live region -->
    </div>
  </div>
</div>
```

VoiceOver / NVDA behavior:

1. `role="log"` exposes the message list as a region; SR users can land
   on it via rotor / region navigation.
2. `aria-live="off"` on the container suppresses per-character typewriter
   spam.
3. The sidecar `role="status" aria-live="polite" aria-atomic="true"` announces
   the FINAL settled assistant text exactly once per message (driven by
   `isTyping` transitioning false for the latest AI message).
4. Markdown is stripped to plain prose for a cleaner read; code blocks
   announced as "code block", images as "image".
5. `aria-live="polite"` (never `assertive`) — won't interrupt the user
   mid-sentence.

## Standards mapping

- WCAG 4.1.3 Status Messages (AA): status messages now exposed via
  `role="status"` + `aria-live="polite"` without receiving focus.
- WCAG 1.3.1 Info and Relationships (A): the message log is now identified
  semantically via `role="log"` with an accessible name.
