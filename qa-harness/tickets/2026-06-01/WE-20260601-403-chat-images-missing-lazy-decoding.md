# WE-20260601-403: Chat message images (product cards, carousel thumbs, attached images) missing loading=lazy + decoding=async

| Field | Value |
|---|---|
| **ID** | `WE-20260601-403` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `perf` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatMessages.tsx:366,470-479,527,643; src/components/ImageCarousel.tsx:129,161,217,247,290` |
| **URL / Page** | `/:userId/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-performance`|

## Description

None of the in-chat `<img>` tags carry `loading="lazy"` or `decoding="async"`:

- ChatMessages: user attached-image preview (366), AI markdown inline img (470-479), product-card list-item img (527), product-card sidecar img (643).
- ImageCarousel: main carousel image (129), thumbnail strip imgs (161), lightbox full image (217/247), variant grid thumbs (290).

In a long thread containing many generated-image messages + product-card strips, all these images are fetched and decoded eagerly the moment the thread mounts (loadChat renders the full latest-30 page at once). On a throttled mobile connection this floods the network with off-screen image requests, competes with the streaming SSE response, and the synchronous decodes add main-thread jank / contribute to CLS where dimensions are only set via Tailwind classes (no intrinsic `width`/`height` on the markdown/carousel imgs).

PR #76 (WE-20260528-895) ONLY added `loading=lazy` + dimensions to the single 48x48 VibeComposer preview image and explicitly scoped out the chat / carousel images ("file has only 1 img"). So the chat hot-path images are genuinely still unoptimized — this is a separate file set, not a dup.

## Steps to reproduce (by reading)

1. Open a thread with several AI image results + product cards.
2. All `<img>` listed above render without `loading="lazy"` → browser fetches every image immediately, including those far below the fold.

## Expected

`loading="lazy"` + `decoding="async"` on all off-screen-capable chat images (carousel thumbs, product cards, historical attached/generated images). Add intrinsic `width`/`height` (or aspect-ratio box) where layout currently relies on Tailwind-only sizing to also fix CLS.

## Actual

All chat images load eagerly; no async decode; thumbnail strips and product cards fetch every image on thread open.

## Notes

STATIC — needs live re-verify (Network waterfall + CLS on throttled mobile) when MCP restored. Specialist: fix-performance. The carousel main/lightbox image (the in-view one) may legitimately stay eager — apply lazy to thumbnails + variant grid + historical messages.

---

_Filed by `qa-performance` on `2026-06-01`._
