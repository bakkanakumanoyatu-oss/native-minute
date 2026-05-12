# Gate1j Final Human-Check Batch Runbook

Use this runbook to execute the final human checks before a Web beta / small cohort release candidate decision. This runbook does not perform dashboard operations, legal approval, deploy, or env changes by itself.

## Scope

- Human dashboard, billing, support, SLA, and legal/support draft checks that cannot be completed by code inspection.
- Launch mode: `private_beta` or `small_cohort`.
- Provider roles:
  - ElevenLabs: voice clone / model audio generation.
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation.
  - Azure: pronunciation evaluator.
  - Supabase Storage: `recordings`, `script-audios`, `voice-samples`, `voice-consents`.

Out of scope: Azure resource creation, budget/alert configuration, legal approval, support contact selection, production deploy, DB/RLS/bucket changes, provider contract changes, destructive account deletion, Capacitor, and store metadata.

## Redaction Rules

Never record:

- API keys, auth headers, service role keys, session tokens, or secret env values.
- Billing amounts, invoices, account ids, subscription ids, project ids, or resource ids.
- Signed URLs, raw storage paths, object keys, raw user ids, email addresses, audio ids, take ids, or raw audio.
- Provider request/response bodies, provider voice ids, transcripts, script text, or generated draft full text.

Record only:

- `PASS / WARN / BLOCKED / FAIL`.
- Checked date, reviewer role, safe notes, masked references, owner role, and next action.

## Batch Order

Run the checks in this order:

1. Azure Speech resource / region / quota / usage visibility.
2. OpenAI project separation and budget / alert.
3. ElevenLabs alert / notification.
4. Supabase Storage usage / egress visibility.
5. Support contact.
6. Account deletion SLA / manual cleanup owner.
7. Privacy / Terms / Support / account deletion draft review.
8. Update `docs/human-check-backlog.md` and the relevant proof templates.
9. Fill the Human Check Backlog status in `docs/gate1i-web-beta-release-candidate-proof-template.md`.

Rationale: provider cost visibility comes first because Gate1g is currently `BLOCKED`; support/legal/deletion decisions then determine whether Web beta can be launched with request-based deletion.

## Final Human-Check Matrix

| ID | Owner / reviewer | Check location | Steps | PASS | WARN | BLOCKED | Record result in | Never record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HCB-001 Azure Speech resource visibility | Release owner + Azure owner | Azure portal / Microsoft Foundry / Speech service views | Locate the Speech resource used by `PRONUNCIATION_PROVIDER=azure`; confirm it is the intended resource without copying ids. | Speech resource is visible and matched to the intended Native Minute environment via masked/safe reference. | Resource is visible but ownership/naming is ambiguous; human accepts manual monitoring for private beta. | Resource cannot be found or cannot be matched to the app environment. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md` | subscription id, resource id, key, endpoint, billing amount |
| HCB-002 Azure region / quota / usage visibility | Release owner + Azure owner | Azure Speech resource, Cost Management, quota/usage pages | Confirm region, quota/usage visibility, and alert/budget path for the Speech resource. | Region, quota/usage visibility, and monitoring path are confirmed. | Some visibility is indirect/manual but release owner accepts it for private beta with `NATIVE_MINUTE_DISABLE_AZURE=1` fallback. | Quota/usage cannot be viewed or monitored. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md` | subscription id, resource id, quota values if sensitive, billing amounts |
| HCB-003 OpenAI dedicated project separation | Release owner + OpenAI owner | OpenAI dashboard Projects / API usage | Confirm whether Native Minute uses a dedicated project or whether Default project is explicitly accepted for small cohort. | Dedicated project is confirmed or Default project acceptance is documented by release owner. | Default project remains in use but release owner accepts it for small cohort with API-key-level monitoring. | Project ownership / usage attribution is unclear. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md` | API key, org/account id, project id |
| HCB-004 OpenAI budget / alert final setting | Release owner + OpenAI owner | OpenAI usage / limits / budget or alert views | Confirm budget/alert or manual monitoring owner for OpenAI transcription and Script Studio generation. | Budget/alert or explicit monitoring owner is confirmed. | No formal alert, but manual monitoring cadence and owner are documented for private beta. | No budget, alert, or monitoring owner exists. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md` | API key, billing amount, account id |
| HCB-005 ElevenLabs alert / notification setting | Release owner + ElevenLabs owner | ElevenLabs dashboard usage / billing / notification views | Confirm alert/notification setting or manual monitoring owner for voice clone and model audio generation. | Alert/notification or explicit monitoring owner is confirmed. | No explicit alert, but manual monitoring cadence and `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` fallback are accepted. | No alert, no owner, or usage visibility is lost. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md` | API key, workspace id, provider voice id, request logs, billing amount |
| HCB-006 Supabase Storage usage / egress visibility | Release owner + Supabase owner | Supabase Storage dashboard / Analytics / project usage | Confirm storage usage/egress visibility or accepted manual monitoring path. | Storage usage/egress visibility is confirmed. | Dashboard remains limited, but bucket counts + project usage monitoring are accepted for private beta. | Storage usage/egress cannot be monitored and no fallback exists. | `docs/human-check-backlog.md`; `docs/gate1g-provider-budget-kill-switch-proof-template.md`; Gate1b proof if replay is rechecked | project ref, object keys, signed URLs, storage paths, detailed usage amounts |
| HCB-007 Public support contact | Release owner + support owner | Support inbox/domain decision; `/support` draft page | Decide public support contact and confirm who owns responses. | Public support contact is confirmed and beta pages are updated if needed. | Temporary support contact is accepted for private beta with owner and replacement plan. | No public support contact or response owner exists. | `docs/human-check-backlog.md`; `docs/gate1i-web-beta-release-candidate-proof-template.md`; support page follow-up issue if page update needed | private email unless approved for publication |
| HCB-008 Account deletion SLA / manual cleanup owner | Release owner + support/account deletion owner | Account deletion policy decision; `/support/account-deletion`; RR docs | Confirm first-response target, completion target, manual cleanup owner, and fallback while actual deletion completion is unfinished. | SLA and manual cleanup owner are confirmed for Web beta. | SLA/owner are temporary but explicit and accepted for private beta. | No SLA, no owner, or request-based deletion is not accepted. | `docs/human-check-backlog.md`; `docs/gate1i-web-beta-release-candidate-proof-template.md` | private emails unless approved; user ids; request ids |
| HCB-009 Privacy / Terms / Support / account deletion draft review | Release owner + legal/policy reviewer | `/privacy`, `/terms`, `/support`, `/support/account-deletion` | Review beta draft pages against current implementation and provider roles. | Drafts are accepted for Web beta or updated before RC. | Minor copy/legal concerns remain but are accepted for private beta with follow-up. | Drafts contradict implementation, omit key processors, or require legal approval before beta. | `docs/human-check-backlog.md`; `docs/gate1i-web-beta-release-candidate-proof-template.md` | legal correspondence, private contact details unless approved |

## Web Beta Decision Rules

- `GO` is allowed only when all `BLOCKED` items are resolved and automated release candidate checks pass.
- `GO WITH WARNINGS` is allowed only when remaining `WARN` items have an explicit owner, fallback, and acceptance by the human release owner.
- `BLOCKED` is required when any `BLOCKED` item remains unresolved, unless the human release owner explicitly accepts it for a private beta and documents the fallback in Gate1i.
- Store submission remains blocked until the actual account/data deletion completion path exists, regardless of Web beta status.

## Connection to Gate1i

After the batch:

1. Update `docs/human-check-backlog.md` statuses and safe notes.
2. Update `docs/gate1g-provider-budget-kill-switch-proof-template.md` for provider/storage dashboard proof.
3. If support or legal draft pages need copy changes, make that a separate implementation task.
4. Fill the Gate proof and Human Check Backlog fields in `docs/gate1i-web-beta-release-candidate-proof-template.md`.
5. Do not proceed to Web beta deploy if Gate1i release decision is `BLOCKED`.

## Minimal Batch Record

Use this table at the end of the batch. Keep raw values out.

| Field | Value |
| --- | --- |
| Batch checked at | `YYYY-MM-DD HH:mm TZ` |
| Release owner | `name / role` |
| Provider dashboard reviewer(s) | `name / role` |
| Support reviewer | `name / role` |
| Legal/policy reviewer | `name / role` |
| Overall Human Check Backlog status | `PASS / WARN / BLOCKED` |
| Remaining WARN items | short list |
| Remaining BLOCKED items | short list |
| Gate1i decision impact | `GO / GO WITH WARNINGS / BLOCKED` |
| Next action | `fill Gate1i / update docs / fix blocker / defer deploy` |
