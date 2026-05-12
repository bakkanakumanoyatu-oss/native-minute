# Gate1i Web Beta Release Candidate Proof / Deploy Log Template

Use this template to decide and record a Web beta / small cohort release candidate. This template does not deploy, does not change production env, and does not resolve Human Check Backlog items.

## Scope

- Web beta release candidate decision for the Next.js Web core.
- Launch mode: `private_beta` or `small_cohort`.
- Provider roles:
  - ElevenLabs: voice clone / model audio generation.
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation.
  - Azure: pronunciation evaluator.
  - Supabase Storage: `recordings`, `script-audios`, `voice-samples`, `voice-consents`.

Out of scope: production deploy, hosting configuration, dashboard operations, production env changes, Capacitor, store metadata, provider contract changes, DB/RLS/bucket changes, and destructive account deletion.

## Redaction Rules

Never record:

- API keys, auth headers, service role keys, session tokens, or secret env values.
- Billing amounts, invoices, account ids, subscription ids, project ids, or resource ids.
- Signed URLs, raw storage paths, object keys, raw user ids, email addresses, audio ids, take ids, or raw audio.
- Provider request/response bodies, provider voice ids, transcripts, script text, or generated draft full text.

Record only:

- `PASS / WARN / BLOCKED / FAIL`.
- Short commit/build refs.
- Provider choices, launch mode, safe command results, owner roles, timestamps, and masked references.

## Release Candidate Proof

Fill this section before deciding whether the build can be deployed to Web beta.

## Recorded Final Human Check Batch - 2026-05-10

| Field | Value |
| --- | --- |
| Release candidate result | `GO WITH WARNINGS` |
| Decision reason | Final Human Check `BLOCKED` items are resolved after Azure Speech resource / region / quota / usage visibility, pay-as-you-go upgrade, Gate1l release-owner acceptance, and Azure pronunciation live smoke were confirmed. No deploy has been performed. |
| Support contact | `PASS`: Web beta support contact is published as `bakkanakuma@gmail.com`. |
| Account deletion SLA | `PASS`: first response target is 3 business days; completion target is 30 days; manual cleanup owner is app owner. |
| Legal/support draft review | `WARN`: required information mostly exists, but copy clarity needs improvement and formal legal review is not complete. |
| Gate1g provider proof | `WARN`: Azure dashboard/resource proof and Azure pronunciation live smoke are PASS; OpenAI and ElevenLabs have release-owner-accepted WARN items; Supabase Storage budget/usage visibility is PASS. |
| Gate1b protected replay | `PASS`: own replay works and cross-user replay is denied; raw ids are not recorded. |
| Account deletion actual path | `BLOCKED for Store submission`: RR-3 preparation exists, but disposable live proof and real completion path are not executed. |
| Remaining WARN items | OpenAI dedicated project, OpenAI hard cap handled by app-side limits / kill switch ops, ElevenLabs explicit alert, legal/support copy clarity. |
| Remaining BLOCKED items | None currently recorded for Web beta human checks. Store submission remains blocked by account deletion disposable live proof. |
| Redaction status | `PASS`: raw API key, billing amount, account id, subscription id, resource id, signed URL, storage path, raw user id, audio id, and take id are not recorded. |

### GO WITH WARNINGS Acceptance Record

Fill this section before a Web beta deploy if the decision remains `GO WITH WARNINGS`.

| Field | Value |
| --- | --- |
| Release owner | `app owner` |
| Acceptance decision | `GO WITH WARNINGS` |
| Accepted WARN items | OpenAI Default project for small-cohort beta; OpenAI app-side limits plus kill switch for cost stop; ElevenLabs manual monitoring / cache reuse / app-side limits plus kill switch; legal/support Web beta drafts pending clarity and formal review. |
| Acceptance reason | Small-cohort Web beta can proceed with app-owner monitoring, app-side limits, and emergency kill switches; broader public launch and Store submission still require stronger cleanup/review work. |
| Mitigation owner | `app owner` |
| Next review date | before broader public launch / Store submission |
| Azure smoke handling | `fresh smoke PASS` |
| Legal/support handling | `beta draft accepted for small-cohort Web beta; clarity and formal review remain WARN before broader release` |
| OpenAI monitoring handling | `Default project accepted for small-cohort Web beta; app-side limits and kill switch mitigation accepted` |
| ElevenLabs monitoring handling | `manual monitoring accepted for small-cohort Web beta; app-side limits, cache reuse, and kill switch mitigation accepted` |
| Account deletion handling | `request-based + support/manual cleanup accepted for Web beta; disposable live proof remains Store-submission blocker` |
| Redaction check | `PASS` |

### Owner Assignment

Fill this before deploy.

| Role | Required | Value |
| --- | --- | --- |
| Release owner | yes | `app owner` |
| Deployer | yes | `app owner` |
| Rollback owner | yes | `app owner` |
| Incident owner | yes | `app owner` |
| Post-deploy smoke owner | yes | `app owner` |
| Provider monitoring owner | yes | `app owner` |
| Support / deletion owner | yes | `app owner` |

### Azure Pronunciation Live Smoke Result

Use `docs/gate1l-go-with-warnings-acceptance-azure-smoke.md` for the procedure.

| Field | Value |
| --- | --- |
| Smoke status | `PASS` |
| Environment | `production-like / human browser` |
| Route path | `/scripts/[id]/record -> review -> progress` without ids |
| Audio source | `short non-sensitive English recording` |
| Result summary | `record -> evaluate -> review` passed; review reflected score, weak words, coach / next step; progress reflected latest result and previous good/best result; no error screen. |
| Raw data redaction | `PASS` |

### Review Metadata

| Field | Value |
| --- | --- |
| Checked at | `YYYY-MM-DD HH:mm TZ` |
| Reviewer | `name / role` |
| Commit short ref | `short ref only` |
| Build ref | `short ref only / pending` |
| Environment | `production-like / production candidate` |
| Launch mode | `private_beta / small_cohort` |
| Release candidate result | `GO / GO WITH WARNINGS / BLOCKED` |

### Provider Configuration Summary

| Surface | Expected for Web beta | Recorded value | Result |
| --- | --- | --- | --- |
| Voice provider | `elevenlabs` | `provider name only` | `PASS / WARN / BLOCKED / FAIL` |
| Transcription provider | `openai` | `provider name only` | `PASS / WARN / BLOCKED / FAIL` |
| Pronunciation provider | `azure` | `provider name only` | `PASS / WARN / BLOCKED / FAIL` |
| Script generation provider | `openai` if real AI draft is enabled | `provider name only` | `PASS / WARN / BLOCKED / FAIL` |
| Launch mode | `private_beta` or `small_cohort` | `mode only` | `PASS / WARN / BLOCKED / FAIL` |
| E2E/test helper env | not enabled in production | `not set / blocked` | `PASS / WARN / BLOCKED / FAIL` |
| Destructive account deletion env | off | `off / blocked` | `PASS / WARN / BLOCKED / FAIL` |

### Automated Pre-Deploy Checks

| Check | Result | Safe evidence |
| --- | --- | --- |
| `npm run lint` | `PASS / FAIL` | Command result only. |
| `npm run build` | `PASS / FAIL` | Command result only. |
| `npm run typecheck` | `PASS / FAIL` | Command result only. |
| `npm run production:preflight` | `PASS / WARN / BLOCKED / FAIL` | Provider choices / launch mode only. No env values. |
| `npm run supabase:storage-rls:check` | `PASS / WARN / BLOCKED / FAIL` | Required tables and private buckets only. No paths or keys. |
| `npm run voice:preflight` | `PASS / WARN / BLOCKED / FAIL` | Voice provider and set/missing status only. |
| `npm run pronunciation:preflight` | `PASS / WARN / BLOCKED / FAIL` | Transcription/pronunciation provider choices only. |

### Gate Proof Status

| Gate | Expected status before Web beta | Recorded status | Notes |
| --- | --- | --- | --- |
| Gate1b protected replay / cross-user ownership | `PASS` | `PASS / WARN / BLOCKED / FAIL` | Reference `docs/gate1b-production-supabase-spot-check-proof-template.md`; no raw ids. |
| Gate1g provider budget / kill switch proof | `PASS` or human-accepted `WARN` | `PASS / WARN / BLOCKED / FAIL` | Azure Speech dashboard/resource visibility is PASS as of 2026-05-10; keep remaining provider monitoring gaps as WARN unless separately resolved. |
| Gate1h deploy / rollback / smoke runbook | `READY` | `READY / WARN / BLOCKED` | Reference `docs/gate1h-web-beta-deploy-rollback-smoke-runbook.md`. |
| Human Check Backlog | all `BLOCKED` resolved or explicitly accepted | `PASS / WARN / BLOCKED` | Reference `docs/human-check-backlog.md`. |
| Legal/support draft review | resolved or accepted for beta | `PASS / WARN / BLOCKED` | Do not treat beta drafts as final legal copy. |
| Account deletion actual path | request-based beta accepted or actual completion done | `WARN / BLOCKED` | Store submission remains blocked until actual completion path exists. |

### Release Decision

| Field | Value |
| --- | --- |
| Decision | `GO WITH WARNINGS` |
| Decision owner | `app owner` |
| Rollback owner | `app owner` |
| Incident owner | `app owner` |
| Post-deploy smoke owner | `app owner` |
| Provider monitoring owner | `app owner` |
| Support / deletion owner | `app owner` |
| Human Check Backlog status | `accepted with WARN` |
| Remaining WARN items | OpenAI Default project; OpenAI app-side cost limits / kill switch hard stop; ElevenLabs explicit alert not confirmed; legal/support beta drafts need clarity and formal review. |
| Remaining BLOCKED items | None for Web beta; Store submission remains blocked by account deletion disposable live proof and final store/legal work. |
| Decision notes | Small-cohort Web beta may proceed as `GO WITH WARNINGS`; no deploy has been performed in this proof update. |

Decision rules:

- Use `GO` only when automated checks pass and no unresolved `BLOCKED` item remains.
- Use `GO WITH WARNINGS` only when the human release owner explicitly accepts remaining `WARN` items and documents a fallback.
- Use `BLOCKED` when any unresolved `BLOCKED` item remains, unless the human release owner explicitly accepts it for a private beta with a documented fallback.
- Never convert Human Check Backlog items to PASS from code inspection alone.

## Deploy Log Template

Fill this section only when a real Web beta deploy is performed.

### Deploy Metadata

| Field | Value |
| --- | --- |
| Deploy started at | `YYYY-MM-DD HH:mm TZ` |
| Deploy finished at | `YYYY-MM-DD HH:mm TZ` |
| Deployer | `name / role` |
| Build ref | `short ref only` |
| Commit short ref | `short ref only` |
| Environment | `production / production-like` |
| Launch mode | `private_beta / small_cohort` |
| Rollback target known | `yes / no` |
| Destructive account deletion env off | `yes / no` |

### Pre-Deploy Check Snapshot

| Check | Result | Notes |
| --- | --- | --- |
| Release Candidate Proof decision | `GO / GO WITH WARNINGS / BLOCKED` | Do not deploy when BLOCKED unless human release owner explicitly accepts a private beta exception. |
| `npm run production:preflight` | `PASS / WARN / BLOCKED / FAIL` | No env values. |
| `npm run supabase:storage-rls:check` | `PASS / WARN / BLOCKED / FAIL` | No raw storage detail. |
| Provider preflights | `PASS / WARN / BLOCKED / FAIL` | Provider choices only. |
| Human Check Backlog reviewed | `yes / no` | Link to backlog; do not paste private info. |

### Post-Deploy Smoke

| Area | Result | Safe evidence |
| --- | --- | --- |
| Auth login / callback / refresh | `PASS / WARN / BLOCKED / FAIL` | Route-level result only. |
| Settings logout / re-login | `PASS / WARN / BLOCKED / FAIL` | Route-level result only. |
| Home / Practice render | `PASS / WARN / BLOCKED / FAIL` | CSS/nav appears normal. |
| Script creation -> listen handoff | `PASS / WARN / BLOCKED / FAIL` | No script text pasted. |
| `/setup/voice` | `PASS / WARN / BLOCKED / FAIL` | Safe user-facing state. |
| Listen / protected replay | `PASS / WARN / BLOCKED / FAIL` | Own replay works; no audio id or URL. |
| Record / upload | `PASS / WARN / BLOCKED / FAIL` | 30-60 sec clear English or safe recovery. |
| Evaluate / review | `PASS / WARN / BLOCKED / FAIL` | Non-empty transcript, score grid, weak words; no transcript pasted. |
| Progress | `PASS / WARN / BLOCKED / FAIL` | Latest result appears. |
| Cross-user protected replay denial | `PASS / WARN / BLOCKED / FAIL` | 403/404-equivalent only; no ids. |
| Legal/support draft routes | `PASS / WARN / BLOCKED / FAIL` | `/privacy`, `/terms`, `/support`, `/support/account-deletion` load. |

### Rollback / Incident Record

| Field | Value |
| --- | --- |
| Rollback needed | `yes / no` |
| Rollback executed | `yes / no / not applicable` |
| Kill switch used | `none / OpenAI / Azure / ElevenLabs / Storage uploads` |
| Issue phase | `auth / routing / provider / storage / evaluation / replay / quota / legal-support / other` |
| Issue summary | short safe summary |
| User-facing impact | short safe summary |
| Next action | `monitor / fix forward / rollback / pause surface / blocked` |
| Owner | `name / role` |

Use the Gate1h rollback criteria when deciding whether to rollback, pause a provider surface, or fix forward.

## Relationship to Existing Gate Docs

- Gate1b proof establishes protected replay / cross-user ownership evidence.
- Gate1g proof tracks budget / dashboard / kill switch evidence. As of 2026-05-10, Azure dashboard/resource visibility is PASS and Gate1g is WARN, not BLOCKED.
- Gate1h runbook defines deploy, rollback, and post-deploy smoke execution.
- Human Check Backlog remains authoritative for dashboard, billing, legal, support, and SLA decisions.

Gate1i is the release decision and deploy evidence wrapper around those docs. It should not be used to bypass unresolved human checks.
