# Gate 5a Release QA Smoke Execution Plan

Status: `plan_ready`

Gate 5a defines the v1 release QA smoke execution plan before App Store / Google Play submission work begins.

This is docs/output-only. It does not run QA, rerun Gate 4h, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, change DB schema, change API contracts, change env, operate dashboards, call provider APIs, implement Brush-up, introduce Capacitor, or start Store submission.

Brush-up remains deferred to v1.1 and must not appear in v1 Store metadata, screenshots, reviewer notes, public support copy, or release QA claims.

## QA Smoke Scope

Gate 5a scopes the smoke plan around the v1 feature set:

| Area | Smoke focus | Evidence status values |
| --- | --- | --- |
| Auth / login / logout | login reaches `/scripts`, refresh preserves session, logout clears session, protected routes remain guarded. | `pass`, `warn`, `blocked`, `human_required` |
| Script creation | `/scripts/new` creates a v1 practice script and hands off to listen. | `pass`, `warn`, `blocked` |
| Listen | normal model audio generation or cache reuse, protected app-owned replay, no Brush-up claim. | `pass`, `warn`, `blocked` |
| Record | microphone or supported upload path, recording notice, upload safety, too-short recovery. | `pass`, `warn`, `blocked` |
| Evaluate | OpenAI transcription and Azure pronunciation evaluation through server-side boundaries, no partial failed persistence. | `pass`, `warn`, `blocked`, `human_required` |
| Review | saved score, transcript summary, weak words, coach feedback, saved recording replay, learning-aid copy. | `pass`, `warn`, `blocked` |
| Progress | latest / best continuity, saved recording / model audio summaries, second take continuity. | `pass`, `warn`, `blocked` |
| Setup voice | normal v1 voice sample / consent recording notice, default voice, normal model audio only. | `pass`, `warn`, `blocked`, `human_required` |
| Settings | legal/support links, account deletion request, dry-run summary, no public actual deletion button. | `pass`, `warn`, `blocked`, `human_required` |
| Privacy / Terms / Support / Account deletion | public routes load, draft/final status is clear, v1 data handling matches copy, no actual deletion overclaim. | `pass`, `warn`, `blocked`, `human_required` |
| Provider kill switch | OpenAI, Azure, ElevenLabs, Storage upload switches have local smoke and future approved operation proof path. | `pass`, `warn`, `blocked`, `human_required` |
| Logs / redaction | no secret, env value, raw provider response, transcript body, private audio path, object key, provider id, email, or auth id in evidence. | `pass`, `fail` |
| Mobile browser | mobile recording, upload, protected replay, responsive legal/support routes, Safari/WebView audio risk. | `pass`, `warn`, `blocked`, `human_required` |
| Production URL | production deployment opens, main loop works, current build ref is safely recorded. | `pass`, `warn`, `blocked`, `human_required` |
| Reviewer account flow | reviewer can login, run the v1 loop, inspect settings/support/deletion request path, and avoid Brush-up claims. | `pass`, `warn`, `blocked`, `human_required` |

## Environment Matrix

| Environment | Purpose | Allowed in Gate 5a | Notes |
| --- | --- | --- | --- |
| Local | Plan local smoke order and safe evidence shape. | Plan only | No QA run in this gate. |
| Production Web | Plan production URL / login / main loop smoke. | Plan only | Do not infer current deploy from repo alone. |
| Mobile browser | Plan mobile Safari / Chrome checks for audio and legal routes. | Plan only | Mobile/WebView audio risk remains Gate 6 confirmation. |
| Reviewer account | Plan Store reviewer route through v1. | Plan only | Human must provide final reviewer account. |
| Disposable account | Plan Gate 4h dry-run proof re-run. | Plan only | Requires human disposable account first. |
| Provider disabled env smoke | Plan approved kill switch operation proof. | Plan only | Do not change Vercel env or dashboard in this gate. |
| Provider normal env smoke | Plan normal provider path smoke. | Plan only | Provider API calls are not made in this gate. |

## Status Values

Use only:

- `pass`: observed behavior matches v1 requirements.
- `warn`: usable, but a release-owner, legal, provider, dashboard, or QA follow-up remains.
- `blocked`: cannot proceed without a prerequisite or the behavior contradicts v1 release requirements.
- `not_applicable`: intentionally outside v1 scope, such as Brush-up.
- `human_required`: needs a human-provided account, dashboard confirmation, final URL, legal approval, production-safe operation, or Store-owner action.

## Gate 4h Dependencies

Keep these separate from general release QA until a human prepares a disposable account:

- disposable account safe alias;
- explicit confirmation that the account is not real/personal;
- environment label;
- authenticated disposable session;
- minimal v1 data creation;
- account deletion request creation;
- typed confirmation;
- inventory dry-run safe summary;
- job-stage dry-run safe summary;
- provider cleanup dry-run safe summary;
- Storage cleanup dry-run safe summary;
- DB cleanup dry-run safe summary;
- Supabase Auth deletion dry-run safe summary;
- category counts / status / reason codes;
- redaction confirmation;
- stop point before actual deletion.

Gate 5a does not rerun Gate 4h and does not target any account.

## Gate 6 Release QA Handoff

Carry these items to Gate 6 release QA:

- mobile browser / future WebView recording, upload, PCM normalization, and replay risk;
- Azure Pronunciation Assessment final resource/region refresh;
- normal v1 provider cleanup proof or safe non-applicability;
- App Privacy / Google Data Safety consistency with final implemented behavior;
- reviewer account and reviewer instructions smoke;
- final Store URLs for Privacy Policy, Support, and account deletion request;
- production logs redaction check;
- production-like or approved production-safe kill switch operation proof;
- protected replay proof for normal v1 generated model audio and saved recordings;
- support/legal/deletion copy final approval;
- Gate 4h disposable account dry-run proof re-run.

These items may be planned now, but Store submission remains blocked until the required human confirmations and proof packages are complete.

## Recommended QA Execution Order

1. Local smoke.
   - Auth guard, basic route load, mock/provider-safe main loop, legal/support routes, and redaction scan.
2. Production Web smoke.
   - Production URL, build ref, login, refresh, script creation, listen, record, evaluate, review, progress, second take.
3. Provider kill switch smoke.
   - Use Gate 4k as local baseline; perform later human-approved operation proof without recording env values.
4. Privacy / support / deletion smoke.
   - `/privacy`, `/terms`, `/support`, `/support/account-deletion`, `/settings`, consent/provider notices, no deletion overclaim.
5. Mobile browser smoke.
   - Mobile recording/upload/replay, protected audio, responsive legal/support routes, recovery copy.
6. Reviewer account smoke.
   - Reviewer login, v1 main loop, settings/support/deletion request path, no Brush-up claim.
7. Disposable account deletion dry-run proof.
   - Gate 4h re-run only after human disposable account preparation; stop before actual deletion.
8. Final release QA signoff.
   - Consolidate blockers, warnings, human approvals, redaction, and Store-facing URLs before Capacitor or Store submission.

## Evidence Package Shape

Each future QA run should record only safe fields:

| Field | Safe value guidance |
| --- | --- |
| `run_id` | Operator-generated safe alias. |
| `run_date` | Timestamp or date. |
| `environment` | `local`, `production_web`, `mobile_browser`, `reviewer_account`, `disposable_account`, `provider_disabled_env_smoke`, or `provider_normal_env_smoke`. |
| `account_type` | `owner`, `reviewer`, `disposable`, `none`, or `unknown`; no email or auth id. |
| `route_or_feature` | Route label or feature label only. |
| `result` | `pass`, `warn`, `blocked`, `not_applicable`, or `human_required`. |
| `blocker` | Safe reason code only. |
| `warning` | Safe warning label only. |
| `redaction_status` | `pass`, `warn`, or `fail`. |
| `no_secret` | boolean. |
| `no_raw_data` | boolean. |
| `screenshot_allowed` | boolean; screenshots must not include private data, transcript text, raw audio paths, provider ids, env values, or private account detail. |
| `screenshot_notes` | `not_captured`, `safe_capture_only`, or safe note. |
| `next_action` | Safe next action label. |

Evidence must not record:

- secrets or env values;
- raw provider responses;
- billing details beyond safe status;
- transcript bodies or script bodies;
- raw audio;
- private audio paths;
- Storage object keys or full paths;
- signed URLs;
- provider voice identifiers;
- full email addresses;
- full auth user ids.

## Stop Conditions for Future QA Execution

Stop and rescope if QA requires:

- disposable account access that has not been explicitly prepared;
- actual deletion;
- Auth user deletion;
- Storage deletion;
- DB destructive cleanup;
- provider cleanup execution;
- DB schema / migration changes;
- env changes or dashboard operation by Codex;
- provider API calls outside a scoped, human-approved smoke;
- legal final judgment by Codex;
- recording secret, raw provider response, transcript body, private path, provider id, or private user data.

## Non-Destructive Boundary

Gate 5a did not:

- run QA;
- rerun Gate 4h;
- target real, reviewer, or disposable accounts;
- create or confirm deletion requests;
- execute actual deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- call provider cleanup;
- change DB schema or migrations;
- change API contracts;
- change env or dashboards;
- implement Brush-up;
- introduce Capacitor;
- start App Store / Google Play work.
