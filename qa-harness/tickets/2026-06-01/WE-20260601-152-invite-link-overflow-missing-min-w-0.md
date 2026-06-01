# WE-20260601-152: Invite-link row overflows horizontally on mobile — `flex-1` `<code>` missing `min-w-0`, `truncate` defeated

| Field | Value |
|---|---|
| **ID** | `WE-20260601-152` |
| **Created** | `2026-06-01T12:40:00Z` |
| **Reporter** | `qa-visual-responsive` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/InvitePartner.tsx:240-243` |
| **URL / Page** | `Sidebar → Collaborate` (rendered via Index.tsx:1349 `mainAreaShell('Collaborate', <InvitePartner/>)`) |
| **Breakpoint** | `mobile` (375px) — also tablet in narrow panes |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

After sending a partner invite, the generated link is shown in a copy row:

```jsx
<div className="flex items-center gap-2">              // :240  — no min-w-0
  <code className="flex-1 ... truncate">               // :241  — flex-1 but NO min-w-0
    {lastInviteLink}                                    // :242
  </code>
  <button>Copy Link</button>                            // :244
</div>
```

`lastInviteLink` is built at `:138` as
`${window.location.origin}/invite?from=${userId}` — origin (`https://easebot-production.up.railway.app`) + `/invite?from=` + a 28-char Firebase UID ≈ 70-85 unbreakable characters with no spaces.

Flex items default to `min-width: auto`, which means a `flex-1` child will NOT shrink below the intrinsic width of its content. Because the URL is a single unbreakable token, the `<code>` refuses to shrink, `truncate` (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) never gets a narrower box to clip against, and the whole row is forced as wide as the URL. The fix is the canonical `min-w-0` on the flex child (and ideally the parent).

## Steps to reproduce (by reading)

1. Go to `InvitePartner.tsx:240-243`.
2. Note the `flex` parent has no `min-w-0`; the `flex-1 truncate` `<code>` child has no `min-w-0`.
3. The content (`:138`) is a long, space-free URL.
4. CSS rule: `truncate` cannot clip a `flex-1` item whose `min-width` is still `auto` — the item grows to fit the URL and pushes the row past the container width.

## Expected

The invite-link `<code>` truncates with an ellipsis and stays within the Collaborate pane; "Copy Link" button stays on-row; no horizontal scroll at 375px.

## Actual

`<code>` expands to the full ~80-char URL width, overflowing the narrow Collaborate pane on mobile → horizontal scroll / clipped Copy button.

## Evidence

- `InvitePartner.tsx:240` parent `flex items-center gap-2` — no `min-w-0`.
- `InvitePartner.tsx:241` `<code className="flex-1 ... truncate">` — `flex-1` without `min-w-0`.
- `InvitePartner.tsx:138` link template confirms long unbreakable content.
- Rendered narrow via `Index.tsx:1349` mainAreaShell on mobile.

## Notes

STATIC — needs live re-verify when MCP+backend restored (open Collaborate at 375px after sending an invite; confirm row overflow).
Fix (fix-frontend): add `min-w-0` to the `<code>` (and `min-w-0` on the `flex` parent for belt-and-suspenders). One-line change.

---

_Filed by `qa-visual-responsive` on `2026-06-01T12:40:00Z`._
