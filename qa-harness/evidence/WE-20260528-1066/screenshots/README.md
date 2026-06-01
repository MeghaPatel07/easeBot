# Screenshot evidence — WE-20260528-1066

## Dev server status at fix time
At the time of the fix run (2026-05-29), no dev server was listening on
`http://localhost:8081/` or `http://localhost:5173/`. Visual reduce-motion
emulation via Chrome DevTools MCP could not be captured live.

## Static verification (sufficient because change is className-only)

### 1. All animation classes are gated behind `motion-safe:`
```
$ grep -nE "animate-pulse|animate-\[shimmer|animate-\[progress|animate-in" \
    src/components/chat/ChatMessages.tsx \
    src/components/ImageCarousel.tsx \
    src/components/GalleryView.tsx

src/components/GalleryView.tsx:193: motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200
src/components/ImageCarousel.tsx:78: motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200
src/components/ImageCarousel.tsx:216: motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500
src/components/ImageCarousel.tsx:244: motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500
src/components/chat/ChatMessages.tsx:270: motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200
src/components/chat/ChatMessages.tsx:578: motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300
src/components/chat/ChatMessages.tsx:589: motion-safe:animate-pulse
src/components/chat/ChatMessages.tsx:596: motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]
src/components/chat/ChatMessages.tsx:599: motion-safe:animate-pulse
src/components/chat/ChatMessages.tsx:606: motion-safe:animate-[progress_3s_ease-in-out_infinite]
src/components/chat/ChatMessages.tsx:963: motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]
src/components/chat/ChatMessages.tsx:966: motion-safe:animate-pulse
src/components/chat/ChatMessages.tsx:973: motion-safe:animate-[progress_3s_ease-in-out_infinite]
```

### 2. Tailwind `motion-safe:` semantics
Tailwind v3+ compiles `motion-safe:<utility>` into:
```css
@media (prefers-reduced-motion: no-preference) {
  .motion-safe\:animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
}
```
When `prefers-reduced-motion: reduce` is set, the media query does NOT match, so
the animation rule never applies — the element is fully inert, not "single
iteration through the global reset." Vestibular-disorder users are no longer
exposed to one 1.8s shimmer cycle.

### 3. Type check — no new errors
Pre-existing errors on `Bug-Resolve-claude` base branch:
- `ChatMessages.tsx(748,49): Property 'calendarAdded' does not exist on type 'Message'`
- `ChatMessages.tsx(769,50): Property 'calendarAdded' does not exist on type 'Message'`
(both unrelated to animations; same before and after fix)

No new tsc errors introduced by the className edits.

## Suggested manual smoke (for Krish review)
1. Start dev: `cd Wedding-Ease-Viva-Chat && npm run dev`
2. Open DevTools (Cmd+Opt+I) → Rendering tab.
3. Set "Emulate CSS media feature prefers-reduced-motion" to `reduce`.
4. Trigger an image generation in chat. Observe the skeleton:
   - Before fix: shimmer bar travels across once over 1.8s (visible motion).
   - After fix: skeleton is fully static (no shimmer, no pulse, no progress bar fill).
5. Open an image in the carousel/gallery preview. Before: 200ms fade-in.
   After: instant appearance.
