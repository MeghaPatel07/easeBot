# After fix — empty state with helpful copy + CTAs (WE-20260528-861)

Same user, same scenario (saved weddingDate, zero entries), now sees:

```
┌─────────────────────────────────────────────┐
│ [+ New]  [📎 Attach to chat (disabled)]      │
├─────────────────────────────────────────────┤
│                                              │
│                                              │
│                  ╭─────╮                     │
│                  │  ❤  │  (Heart icon)       │
│                  ╰─────╯                     │
│                                              │
│       Your wedding is on Jun 14, 2026        │
│                                              │
│    Add events or due dates to see them on    │
│              this timeline.                  │
│                                              │
│    ┌─────────────┐ ┌──────────────────┐     │
│    │ + Add event │ │ ✓ Go to checklists│    │
│    └─────────────┘ └──────────────────┘     │
│                                              │
└─────────────────────────────────────────────┘
```

- "Add an event" reuses the existing `handleOpenDialog` (the same dialog the
  toolbar's "New" button opens), letting the user pick Event or Task.
- "Go to checklists" navigates to `/${userId}/planner` where they can attach due
  dates to checklist items (which then appear on the timeline).

For users who haven't set a wedding date yet, the original "No timeline items
yet" copy is preserved unchanged (no regression).
