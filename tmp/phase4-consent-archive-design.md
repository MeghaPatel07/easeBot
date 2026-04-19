# Phase 4 — Consent-Gated Audio Archive + Custom Speech Retraining Loop

## Executive Summary

Phase 4 introduces a **consent-gated audio archive** for TheWeddingBot that feeds a monthly Azure Custom Speech retraining loop, closing the gap between per-request STT (Phase 1–3) and a self-improving domain-tuned model. The design adds three fields under `users/{uid}.preferences` (`voiceDataConsent`, `voiceConsentAcceptedAt`, `voiceConsentRevokedAt`), defaulting to `'none'` for GDPR/DPDPA compliance. Opt-in is surfaced in two places: the Data & Privacy settings tab (already-existing `DataPrivacyTab.tsx` shell) and a one-time inline prompt on first voice use. A separate toggle distinguishes "retain audio for my own review" from "use to improve the model". Audio lands in Azure Blob Storage (`stweddingbotaudio{env}`) under a date-partitioned per-uid path, with a JSON sidecar containing only non-PII telemetry (locale, confidence, consent level, edited transcript). Hot → Cool → Archive tiers gate cost; a monthly Azure ML pipeline stratified-samples low-confidence + user-corrected clips, runs HITL labeling in Azure ML Data Labeling, and promotes a new Custom Speech baseline only when WER beats prod by ≥1.5 pp. Revocation and account deletion trigger a queue-backed Azure Function that purges all `{uid}` blobs within the 30-day DPDPA SLA. **All Firestore reads/writes go through the existing backend with `adminDb` privileges — no Firebase rule changes required.**

## Firebase Rule Changes Required

**None, by design.** Every Firestore access added by this phase is server-side via the existing `adminDb` (Firebase Admin SDK) — the same privilege envelope used by `accountController.ts` today (see `handleUpdatePreferences`, which already writes `preferences.dataTrainingOptOut` without any client-side rule dependency). The new `preferences.voiceDataConsent` field slots into the identical allow-list pattern in `handleUpdatePreferences` and requires no `firestore.rules` edit, no Storage rule edit, and no client-direct Firestore write. Azure Blob Storage is a separate cloud (not Firebase Storage) — no rules surface exists there at all. The only places a rule change *could* be triggered are explicitly avoided: (a) we do not add a Firestore subcollection under `users/{uid}/voiceRecordings` readable by the client; (b) we do not expose a callable Cloud Function; (c) revocation/deletion are driven server-side. If a future sub-phase wants client-direct reads of an audit log, that would be a separate rules-approval ticket — flagged here so scope stays clean.

---

## 0. Scope & Guardrails

- **Product name**: TheWeddingBot (legacy "EaseBot"/"WeddingEase" strings remain in code; no rename in scope).
- **Out of scope**: Firebase Security Rules, Firebase Storage, Firebase project config, client-direct Firestore writes of consent. All consent mutations go through `PATCH /api/account/preferences` (existing endpoint).
- **In scope**: Firestore schema addition (via backend-only writes), Azure Blob layout, metadata sidecar format, retraining pipeline, deletion workflow, cost model.
- **Non-goals**: actual UI implementation, pipeline code, new Custom Speech project provisioning. This is a design document.

## 1. Consent Data Model

### 1.1 Firestore additions (under `users/{uid}`)

```
preferences: {
  // ... existing fields (theme, density, language, notifications,
  //     dataTrainingOptOut — from sprint1-rohan.md) ...

  // NEW — Phase 4
  voiceDataConsent: 'none' | 'retention' | 'retention_and_training',
  voiceConsentAcceptedAt: Timestamp | null,   // set when user moves off 'none'
  voiceConsentRevokedAt: Timestamp | null,    // set when user returns to 'none'
  voiceConsentVersion: number,                // consent copy version (see §2.2)
  voiceConsentLocale: string,                 // BCP-47 of the copy user saw
  voiceConsentAgeAttested: boolean            // see §2.4 minors
}
```

**Semantics**:
- `'none'` (**default**) — audio is transcribed in-flight and discarded; no blob write. Existing Phase 1-3 behavior.
- `'retention'` — audio + sidecar archived for the user's own review/export, and for aggregate quality telemetry, but **never** fed into model training. Cool-tier by default.
- `'retention_and_training'` — superset: audio eligible for sampling into the monthly retraining run.

**Default posture**: opt-in only. New accounts land on `'none'`. This matches the existing `dataTrainingOptOut: false` default (note: that field is opt-*out*; `voiceDataConsent` is explicitly opt-*in* because audio is biometric-adjacent and warrants a stricter default under DPDPA §7 and GDPR Art. 9).

**Effective date**: `voiceConsentAcceptedAt` is written server-side via `FieldValue.serverTimestamp()` on any transition away from `'none'`. Every subsequent transition updates it (and writes the old value into a bounded audit log — see §1.3).

**Revocation flow**:
1. Client → `PATCH /api/account/preferences` with `{ voiceDataConsent: 'none' }`.
2. Server validates, writes Firestore, enqueues a Storage Queue message: `{ uid, revokedAt, reason: 'user-revoked' }`.
3. Azure Function (`purgeUserAudio`) consumes the queue with visibility-timeout semantics; deletes all `recordings/**/{uid}/**` blobs in every container.
4. Purge SLA: **30 days** (DPDPA §11). Target p50: <1 hour; p99: <24 hours.

### 1.2 Backend additions to `handleUpdatePreferences` (accountController.ts)

The existing allow-list pattern gets three new branches — same shape as `dataTrainingOptOut`:

```ts
const ALLOWED_VOICE_CONSENT = new Set(['none','retention','retention_and_training'])
if ('voiceDataConsent' in body) { ... validate ... prefUpdate['preferences.voiceDataConsent'] = v }
// server-side also sets voiceConsentAcceptedAt / RevokedAt + version + locale
// server-side enqueues purge on transition to 'none'
```

No client code touches `voiceConsentAcceptedAt` directly — server owns the timestamp. This guarantees tamper-resistance without a Firestore rule.

### 1.3 Audit log

A bounded append-only subcollection `users/{uid}/consentAuditLog/{autoId}` captures each transition (`from`, `to`, `at`, `ip`, `userAgentHash`, `consentVersion`). Retained 7 years. Written server-side only. **No rules change** — mirrors the `users/{uid}/subscription/current` pattern already in place.

## 2. Consent UI Flow (Design Only — No Implementation Now)

### 2.1 Placement

1. **Settings → Data & Privacy tab** — primary surface. `DataPrivacyTab.tsx` currently has a commented-out "Improve the model" card; re-enable it, replace binary switch with a three-option radio group: `Off / Save my voice clips / Save clips and help improve the voice model`. Plus a hint link "What does this mean?" → privacy modal.
2. **First voice use prompt** — when the user holds the mic for the first time *after* this phase ships and their `voiceDataConsent === 'none'` AND `voiceConsentAcceptedAt === null` (i.e. never been asked), show a non-blocking sheet: "Your voice helps us improve our understanding of Indian English, Hindi, and Gujarati. Contribute?" with three buttons: "Not now", "Save only", "Save + improve". "Not now" flips a `voiceConsentPromptDismissedAt` timestamp; we wait 30 days before asking again.
3. **Bi-annual re-prompt** — if consent is older than 12 months, surface a quiet banner in settings. Does not block usage.

### 2.2 Copy (three locales, `voiceConsentVersion: 1`)

**English**

> **Help TheWeddingBot hear you better**
> Indian weddings mix English, Hindi, and Gujarati — often in the same sentence. We're training a wedding-specific voice model, and your voice recordings help a lot.
>
> - **Save my voice clips** — we keep your recordings so you can review or export them, but they aren't used to train anything.
> - **Save and help improve the model** — your clips may be sampled (anonymously) into our monthly training pool.
>
> You can change this anytime in Settings → Data & Privacy. Turning it off deletes all saved clips within 30 days.

**Hindi**

> **TheWeddingBot को आपकी आवाज़ बेहतर समझने में मदद करें**
> भारतीय शादियों में अंग्रेज़ी, हिंदी और गुजराती अक्सर एक ही वाक्य में मिल जाती हैं। हम एक शादी-विशिष्ट वॉइस मॉडल ट्रेन कर रहे हैं — आपकी आवाज़ की रिकॉर्डिंग्स बहुत मदद करती हैं।
>
> - **मेरी वॉइस क्लिप्स सेव करें** — आप बाद में देख या डाउनलोड कर सकते हैं, पर किसी ट्रेनिंग में इस्तेमाल नहीं होंगी।
> - **सेव करें और मॉडल सुधारने में मदद करें** — आपकी क्लिप्स हमारे मासिक ट्रेनिंग पूल में (बिना नाम के) सैंपल हो सकती हैं।
>
> आप इसे कभी भी Settings → Data & Privacy में बदल सकते हैं। बंद करने पर सभी सेव की गई क्लिप्स 30 दिनों में डिलीट हो जाएँगी।

**Gujarati**

> **TheWeddingBot ને તમારો અવાજ વધુ સારો સમજવામાં મદદ કરો**
> ભારતીય લગ્નમાં અંગ્રેજી, હિંદી અને ગુજરાતી ઘણીવાર એક જ વાક્યમાં મિક્સ થાય છે. અમે લગ્ન-વિશિષ્ટ વૉઇસ મોડલ ટ્રેન કરી રહ્યા છીએ — તમારી અવાજની રેકોર્ડિંગ્સ ખૂબ મદદ કરે છે.
>
> - **મારી વૉઇસ ક્લિપ્સ સેવ કરો** — તમે પછી જોઈ કે ડાઉનલોડ કરી શકો છો, પણ કોઈ ટ્રેનિંગમાં ઉપયોગ નહીં થાય.
> - **સેવ કરો અને મોડલ સુધારવામાં મદદ કરો** — તમારી ક્લિપ્સ અમારા માસિક ટ્રેનિંગ પૂલમાં (નામ વિના) સૅમ્પલ થઈ શકે છે.
>
> તમે કોઈપણ સમયે Settings → Data & Privacy માં બદલી શકો છો. બંધ કરવાથી સેવ કરેલી બધી ક્લિપ્સ 30 દિવસમાં ડિલીટ થઈ જશે.

Copy is sourced from a server-served JSON at `/api/consent/copy/v1` (keyed by `voiceConsentVersion`, freezable for legal review). Frozen version is what's recorded on the user doc — so revisiting consent history can reproduce the exact prompt they saw.

### 2.3 Granularity

Two-axis toggle, but presented as three radio options (prevents the nonsensical "train-but-don't-retain" combo). Backend still stores as an enum so the UI can swap to checkboxes later without a migration.

### 2.4 Age / minors

Indian weddings often involve under-21 participants answering questions. Under DPDPA §9, processing a minor's personal data requires verifiable parental consent. Two mitigations:

1. **Age attestation at consent time**: the prompt includes a checkbox "I am 18 or older, OR I have permission from a parent/guardian". Blocks opt-in otherwise. Stored as `voiceConsentAgeAttested: boolean`.
2. **Collateral-voice guard**: in the metadata sidecar we record `speakerIsAccountHolder: boolean | 'unknown'`. For now default to `'unknown'` since we can't verify; future phase could add speaker diarization. Training pipeline filters to `speakerIsAccountHolder !== false` — i.e. conservative. No training on clips flagged as a non-account-holder voice.

## 3. Blob Storage Layout

### 3.1 Storage account

- **Name**: `stweddingbotaudio{env}` where `{env} ∈ {dev, staging, prod}`. Hard 24-char limit under the Azure naming rule; `stweddingbotaudiostaging` is 24 — exactly at the cap. If we need longer, fall back to `stwbaudio{env}`.
- **Region**: `centralindia` (same as existing Azure Speech region for latency + data residency under DPDPA).
- **Redundancy**: LRS for dev/staging, GRS for prod (cost vs. durability; wedding audio is not mission-critical so GRS is not ZRS).
- **Soft-delete**: blob soft-delete **off** for the recordings container (we need hard deletes to honor revocation). Container soft-delete off. Versioning off.
- **Encryption**: MS-managed keys initially; note here we plan to move to CMK in a follow-up phase.

### 3.2 Container strategy — single container with metadata

**Decision**: one container (`recordings`), consent level stored as **blob metadata** AND duplicated in the sidecar JSON. Reasons:

- Separate containers per consent level require re-copy on consent change (expensive, breaks immutability audit).
- Training sampler filters by metadata tag `consentLevel=retention_and_training` (Azure Blob Index Tags, not just metadata, so the Azure ML pipeline can do a server-side filter with `@container='recordings' AND consentLevel='retention_and_training'`).

Container metadata on the blob:
- `consentlevel` — `retention` | `retention_and_training`
- `consentversion` — integer string
- `locale` — BCP-47
- `uid-hash` — HMAC-SHA256(uid, server-side pepper) — for joins without storing raw uid as a tag (tags leak in logs)

### 3.3 Path scheme

```
recordings/{yyyy}/{mm}/{dd}/{uid}/{sessionId}-{sequence}.wav
recordings/{yyyy}/{mm}/{dd}/{uid}/{sessionId}-{sequence}.meta.json
```

- `uid` is plaintext in the path (needed for per-user purge — see §6). Path-based access is backend-only; no SAS tokens are issued to clients.
- `sessionId` is the existing chat thread ID.
- `sequence` is a zero-padded monotonic counter within the session (`0001`, `0002`…).
- Date prefix supports efficient lifecycle rules and makes retention-cliff auditing trivial.

### 3.4 Tier + lifecycle

| Age       | Tier       | Purpose                                             |
|-----------|------------|-----------------------------------------------------|
| 0–7 d     | Hot        | Retrain sampling + user-initiated review            |
| 8–90 d    | Cool       | Audit, anomaly investigation, user export           |
| 91–365 d  | Archive    | Statutory retention (India tax + legal holds)       |
| >365 d    | Delete     | Lifecycle rule hard-deletes unless a hold is active |

Per-consent-level overrides:
- `retention` → max 180 days regardless (user didn't sign up for training utility).
- `retention_and_training` → standard schedule above.
- On revocation → bypass schedule, purge immediately (§6).

Azure Storage Lifecycle Management policy is config-only, defined via IaC (Bicep). Already-cool data that's revoked still gets rehydrated-and-deleted by the purge Function (Blob delete works on any tier).

## 4. Metadata Sidecar

Sidecar JSON stored next to each `.wav` at the same path with extension `.meta.json`:

```json
{
  "version": 1,
  "sessionId": "chat_abc123",
  "sequence": 4,
  "timestamp": "2026-04-19T10:15:22.413Z",
  "durationMs": 3280,
  "payloadBytes": 104960,

  "detectedLocale": "hi-IN",
  "preferredLocale": "hi-IN",
  "candidateLocales": ["hi-IN", "en-US"],
  "azureConfidence": 0.87,
  "azureLexicalText": "हां मुझे शादी का मेन्यू देखना है",
  "finalTranscript": "haan mujhe shaadi ka menu dekhna hai",
  "userEditedTranscript": null,
  "userCorrectionApplied": false,

  "consentLevel": "retention_and_training",
  "consentVersion": 1,
  "ageAttested": true,

  "appVersion": "2026.04.1",
  "clientPlatform": "web",
  "clientUserAgentFamily": "Chrome/Desktop",

  "speakerIsAccountHolder": "unknown",
  "sttModel": "azure-base-2025-Q4",
  "ffmpegMs": 120,
  "azureMs": 890,
  "retriesUsed": 0
}
```

**What is deliberately NOT included**:
- `uid` (stored only in path + as HMAC in blob tag).
- Name, phone, email, payment info.
- IP address (collected in audit log, not sidecar).
- Session-level chat context / prior messages.
- Any field from `users/{uid}` profile.

Rationale: the sidecar may be extracted into the training corpus; the training corpus may be shared with human labelers. Minimizing PII at the source blocks an entire class of leakage.

**Validation**: the sidecar schema is versioned; a JSON-schema validator runs in the retraining pipeline ingest step and rejects blobs whose sidecar is missing or malformed.

## 5. Retraining Loop

### 5.1 Trigger

- **Cadence**: monthly cron (`0 2 1 * *` UTC — 02:00 on the 1st).
- **Orchestrator**: Azure Machine Learning pipeline (`stt-retrain-v1`) triggered by a Logic App cron.
- **Idempotency**: each run stamps a `trainingRunId` and writes to a new Custom Speech model candidate (`wedding-stt-{yyyy-mm}`).

### 5.2 Sampling

Target: 10–50k clips per run. Stratified sampling:

| Stratum                          | Target share | Rationale                          |
|----------------------------------|--------------|------------------------------------|
| hi-IN + user-corrected           | 25%          | Highest signal for Hindi gains     |
| gu-IN + user-corrected           | 20%          | Small-locale priority              |
| en-IN-accented + low confidence  | 20%          | Indian English is our weakest spot |
| mixed-code (Hinglish/Gujlish)    | 15%          | Real-world wedding convo           |
| hi-IN high-confidence            | 10%          | Anchor set / regression guard      |
| en-US / other                    | 10%          | Prevent catastrophic forgetting    |

"Low confidence" = `azureConfidence < 0.75`. "User-corrected" = `userCorrectionApplied === true` (requires a client-side feature not in scope here — flagged as **Phase 4.5** dependency). "Mixed-code" heuristic: final transcript contains characters from two scripts.

All sampled clips must have `consentLevel === 'retention_and_training'`. Backend enforces this at the sampler SQL level.

### 5.3 Human-in-the-loop labeling

**Tool choice**: Azure ML Data Labeling (managed) over self-hosted Label Studio VM.

Reasons:
- Zero ops burden vs. Label Studio (no VM patching, no auth plumbing).
- Native Azure Blob connector — samplers feed directly into a labeling project.
- Per-labeler audit trails meet DPDPA processing-record requirements.
- Cost overhead is modest at our volume (<1% of training compute).

Labelers are contractors under DPA; they see the sidecar minus any field that could deanonymize (HMAC uid is masked by pipeline). Labelers correct transcripts; corrections become the gold transcript for training.

### 5.4 Training + promotion gate

1. Export labeled dataset → Azure Custom Speech training job against the current prod baseline.
2. Evaluate the new model on a **held-out eval set** (frozen 2k-clip set, 40% hi-IN / 25% gu-IN / 25% en-IN / 10% mixed) — never seen during training.
3. Compute WER per-locale and overall.
4. **Promotion gate**: new model promotes to prod *only if*:
   - Overall WER improves by ≥**1.5 pp absolute** vs. current prod baseline, AND
   - No per-locale WER regresses by more than 0.5 pp, AND
   - Latency on reference hardware unchanged within 10%.
5. If promoted: flip a backend-held `AZURE_CUSTOM_SPEECH_ENDPOINT_ID` env var via the deployment pipeline (not a Firestore change). Old model kept warm for 7-day rollback window.
6. If not promoted: candidate model is archived; incident ticket auto-filed for investigation.

Metrics published to the same `emit()` telemetry bus `stt.ts` already uses, under topic `stt.retrain.eval`.

## 6. Deletion + Right-to-Erasure

Three triggers, one queue-driven handler.

### 6.1 Trigger sources

1. **Consent revoke** → `handleUpdatePreferences` detects transition to `voiceDataConsent: 'none'` and enqueues `{ uid, scope: 'audio-only', reason: 'revoke' }`.
2. **Account deletion** → `handleSoftDelete` already flips `deletionPending`; the nightly hard-delete job (separate existing workflow) additionally enqueues `{ uid, scope: 'audio-and-corpus', reason: 'account-delete' }`.
3. **Manual DSR request** → ops-only backend endpoint enqueues the same shape.

### 6.2 Handler — `purgeUserAudio` Azure Function

- Queue-triggered. Visibility timeout 10 min; max dequeue count 5 (then DLQ).
- Enumerates all blobs under `recordings/**/{uid}/**` across all containers.
- Batch-deletes 256 at a time; reports progress to a Firestore doc `users/{uid}/privacy/purgeStatus` (backend-only write).
- On `audio-and-corpus`: additionally issues a tombstone to the training corpus (labeled dataset) via the Azure ML dataset API — the uid's HMAC is blacklisted from all future sampling runs. Already-trained models are left alone (you can't untrain), but the Privacy Notice discloses this.
- Emits `privacy.purge.complete` event.

### 6.3 SLA

- **DPDPA §11**: 30 days from request.
- **Internal target**: p50 < 1 h, p99 < 24 h.
- **Audit**: purge receipts retained 7 years in `users/{uid}/consentAuditLog` (append-only).

## 7. What This Does NOT Do

- Does **not** touch `firestore.rules`, `storage.rules`, or any Firebase project config. All Firestore reads and writes added by this phase go through the backend with `adminDb` / `adminAuth` — the same privilege model used by the entire `accountController.ts`.
- Does **not** write to any Firebase Storage bucket; audio lives in Azure Blob.
- Does **not** store audio for users at `voiceDataConsent === 'none'`. The `stt.ts` service gets a minor addition: after a successful transcribe, if and only if consent is not `'none'`, call a new `archiveAudio()` helper. Consent lookup reuses the `userPrefsCache.ts` pattern (5 min TTL) so the hot path stays cheap.
- Does **not** store PII in blob metadata or sidecar.
- Does **not** ship a UI this phase — the DataPrivacyTab already has an opted-out card we can uncomment and adapt.
- Does **not** expose any new client-readable Firestore path; this is why no rules update is needed.
- Does **not** train on a minor's voice when `ageAttested === false` or `speakerIsAccountHolder === false`.

## 8. Cost Estimate

Assumptions: 2 min audio/user/month at 16 kHz mono PCM WAV → ~3.84 MB/user/month raw. With 30% lossless compression at ingest (FLAC fallback optional; keeping WAV here) call it **4 MB/user/month** for round numbers. Opt-in rate assumed 30% overall; of those, 60% to `retention_and_training`, 40% to `retention`.

**Per-user archived volume**: 4 MB × 30% = **1.2 MB/active user/month**.

**Azure Blob pricing (Central India, approximate, April 2026)**:
- Hot LRS: $0.021/GB-month
- Cool LRS: $0.013/GB-month
- Archive LRS: $0.002/GB-month
- Read operations: ~$0.0044/10k (Hot)
- Write operations: ~$0.055/10k (Hot)

### 8.1 Scenario: 1,000 active users/month

- New audio/month: 1.2 GB
- Steady state (after 90d ramp): Hot 0.28 GB (7d rolling), Cool 2.4 GB (8-90d), Archive 3.2 GB (91-365d)
- Storage: 0.28×0.021 + 2.4×0.013 + 3.2×0.002 = $0.006 + $0.031 + $0.006 = **~$0.04/mo**
- Ops (writes ~300/user/mo × 300 retention users = 90k writes): 90k/10k × $0.055 = **~$0.50/mo**
- Egress (training sampler pulls ~10% of Hot monthly): negligible in-region (same region → free)
- **Total: <$1/mo**. Training compute: Custom Speech ~$0.50 per audio-hour — 1k users = 33 hr = $17
- **1k-user grand total: ~$20/mo**

### 8.2 Scenario: 10,000 active users/month

- New audio/month: 12 GB → Hot 2.8 GB + Cool 24 GB + Archive 32 GB
- Storage: 0.06 + 0.31 + 0.06 = **$0.43/mo**
- Ops: **$5/mo**
- Training compute: 333 hr × $0.50 = **$167/mo**
- Labeling (Azure ML Data Labeling ~$0.08 per item at 10k items sampled): **$800/mo**
- **Grand total: ~$975/mo** (labeling dominates)

### 8.3 Scenario: 100,000 active users/month

- New audio/month: 120 GB → Hot 28 GB + Cool 240 GB + Archive 320 GB
- Storage: 0.59 + 3.12 + 0.64 = **$4.35/mo**
- Ops: **$50/mo**
- Training compute: 3,333 hr × $0.50 = **$1,666/mo**
- Labeling (scaled to 30k items/mo, with bulk discount): **~$2,000/mo**
- Eval + orchestration (Azure ML compute, storage egress): **~$200/mo**
- **Grand total: ~$3,900/mo** at 100k active users

Cost scales sub-linearly in storage (tiering) and linearly in training compute. Labeling is the lever — we can throttle sample size if budget tightens.

### 8.4 Cost safeguards

- Per-user per-month ingest cap (e.g. 20 min / user / month). Excess clips ingested-and-deleted after transcribe.
- Monthly training-run item cap (e.g. 50k clips). Excess deferred to next run.
- Alert at 150% of forecasted monthly spend.

---

## File paths relevant to implementation (all absolute)

- `D:\weddingease\easeBot\easebot-backend\src\services\stt.ts` — add `archiveAudio()` call after successful transcribe, gated on consent lookup.
- `D:\weddingease\easeBot\easebot-backend\src\controllers\transcribeController.ts` — pass `uid` + `sessionId` into the consent-aware transcribe path.
- `D:\weddingease\easeBot\easebot-backend\src\controllers\accountController.ts` — extend `handleUpdatePreferences` allow-list with `voiceDataConsent`, add server-managed timestamps, enqueue purge on revoke.
- `D:\weddingease\easeBot\easebot-backend\src\lib\userPrefsCache.ts` — extend the cache to expose `getCachedVoiceConsent(uid)` alongside existing language cache.
- `D:\weddingease\easeBot\Wedding-Ease-Viva-Chat\src\pages\settings\tabs\DataPrivacyTab.tsx` — re-enable the currently commented-out training card; swap binary switch for three-option radio.
- `D:\weddingease\easeBot\Wedding-Ease-Viva-Chat\src\types\index.ts` — add `voiceDataConsent`, `voiceConsentAcceptedAt`, `voiceConsentVersion`, `voiceConsentAgeAttested` to `UserPreferences`.

## Anything requiring Firebase rule changes

**None.** Explicit by design — every Firestore mutation flows through the backend with `adminDb`, mirroring the existing preferences/subscription/deletion code paths. Azure Blob Storage is not governed by Firebase rules at all. If a future sub-phase exposes the audit log or a purge-status doc to the client, that would be a **separate** rules-approval request and is explicitly out of scope here.
