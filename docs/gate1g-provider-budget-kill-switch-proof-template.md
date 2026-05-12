# Gate1g Provider Budget / Kill Switch Proof Template

Use this template for Web beta provider budget monitoring proof. Do not record raw API keys, auth headers, provider request/response bodies, signed URLs, raw storage paths, raw user ids, account ids, invoices, or detailed billing amounts.

## Review Metadata

| Field | Value |
| --- | --- |
| Checked at | `YYYY-MM-DD HH:mm TZ` |
| Reviewer | `name / role` |
| Environment | `production / production-like staging` |
| Launch mode | `private_beta / small_cohort` |
| App version / commit | `short ref only` |
| Overall result | `PASS / WARN / BLOCKED / FAIL` |

## Automated Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run production:preflight` | `PASS / WARN / BLOCKED / FAIL` | No env values pasted. |
| `npm run supabase:storage-rls:check` | `PASS / WARN / BLOCKED / FAIL` | No raw object keys or signed URLs pasted. |
| `npm run voice:preflight` | `PASS / WARN / BLOCKED / FAIL` | Record provider choice only. |
| `npm run pronunciation:preflight` | `PASS / WARN / BLOCKED / FAIL` | Record provider choices only. |

## Recorded Dashboard Proof

## Recorded Gate1g Result - 2026-05-10

| Field | Value |
| --- | --- |
| Overall Gate1g result | `WARN` |
| Primary blocker | None currently recorded after Azure Speech resource / region / quota / usage visibility was confirmed. |
| Web beta implication | Gate1g no longer blocks Web beta by itself. Remaining provider WARN items are accepted by the release owner for small-cohort Web beta with app-side limits, manual monitoring, and kill switches. |
| Remaining WARN items | OpenAI dedicated project separation, OpenAI app-side hard cap handled by app-side limits / kill switch operations, ElevenLabs explicit alert / notification setting, legal/support draft clarity. |
| Redaction status | `PASS`: no raw API key, billing amount, account id, subscription id, project id, resource id, signed URL, storage path, raw provider response, provider voice id, or detailed usage amount is recorded. |

### OpenAI dashboard check - 2026-05-10

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Limits page visibility | `PASS` | Limits page was visible. No raw account id or API key recorded. |
| Monthly budget visibility | `PASS` | Monthly budget area was visible. No billing amount recorded. |
| Usage alert visibility | `PASS` | Usage alert area was visible. |
| Alert thresholds visibility | `PASS` | Alert thresholds were visible. |
| Rate limits visibility | `PASS` | Rate limits were visible. |
| Native Minute dedicated project | `WARN` | Default project remains in use. |
| Hard cap / app-side stop | `WARN` | Budget alert is visible; release owner accepts app-side limits and kill switch operations for small-cohort Web beta. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_OPENAI=1`. |

### ElevenLabs dashboard check - 2026-05-10

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Usage / credits visibility | `PASS` | Usage / credits were visible. No detailed billing amount recorded. |
| Billing / plan visibility | `PASS` | Billing / plan area was visible. |
| Auto recharge status visibility | `PASS` | Auto recharge status was visible. |
| Request analytics visibility | `PASS` | Request analytics were visible. Raw provider request body was not recorded. |
| Successful request visibility | `PASS` | Successful request visibility was confirmed without recording request ids or provider voice ids. |
| Explicit alert / notification setting | `WARN` | Explicit alert / notification setting is not confirmed. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`. |

### Azure pronunciation live smoke - 2026-05-11

| Item | Result | Safe Evidence |
| --- | --- | --- |
| `record -> evaluate -> review` | `PASS` | Human browser smoke reached review without an error screen. No raw audio, key, endpoint, audio id, or take id recorded. |
| `review -> progress` reflection | `PASS` | Progress reflected the latest result and also showed previous good/best result. No raw ids recorded. |
| Score display | `PASS` | Score was displayed. |
| Weak words display | `PASS` | Weak words were displayed. |
| Coach / next step display | `PASS` | Coach / next step was displayed. |
| Redaction boundary | `PASS` | Raw audio, Azure key, endpoint, subscription/resource id, signed URL, storage path, audio id, and take id are not recorded. |

### Azure dashboard check - 2026-05-10

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Azure subscription exists | `PASS` | Subscription exists. Raw subscription id not recorded. |
| Cost Management / billing area access | `PASS` | Cost Management / billing area was accessible. No billing amount recorded. |
| Azure upgrade decision | `PASS` | Upgrade to pay-as-you-go is done. Raw billing amount is not recorded. |
| Speech resource visibility | `PASS` | Speech resource visibility was confirmed. Raw resource id not recorded. |
| Region / resource confirmation | `PASS` | Region/resource confirmation was visible. Raw resource id and endpoint are not recorded. |
| Pricing tier visibility | `PASS` | Pricing tier visibility was confirmed. Billing amounts are not recorded. |
| Keys and Endpoint page visibility | `PASS` | Page visibility was confirmed. Key and endpoint values are not recorded. |
| Metrics / Usage / Quotas-like page visibility | `PASS` | Metrics / Usage / Quotas-like visibility was confirmed without recording quota details. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_AZURE=1`. |

### Supabase Storage dashboard check - 2026-05-10

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Required buckets visible | `PASS` | Required buckets were visible. No object keys or storage paths recorded. |
| Gate1b protected replay proof | `PASS` | Gate1b own replay / cross-user denial proof remains recorded separately without raw ids. |
| Storage usage visibility | `PASS` | Storage usage visibility was confirmed. No detailed usage amount recorded. |
| Egress / cached egress visibility | `PASS` | Egress / cached egress visibility was confirmed. |
| Plan / billing cycle visibility | `PASS` | Plan / billing cycle visibility was confirmed without recording billing details. |
| Upload kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`. |

## Recorded Gate1g Result - 2026-05-08

| Field | Value |
| --- | --- |
| Overall Gate1g result | `BLOCKED` |
| Primary blocker | Azure Speech resource / region / quota / usage visibility is blocked because the Speech resource is not currently visible in Microsoft Foundry / Speech service views. |
| Web beta implication | Deferred to `docs/human-check-backlog.md`; do not treat provider budget proof as complete until Azure Speech resource visibility and quota/usage monitoring are confirmed, or a human-approved alternative Azure monitoring path is documented. |
| Remaining WARN items | OpenAI dedicated project separation, OpenAI budget / alert final setting, ElevenLabs explicit alert / notification setting, Supabase Storage usage / egress visibility. |
| Redaction status | `PASS`: no raw API key, account id, subscription id, project id, resource id, signed URL, storage path, provider raw response, or detailed billing/usage amount is recorded. |

### OpenAI dashboard check - 2026-05-08

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Usage dashboard visible | `PASS` | Usage dashboard was available. No billing amount, account id, or raw key recorded. |
| API-key-level usage visible | `PASS` | Usage could be viewed by API key. Raw API key value was not recorded. |
| Native Minute project separation | `WARN` | Only the Default project was confirmed. A Native Minute dedicated project has not been separated yet. |
| Budget / alert final setting | `WARN` | Final budget / alert configuration has not been confirmed. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_OPENAI=1`. |
| Redaction boundary | `PASS` | Raw API key, billing amount, and account id are not recorded. |

### ElevenLabs dashboard check - 2026-05-08

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Dashboard access | `PASS` | Dashboard was accessible. No account id or raw key recorded. |
| API activity visibility | `PASS` | API activity could be viewed. No request body or raw response recorded. |
| Usage / credits visibility | `PASS` | Usage / credits were visible. No credit amount detail recorded. |
| API status visibility | `PASS` | API status was visible. No raw provider response recorded. |
| Recent text-to-speech request visibility | `PASS` | Recent TTS requests were visible. Request ids and provider payloads were not recorded. |
| Billing / plan visibility | `PASS` | Billing / plan area was visible. No billing amount detail recorded. |
| Quota / credits / model pricing visibility | `PASS` | Quota / credits / model pricing could be viewed. No pricing amount detail recorded. |
| Auto recharge status visibility | `PASS` | Auto recharge status could be viewed. No payment detail recorded. |
| Request log / analytics visibility | `PASS` | Request log / analytics visibility was available. No request id, provider voice id, or raw payload recorded. |
| Alert / notification | `WARN` | Explicit alert setting was not confirmed. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`. |

### Azure dashboard check - 2026-05-08

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Billing account / subscription visibility | `PASS` | Billing/subscription area was visible. Raw subscription id and billing amount were not recorded. |
| Azure subscription active | `PASS` | Subscription exists and is active. Raw subscription id was not recorded. |
| Cost Management access | `PASS` | Cost Management was accessible. No billing amount detail recorded. |
| Budget / cost alert final setting | `WARN` | Final budget / cost alert setting was not confirmed. |
| Speech resource visibility | `BLOCKED` | Azure Speech resource was not visible in Microsoft Foundry / Speech service views. Raw resource id was not recorded. |
| Region / quota / usage visibility | `BLOCKED` | Blocked until the Speech resource is visible. No region, quota, usage, or resource id detail recorded. |
| Kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_AZURE=1`. |
| Redaction boundary | `PASS` | Raw subscription id, resource id, and billing amount are not recorded. |

### Supabase Storage dashboard check - 2026-05-08

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Dashboard access | `PASS` | Supabase dashboard was accessible. Raw project ref was not recorded. |
| Required buckets visible | `PASS` | `voice-consents`, `voice-samples`, `script-audios`, and `recordings` were visible. Object keys and storage paths were not recorded. |
| File size limits visible | `PASS` | File size limit settings were visible. Detailed values were not recorded here. |
| Allowed MIME types visible | `PASS` | Allowed MIME type settings were visible. Detailed values were not recorded here. |
| Gate1b protected replay proof | `PASS` | Gate1b own replay / cross-user denial proof is recorded separately without raw ids. |
| Storage Analytics page reachable | `PASS` | Analytics page was reachable. |
| Storage usage / egress visibility | `WARN` | Analytics page showed analytics bucket creation flow rather than storage usage / egress dashboard. Detailed usage amounts were not recorded. |
| Dashboard health note | `WARN` | Supabase dashboard showed an active technical issue banner during the check. |
| Upload kill switch documented | `PASS` | Repo-side emergency pause is `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`. |
| Redaction boundary | `PASS` | Raw project ref, object keys, signed URLs, storage paths, and detailed usage amounts are not recorded. |

### OpenAI

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Budget / usage monitoring visible | `PASS / WARN / BLOCKED / FAIL` | Masked project/org ref only. |
| Alert recipient or owner assigned | `PASS / WARN / BLOCKED / FAIL` | Role/channel name, no private address if not approved. |
| Transcription surface understood | `PASS / WARN / BLOCKED / FAIL` | `record -> evaluate` only. |
| Script generation surface understood | `PASS / WARN / BLOCKED / FAIL` | `/scripts/new` AI draft only. |
| Kill switch documented | `PASS / WARN / BLOCKED / FAIL` | `NATIVE_MINUTE_DISABLE_OPENAI=1`. |
| Disabled app behavior checked | `PASS / WARN / BLOCKED / FAIL` | Safe message, no raw provider detail. |

### Azure Speech

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Speech resource / region identified | `PASS / WARN / BLOCKED / FAIL` | Masked resource ref only. |
| Budget / quota / alert visible | `PASS / WARN / BLOCKED / FAIL` | No billing amount detail. |
| Pronunciation evaluator surface understood | `PASS / WARN / BLOCKED / FAIL` | `record -> evaluate` only. |
| Kill switch documented | `PASS / WARN / BLOCKED / FAIL` | `NATIVE_MINUTE_DISABLE_AZURE=1`. |
| Disabled app behavior checked | `PASS / WARN / BLOCKED / FAIL` | Safe message, no raw Azure detail. |

### ElevenLabs

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Usage / quota / plan limit visible | `PASS / WARN / BLOCKED / FAIL` | Masked account ref only. |
| Alert or manual check owner assigned | `PASS / WARN / BLOCKED / FAIL` | Role/channel only. |
| Voice clone surface understood | `PASS / WARN / BLOCKED / FAIL` | `/setup/voice`. |
| Model audio generation surface understood | `PASS / WARN / BLOCKED / FAIL` | `/scripts/[id]/listen`. |
| Cache behavior considered | `PASS / WARN / BLOCKED / FAIL` | Cache hit proof can be separate; no audio ids. |
| Kill switch documented | `PASS / WARN / BLOCKED / FAIL` | `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`. |
| Disabled app behavior checked | `PASS / WARN / BLOCKED / FAIL` | No provider voice id or raw response. |

### Supabase Storage

| Item | Result | Safe Evidence |
| --- | --- | --- |
| Storage usage / egress monitoring visible | `PASS / WARN / BLOCKED / FAIL` | Masked project ref only. |
| Required buckets monitored | `PASS / WARN / BLOCKED / FAIL` | `recordings`, `script-audios`, `voice-samples`, `voice-consents`. |
| Gate1b protected replay proof remains PASS | `PASS / WARN / BLOCKED / FAIL` | Reference Gate1b proof, no raw ids. |
| Upload kill switch documented | `PASS / WARN / BLOCKED / FAIL` | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`. |
| Disabled app behavior checked | `PASS / WARN / BLOCKED / FAIL` | Upload blocked safely; replay unchanged. |

## Kill Switch Drill Record

| Surface | Env | Result | Safe Notes |
| --- | --- | --- | --- |
| OpenAI | `NATIVE_MINUTE_DISABLE_OPENAI=1` | `PASS / WARN / BLOCKED / FAIL / NOT TESTED` | No raw error details. |
| Azure | `NATIVE_MINUTE_DISABLE_AZURE=1` | `PASS / WARN / BLOCKED / FAIL / NOT TESTED` | No raw Azure details. |
| ElevenLabs | `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` | `PASS / WARN / BLOCKED / FAIL / NOT TESTED` | No provider voice ids. |
| Supabase Storage uploads | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` | `PASS / WARN / BLOCKED / FAIL / NOT TESTED` | No storage paths or signed URLs. |

## Decision

| Field | Value |
| --- | --- |
| Web beta decision | `GO / GO WITH WARNINGS / BLOCKED` |
| Recorded Web beta decision - 2026-05-11 update | `GO WITH WARNINGS`: release owner accepts remaining provider WARN items for small-cohort Web beta; Azure pronunciation live smoke is PASS; no deploy has been performed. |
| Recorded Web beta decision - 2026-05-10 update | `GO WITH WARNINGS` candidate: Azure Speech dashboard/resource blocker is resolved, but remaining WARN items require release-owner acceptance and no deploy has been performed. |
| Recorded Web beta decision - 2026-05-10 earlier | `BLOCKED`: Azure Speech resource / region / quota / usage visibility was unresolved, and Azure upgrade / Speech resource creation decision was deferred. |
| Recorded Web beta decision - 2026-05-08 | `BLOCKED`: Azure Speech resource / region / quota / usage visibility is unresolved. |
| Remaining blockers | None currently recorded in Gate1g. |
| Remaining warnings | OpenAI dedicated project separation, OpenAI app-side hard cap handled through app-side limits / kill switch operations, ElevenLabs alert/notification setting, legal/support draft clarity. |
| Owner | `app owner` |
| Next review date | `YYYY-MM-DD` |
