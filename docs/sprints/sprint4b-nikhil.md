# Sprint 4b — Nikhil Bhat, Staff Full-Stack Engineer

**Date:** 2026-04-14
**Scope:** Close the two residual gaps Kenji flagged at the end of Sprint 4:

1. Backend allow-list silently dropping `about` / `responseStyle` (custom
   instructions UX-only until now).
2. Profile photo upload still a 501 placeholder (Marcus QA bug M-4).

Sign-out-everywhere was already shipped by Ravi in Sprint 4 — no work needed.

**Constraint:** Touch ONLY four files: `lib/firebaseAdmin.ts`,
`controllers/accountController.ts`, `services/accountService.ts`,
`pages/settings/tabs/AccountTab.tsx`. No new packages. No deploys. No
edits to `firestore.rules`, `storage.rules`, `firebase.json`, or `functions/`.

---

## Files changed

1. `easebot-backend/src/lib/firebaseAdmin.ts`
2. `easebot-backend/src/controllers/accountController.ts`
3. `Wedding-Ease-Viva-Chat/src/services/accountService.ts`
4. `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx`

---

## Gap 1 — Backend allow-list for custom instructions

`handleUpdateProfile` now whitelists `about` and `responseStyle` alongside the
existing identity fields. Both are validated as optional strings with a
1500-character hard cap (matches Kenji's PersonalizationTab counter). Empty
string clears the field; non-string types are rejected through the same
unknown-key path as the other validators, so a typo or wrong shape still
returns a structured 400.

This means the custom-instructions card in PersonalizationTab now actually
persists across sessions instead of being UX-only.

---

## Gap 2 — Real profile photo upload

### Pattern
Same shape ChatGPT / Claude / Gemini use: backend mints a short-lived V4
signed PUT URL pointing at the project's existing Firebase Storage bucket.
Client uploads the cropped JPEG **directly** to that URL (no auth header —
the URL itself is the capability), then PATCHes the profile with the public
download URL. The Express process never proxies binary data.

### Backend changes (`accountController.ts` + `firebaseAdmin.ts`)

**`firebaseAdmin.ts`** now also exports `adminStorageBucket` and
`adminStorageError`. The bucket name is read from `FIREBASE_STORAGE_BUCKET`
(read-only — we never create or configure the bucket). If the env var is
missing OR `getStorage(adminApp).bucket()` throws, we log a warning, set
`adminStorageBucket = null`, and stash the reason in `adminStorageError`.
**The module never throws at import time** — boot keeps working without
credentials.

**`POST /api/account/photo`** (handler exported as `handleUploadPhotoStub` to
preserve the existing route import — route file untouched per scope rule):

- Body: `{ contentType: 'image/png' | 'image/jpeg', size: number }`
- Server-side validation:
  - `contentType` against an allow-list map (never trust the client)
  - `size` is finite, positive, and ≤ 5 000 000 bytes
- Object path: `avatars/${uid}/${Date.now()}.${ext}`
- Mints a V4 signed write URL with a 10-minute TTL via
  `bucket.file(path).getSignedUrl({ version: 'v4', action: 'write', ... })`
- Returns `{ uploadUrl, path, publicUrl, expiresInMs }` where `publicUrl` is
  the standard `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?alt=media`
  download URL
- **Graceful 501** when `adminStorageBucket` is null OR the signing call fails
  with a credential-related error (`/client_email|sign|credential/i`). The
  client treats 501 as the "coming soon" soft path, so local dev without a
  service account still works.
- Never logs `uploadUrl`, `publicUrl`, or any PII.

**`DELETE /api/account/photo`** is now a real delete:

- Reads the current `photoUrl` from the user doc
- Parses the object path out of the standard download-URL format
- If the path lives under `avatars/${uid}/`, calls
  `bucket.file(path).delete({ ignoreNotFound: true })`
- Bucket failure does **not** block the Firestore clear (logged + continued)
- Clears `photoUrl` and stamps `photoUpdatedAt`, returns 200
- Idempotent: missing doc / missing object are both no-ops

**Allow-list addition:** `photoUrl` is now an accepted field in
`handleUpdateProfile`. Validation:

- Must be a string ≤ 2000 chars OR `null`/`""` (clears)
- Must start with `https://firebasestorage.googleapis.com/` — rejects data
  URIs and arbitrary external hosts
- When set, the server stamps `photoUpdatedAt = serverTimestamp()`
  automatically so the client doesn't have to send it

Both photo endpoints already share the existing 10/min/uid mutation rate
limiter via the route file (`rateLimitMutations`). No change needed.

### Frontend changes

**`accountService.ts`:**

- `ProfilePatch` extended with `photoUrl?: string | null`
- New `requestPhotoUploadUrl(contentType, size) → PhotoUploadTicket` —
  POSTs to `/api/account/photo`, returns `{ uploadUrl, path, publicUrl }`
- New `uploadPhotoToSignedUrl(uploadUrl, blob, contentType)` — bypasses the
  shared `request()` helper because (a) signed URLs are pre-authorised so we
  must NOT attach the Firebase ID token, and (b) the response body is not
  JSON. Throws `AccountServiceError` on network or non-2xx.
- New `commitPhotoUrl(publicUrl)` — thin wrapper around `patchAccountProfile`
- New `deleteAccountPhoto()` — `DELETE /api/account/photo`

**`AccountTab.tsx`:**

- `cropToSquareDataUrl` → `cropToSquare`, now returns
  `{ dataUrl, blob, contentType }` so we keep the inline preview AND have a
  real Blob to upload. Uses `canvas.toBlob('image/jpeg', 0.9)`.
- New state: `photoBlob` and `photoUploading`
- Rewrote `handleConfirmPhoto`:
  1. Guard against empty blob and double-clicks
  2. Call `requestPhotoUploadUrl('image/jpeg', blob.size)`
     - On 501 (`is501(err)`): show the legacy "coming soon" toast, clear
       state, close dialog — local dev still works
     - On other errors: rethrow into the outer catch
  3. PUT the blob via `uploadPhotoToSignedUrl(...)`
  4. PATCH the profile via `updateProfile({ photoUrl })` (uses the existing
     useAccount mutation, which already invalidates the query and refreshes
     the avatar in the card)
  5. Success toast + close dialog → preview becomes permanent via the
     refreshed profile
  6. Any failure → destructive toast + revert preview + close dialog. No
     silent swallows; every error path reaches the user.
- Confirm/cancel buttons disabled while uploading; confirm shows
  "Uploading…" label.
- Dialog description updated from the old "rolling out soon" copy.

---

## Constraints honoured

- **Files touched:** exactly the four listed above. No routes, no rules, no
  `firebase.json`, no `functions/`, no other controllers/services/types.
- **No new dependencies:** `firebase-admin` was already installed; we just
  imported `getStorage` from its existing `firebase-admin/storage` subpath.
- **No deploys:** zero `firebase deploy`, zero `gcloud`, zero anything.
- **Server never crashes without creds:** verified by booting
  `ts-node src/server.ts` with no `FIREBASE_STORAGE_BUCKET` and no
  service-account JSON — boot succeeds, warning is logged, bucket is `null`,
  the photo endpoint returns 501 with a helpful message instead of 500.
- **Server-side validation:** `contentType` and `size` are checked on the
  backend even though the client also checks. We never trust the client.
- **No PII in logs:** signed URLs and download URLs are never logged. Only
  generic error messages are written via `console.warn`.
- **Errors surface to UI:** every catch path in `handleConfirmPhoto` ends in
  a toast and a state revert.

---

## Verification

### Type-check

```
$ cd easebot-backend && npx tsc --noEmit
(0 errors)

$ cd Wedding-Ease-Viva-Chat && npx tsc --noEmit
(0 errors)
```

### Boot smoke test

**Backend** (`npx ts-node --transpile-only src/server.ts`, no env):
```
[firebaseAdmin] No FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS set...
[firebaseAdmin] FIREBASE_STORAGE_BUCKET env var is not set; photo uploads are disabled.
[easebot] Server running on http://0.0.0.0:3001
[easebot] Speech & Translation pipeline: ON
[reminderScheduler] started (5 min interval)
```
Process stays alive; SIGTERM shuts down cleanly.

**Frontend** (`npm run dev`):
```
VITE v5.4.10  ready in 180 ms
➜ Local: http://localhost:8080/
```
Both servers killed after the boot test.

### Manual reasoning trace for happy path

1. User clicks **Change photo** → file picker → JPG selected
2. `cropToSquare` returns `{ dataUrl, blob }`; preview dialog opens
3. **Use photo** → `requestPhotoUploadUrl('image/jpeg', blob.size)`
4. Backend validates `contentType` ∈ allow-list, `size ≤ 5 000 000`, mints
   V4 signed PUT URL valid for 10 minutes, returns `{ uploadUrl, publicUrl }`
5. Client `fetch(uploadUrl, { method: 'PUT', body: blob, headers: {'Content-Type': 'image/jpeg'} })`
6. Client `updateProfile({ photoUrl: ticket.publicUrl })` → server allow-list
   accepts it, validates the host prefix, stamps `photoUpdatedAt`, persists
7. `useAccount` invalidates the query → `accountProfile.photoUrl` refreshes
   → `<AvatarImage>` swaps to the new URL automatically
8. Success toast, dialog closes, blob discarded

### Failure modes covered

| Scenario | Result |
| --- | --- |
| Backend has no `FIREBASE_STORAGE_BUCKET` | 501 → frontend "coming soon" toast |
| Backend has bucket name but no service-account creds | 501 (caught by `/client_email/`) → "coming soon" toast |
| Wrong content type | 400 from server, destructive toast on client |
| File > 5 MB | 400 from server, destructive toast on client |
| Network failure mid-PUT | `AccountServiceError` → destructive toast, preview reverted |
| PATCH failure after upload | destructive toast, preview reverted (orphan object remains in bucket — accepted; cleanup is out of scope) |
| Delete photo with no current photo | 200 no-op |
| Delete photo with foreign URL | Firestore field cleared, bucket left alone |

---

## Hand-off notes

- **Production readiness:** add `FIREBASE_STORAGE_BUCKET=<bucket-name>` and
  service-account credentials (either `FIREBASE_SERVICE_ACCOUNT_JSON` or
  `GOOGLE_APPLICATION_CREDENTIALS`) to the backend env. No code change
  needed to flip from 501 → 200.
- **Storage rules:** out of scope per the sprint constraint. The download
  URLs returned by this controller will only resolve if the bucket's read
  rules permit it. Whoever owns Storage rules should confirm
  `avatars/{uid}/{file}` is readable for everyone (or at minimum, for the
  owner) — the standard pattern for avatars.
- **Orphan cleanup:** if a user re-uploads, the previous object stays in the
  bucket. A periodic GC job can sweep `avatars/${uid}/*` keeping only the
  one referenced by `photoUrl`. Out of scope for this sprint.
