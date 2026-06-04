#!/usr/bin/env bash
#
# grant-functions-invoker.sh
# ---------------------------------------------------------------------------
# Fixes "OPTIONS … 403 Forbidden" on the WeddingEase gen-2 Cloud Functions.
#
# WHY: every 2nd-gen Cloud Function is a Cloud Run service. The browser's CORS
# preflight (OPTIONS) carries NO auth header, and callable (onCall) auth is done
# INSIDE the function via the Firebase ID token — so the Cloud Run service must
# allow unauthenticated invocation (allUsers -> roles/run.invoker) just to let
# the request reach the code. Without that binding the IAM layer 403s the
# preflight before the function runs, and the whole call fails in the browser.
#
# The Firebase CLI normally sets this binding automatically on deploy, but it
# SILENTLY FAILS when the GCP org has Domain Restricted Sharing (DRS) enabled —
# it prints a warning and leaves every function private. That's the usual cause
# of a fresh-deploy-wide 403.
#
# This is an IDEMPOTENT, read-then-write IAM change. Run it yourself (the
# assistant is hook-blocked from IAM/gcloud writes). Requires the gcloud CLI +
# an account with run.admin (or owner) on the project.
# ---------------------------------------------------------------------------
set -uo pipefail

PROJECT="wedding-ease-dc99a"
REGION="us-central1"

# All 36 deployed gen-2 functions (theweddingbot/v1). Every one is a browser- or
# gateway-invoked replacement for an Express endpoint, so every one needs the
# public invoker binding. onCall functions enforce auth inside via request.auth;
# onRequest functions enforce auth/signature inside.
FUNCS=(
  # account
  accountGetMe accountGetPlan accountGetUsage accountUpdateProfile
  accountGetInvoices accountGetInvoicePdf accountSoftDelete
  accountSignOutEverywhere accountUpdatePreferences accountExport accountClearHistory
  # auth (pre-login, must be public)
  authSendOtp authVerifyOtp authResetPassword
  # payment (initiate/verify = onCall; return = browser redirect; webhook = gateway s2s)
  paymentInitiate paymentReturn paymentWebhook paymentVerify
  # subscription
  subscriptionUpgrade subscriptionDowngrade subscriptionCurrent
  # chat
  chatSend chatHistory
  # notes
  notesCreate notesUpdate notesDelete notesList notesShareNotify
  # images
  imagesGenerate
  # checklists
  checklistCreate checklistUpdate checklistDelete
  # feedback / media / tokens
  feedbackCreate transcribeAudio ttsGenerate getSpeechToken
)

echo "Project: $PROJECT   Region: $REGION   Functions: ${#FUNCS[@]}"
echo

ok=0; fail=0; failed_names=()
for fn in "${FUNCS[@]}"; do
  printf '→ %-26s ' "$fn"
  if gcloud functions add-invoker-policy-binding "$fn" \
        --region="$REGION" --project="$PROJECT" \
        --member="allUsers" >/dev/null 2>/tmp/gcloud_invoker_err; then
    echo "OK"
    ok=$((ok+1))
  else
    echo "FAILED"
    fail=$((fail+1)); failed_names+=("$fn")
    sed 's/^/      /' /tmp/gcloud_invoker_err | head -3
  fi
done

echo
echo "Done. OK=$ok  FAILED=$fail"
if [ "$fail" -gt 0 ]; then
  echo
  echo "Some bindings failed. If the error mentions:"
  echo '  "One or more users named in the policy do not belong to a permitted customer"'
  echo "then the ORG POLICY is blocking allUsers (Domain Restricted Sharing). See the"
  echo "DRS section in scripts/README-functions-403.md — an org admin must add an"
  echo "exception for project $PROJECT before allUsers can be bound."
  echo
  echo "Failed: ${failed_names[*]}"
  exit 1
fi

echo "All functions now allow public invocation. Re-test from the browser — the"
echo "OPTIONS preflight should return 204 and the calls should go through."
