# Store Release Gate 1 Web Beta Smoke Evidence

Gate 1 proves that the current Next.js Web core is deployed to the intended Web beta / Vercel production target and still passes the fixed 1-minute practice loop.

This document is evidence-only. It does not deploy, change Vercel settings, reveal production env values, change DB schema, change provider contracts, add Capacitor, or modify app code.

## Repo-Confirmed Snapshot

- Commit under review: `10e4c838b83c3780c64d0eb13af08957ba8e3069` (`10e4c83 Add staged feedback for evaluate wait`).
- Branch under review: `main`, tracking `origin/main`.
- Repo search found no committed `vercel.json` or `.vercel` project metadata.
- `NEXT_PUBLIC_APP_URL` is required by production preflight, but the actual production URL is not confirmed from repo files without human dashboard/env confirmation.
- Existing Gate 1 docs record Web beta runbooks and owner acceptance, but also state that actual deploy execution was not performed in those proof updates.
- Therefore production URL, deploy provider project, build ref, and `deployedAt` are human confirmation required.

## Human Confirmation Required

Record only safe metadata. Do not paste secrets, raw provider responses, raw user data, raw audio, transcripts, signed URLs, object keys, storage paths, provider voice ids, account ids, project ids, or billing details.

| Item | Required safe evidence |
| --- | --- |
| Production URL | Exact app origin, if public-safe; otherwise masked origin plus owner confirmation. |
| Deploy provider | Vercel or other provider name, project/environment name only if safe. |
| Deploy build ref / commit ref | Short commit/build ref that matches the intended release commit. |
| `deployedAt` | Human-confirmed deploy timestamp. |
| Smoke reviewer | Reviewer role or initials, not private account details. |
| Device / browser | Device class, OS/browser version, and network context if relevant. |
| Launch mode | `private_beta` or `small_cohort`; do not expose env values beyond mode classification. |
| Provider env readiness | Provider names and PASS/WARN/BLOCKED status only; no key/value output. |
| Kill switch readiness | OpenAI, Azure, ElevenLabs, and Storage upload kill switch operation method known. |
| Smoke result | PASS / WARN / BLOCKED / FAIL with safe notes. |

## Gate 1 Smoke Checklist

| Area | Expected check | Result |
| --- | --- | --- |
| Production URL | Intended production URL opens the app shell. | Human confirmation required |
| Deploy build ref | Deployed build matches `10e4c83` or the explicitly chosen release ref. | Human confirmation required |
| Login | Approved auth flow reaches `/scripts`. | Human confirmation required |
| Session refresh | Refresh on a protected page keeps the session. | Human confirmation required |
| Home | Home loads without blocking errors or secret/raw provider detail. | Human confirmation required |
| Scripts list | `/scripts` loads the practice library. | Human confirmation required |
| Script creation | `/scripts/new` creates a script and reaches listen flow. | Human confirmation required |
| Listen | Model audio generates or reuses cache, and protected replay works. | Human confirmation required |
| Record | Microphone or safe upload path reaches evaluate. | Human confirmation required |
| Evaluate | Evaluation completes and saves review data without partial failed persistence. | Human confirmation required |
| Review | Summary, score/weak words, coach note, and replay load safely. | Human confirmation required |
| Progress | Latest result, best result, saved recording, and review link reflect saved data. | Human confirmation required |
| Second take | A second take on the same script preserves latest / best / progress semantics. | Human confirmation required |
| Provider env | Expected providers and launch mode are set; test helper env is not enabled. | Human confirmation required |
| Kill switch | OpenAI, Azure, ElevenLabs, and Storage upload kill switch operation is known. | Human confirmation required |
| Redaction | UI and evidence do not expose secrets, raw provider responses, raw audio, signed URLs, storage paths, provider voice ids, transcripts, or private script text. | Human confirmation required |
| Errors / warnings | Browser-visible errors, API errors, warnings, and recovery path are recorded safely. | Human confirmation required |
| Decision | Overall release smoke is PASS / WARN / BLOCKED / FAIL. | Human confirmation required |

## Evidence Templates

Use these templates for the human production smoke record:

- `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_template.md`
- `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_template.json`

The templates should be copied or filled only with safe metadata. If the smoke uncovers a production issue, record the blocker and stop before implementation work unless a follow-up task explicitly authorizes the fix.

## Recorded Evidence

- `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_evidence_b5c10e8.md`
- `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_evidence_b5c10e8.json`

Gate 1 Web beta production smoke is human-confirmed `PASS` for Vercel Production / Current build ref `b5c10e8`. Exact deploy timestamp and exact device/browser remain `unknown`.

## Decision Rules

- `PASS`: all critical main-loop checks pass, redaction is clean, and deploy ref matches the intended release commit.
- `WARN`: the main loop passes, but accepted operational warnings remain for a small-cohort Web beta.
- `BLOCKED`: a required human confirmation is missing, provider/env readiness is unknown, deploy ref cannot be matched, or account/session flow cannot be trusted.
- `FAIL`: a smoke step fails in production and needs a follow-up fix task.
