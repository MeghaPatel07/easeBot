# Fixing `OPTIONS … 403 Forbidden` on WeddingEase Cloud Functions

## Symptom
A browser call to any `https://us-central1-wedding-ease-dc99a.cloudfunctions.net/<fn>`
fails. DevTools shows the **CORS preflight** (`Request Method: OPTIONS`) returning
**403 Forbidden**, so the real POST never fires. First seen on `notesShareNotify`;
it affects the **entire gen-2 function batch**, not one function.

## Root cause
Every 2nd-gen Cloud Function is a **Cloud Run service**. The browser's preflight
`OPTIONS` request carries **no auth header** (CORS spec). Callable (`onCall`) auth
happens *inside* the function via the Firebase ID token, so the Cloud Run service
must allow **unauthenticated invocation** (`allUsers` → `roles/run.invoker`) just to
let the request reach the code. Missing that binding ⇒ IAM 403s the preflight ⇒
browser blocks the whole call. (403, not 404, = deployed but private.)

The Firebase CLI sets this binding automatically on deploy **unless the GCP org has
Domain Restricted Sharing (DRS) enabled** — then it prints a warning and leaves
every function private. That is the usual reason a fresh deploy 403s across the board.

## Affected functions (36, all gen-2)
26 `onCall` + 10 `onRequest`, all browser- or gateway-invoked:
`account*` (11), `auth{SendOtp,VerifyOtp,ResetPassword}`, `payment{Initiate,Return,Webhook,Verify}`,
`subscription{Upgrade,Downgrade,Current}`, `chat{Send,History}`,
`notes{Create,Update,Delete,List,ShareNotify}`, `imagesGenerate`,
`checklist{Create,Update,Delete}`, `feedbackCreate`, `transcribeAudio`, `ttsGenerate`, `getSpeechToken`.

All are safe to expose: `onCall` functions reject unauthenticated callers internally
(`request.auth`); the `onRequest` ones do their own token/signature/rate-limit checks
(OTP + payment-return/webhook *must* be public anyway).

## Fix — Step 1: grant public invoker (try this first)
```bash
./scripts/grant-functions-invoker.sh
```
Idempotent. If it prints `OK` for all 36, retest in the browser — preflight returns
`204`, calls go through. **No frontend change is needed.**

Single-function spot check (what to run if you only want to unblock note-sharing):
```bash
gcloud functions add-invoker-policy-binding notesShareNotify \
  --region=us-central1 --member=allUsers --project=wedding-ease-dc99a
```

## Fix — Step 2: only if Step 1 fails with a policy error
If you see `One or more users named in the policy do not belong to a permitted
customer`, the **org policy blocks `allUsers`**. Diagnose:
```bash
# Find the org/folder this project sits under, then read the DRS policy:
gcloud resource-manager org-policies describe iam.allowedPolicyMemberDomains \
  --project=wedding-ease-dc99a
```
An **org admin** must add a project-level exception (allow public members) for
`iam.allowedPolicyMemberDomains` on `wedding-ease-dc99a`, e.g. set the policy to
`allValues: ALLOW` at the project node (or add an exception rule), then re-run Step 1.
This is an Organization Policy Administrator action — outside the function code.

## Verify
```bash
# Function is ACTIVE and has a URL:
gcloud functions describe notesShareNotify --region=us-central1 \
  --project=wedding-ease-dc99a --gen2 --format="value(state,url)"

# allUsers is bound to roles/run.invoker on the underlying Cloud Run service:
gcloud run services get-iam-policy notessharenotify --region=us-central1 \
  --project=wedding-ease-dc99a --format=json
```
(Gen-2 Cloud Run service names are the function name lowercased, e.g.
`notesShareNotify` → `notessharenotify`.)

## Notes
- Re-deploying via `firebase deploy --only functions` will re-apply the binding too,
  **but still fails under DRS** — Step 2 is the real unblock if the org policy is on.
- The assistant cannot run any of this: gcloud isn't installed in its shell and IAM/
  deploy writes are hook-blocked. These are for Krish/an org admin to run.
