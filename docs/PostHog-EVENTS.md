# PostHog Event Taxonomy — Easebot

Single source of truth for every tracked event. All agents build against this contract.
Format: `object_action` snake_case. Update this doc **before** adding an event.

## Naming rules
- Event names: `object_action` (e.g. `message_sent`, `payment_succeeded`)
- Properties: `snake_case`
- User properties (`$set`) describe the user; event properties describe the event
- Backend is source-of-truth for: payments, tokens, tool calls

## Super properties (attached to every event, client-side)
| Key | Source |
|---|---|
| `app_version` | `import.meta.env.VITE_APP_VERSION` |
| `active_mode` | Index.tsx current `selectedMode` |
| `is_authenticated` | `AuthContext` user truthiness |
| `plan_tier` | User property mirrored |

## User properties (`$set` on identify)
| Key | When |
|---|---|
| `email` | On login/signup |
| `plan_tier` | On plan change |
| `wedding_date` | On profile save |
| `signup_source` | Once on signup (`google` / `email` / `otp`) |
| `tokens_total` | On plan change |
| `tokens_used` | On chat complete (debounced) |
| `first_paid_at` | Once, on first `payment_succeeded` |
| `created_at` | Once, on first identify |

## Events

### Auth (FE + BE)
| Event | Source | Key properties |
|---|---|---|
| `signup_started` | FE Login | `method` |
| `signup_completed` | FE AuthContext | `method`, `is_guest_conversion` |
| `login_completed` | FE AuthContext | `method` |
| `logout` | FE | - |
| `password_reset_requested` | FE | - |
| `otp_verified` | BE | `success` |

### Activation (FE)
| Event | Properties |
|---|---|
| `first_message_sent` | `mode`, `time_to_first_msg_ms` |
| `mode_selected` | `mode`, `previous_mode` |
| `guest_prompt_hit` | `reason` (signup_required/quota_exceeded) |

### Chat core
| Event | Source | Properties |
|---|---|---|
| `message_sent` | FE | `mode`, `msg_len`, `has_attachment` |
| `stream_started` | BE | `mode`, `model` |
| `stream_completed` | BE | `mode`, `model`, `tokens_in`, `tokens_out`, `latency_ms` |
| `stream_errored` | BE | `mode`, `error_code` |

### Attachments
| Event | Source | Properties |
|---|---|---|
| `voice_input_used` | FE | `duration_s` |
| `image_uploaded` | FE | `size_kb` |
| `image_generated` | BE | `model`, `duration_ms` |

### Tools (BE only — source of truth)
| Event | Properties |
|---|---|
| `tool_invoked` | `tool_name` (checklist/reminder/timeline/note), `success` |

### Notes (FE)
| Event | Properties |
|---|---|
| `note_created` | - |
| `note_edited` | - |
| `note_deleted` | - |
| `theme_toggled` | `theme` (light/dark) |

### Pricing (FE + BE)
| Event | Source | Properties |
|---|---|---|
| `paywall_shown` | FE | `trigger` (quota/feature), `current_tier` |
| `plan_viewed` | FE | `tier` |
| `plan_selected` | FE | `tier`, `currency` |
| `token_meter_warning` | FE | `threshold` (80/95/100), `tokens_remaining` |
| `token_exhausted` | BE | `plan_tier` |

### Payment (BE — **webhook is source of truth**)
| Event | Source | Properties |
|---|---|---|
| `checkout_started` | FE | `tier`, `amount`, `currency` |
| `payu_initiated` | BE | `tier`, `amount`, `txn_id` |
| `payment_succeeded` | BE (webhook) | `tier`, `amount`, `currency`, `txn_id`, `mihpayid` |
| `payment_failed` | BE (webhook) | `tier`, `reason`, `txn_id` |
| `payment_abandoned` | FE (timeout 30min after `checkout_started`) | `tier`, `txn_id` |

## Cost-control rules (free-tier guard)
- Autocapture: **OFF** — all events manual
- Dev/localhost: **disabled** via `VITE_POSTHOG_ENABLED=false`
- Bots: filtered in PostHog project settings (`$useragent`)
- Stream events: only `stream_started` / `stream_completed` / `stream_errored`, never per-chunk
- Token meter: only fires at 80% / 95% / 100% thresholds, debounced
- Mode switches: debounced 500ms
- Session replay: conditional (100% paying, 10% free, 100% on checkout), 10s minimum duration
- Feature flags: bootstrapped from login response, 5-min client cache

## Do-not-track list
These are EXPLICITLY excluded to control cost and PII:
- Per-token stream chunks
- Mouse moves / scroll depth
- Typing indicators
- Raw chat message content (masked in replay; never in events)
- Raw wedding details, phone, card info
- Password fields (masked at browser)
