# Before fix — broken-looking empty axis (WE-20260528-861)

When a user with a saved `weddingDate` but zero checklist due-dates / reminders /
timeline events opens `/?view=timeline`:

```
┌─────────────────────────────────────────────┐
│ [+ New]  [📎 Attach to chat (disabled)]      │
├─────────────────────────────────────────────┤
│   Total    Completed    Upcoming             │
│    0           0           0                 │
├─────────────────────────────────────────────┤
│ June 2026 ▶ (month header rendered)          │
│                                              │
│  ❤   ┌─────────────────────────────────────┐ │
│  │   │ Wedding Day      [365 days away]    │ │
│  │   │ Jun 14, 2026                        │ │
│  │   └─────────────────────────────────────┘ │
│  │                                           │
│  │   <-- vertical axis line, NO event chips  │
│  │                                           │
│  │                                           │
└─────────────────────────────────────────────┘
```

The user sees a vertical axis line with one "Wedding Day" marker at the top and
otherwise nothing. There is no helpful copy guiding them to add events. The
toolbar's "New" button is the only path forward but it isn't visually emphasised.

Root cause: `TimelineView.tsx:718` guarded the empty-state on
`entries.length === 0 && !weddingDate`, so the path with weddingDate set + zero
entries fell through to the main render (which assumes there are entries to
display alongside the wedding marker).
