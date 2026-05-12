# Human Check Backlog

This backlog tracks release-readiness items that require human dashboard, billing, legal, support, or policy review. Do not mark these items as PASS from code inspection alone.

## Rules

- Keep unverified items as `WARN` or `BLOCKED`.
- Resolve these in the final human-check batch before Web beta.
- Do not record raw API keys, billing amounts, account ids, subscription ids, project ids, resource ids, signed URLs, storage paths, object keys, raw provider responses, raw audio, or private email addresses unless explicitly approved for support contact publication.
- Record only status, checked date, reviewer/role, masked references, and safe notes.

## Backlog Items

| ID | Area | Item | Current status | Why it is deferred | Exit condition |
| --- | --- | --- | --- | --- | --- |
| HCB-001 | Gate1g / Azure | Azure Speech resource visibility | `PASS` | Speech resource visibility, region/resource confirmation, pricing tier visibility, Keys and Endpoint page visibility, subscription visibility, Cost Management / billing access, and kill switch were confirmed without recording raw subscription id, resource id, key, endpoint, or billing amount. Upgrade to pay-as-you-go is done. | Recheck before broader public launch or after Azure resource changes. |
| HCB-002 | Gate1g / Azure | Azure region / quota / usage visibility | `PASS` | Metrics / Usage / Quotas-like page visibility was confirmed without recording raw resource id, endpoint, key, quota detail, or billing amount. | Recheck during release-candidate proof or after Azure resource changes. |
| HCB-003 | Gate1g / OpenAI | Native Minute dedicated OpenAI project separation | `WARN` | Only the Default project was confirmed. Release owner accepts Default project for small-cohort Web beta; a dedicated Native Minute project remains a pre-public / scale-up improvement. | Recheck before broader public launch or when usage grows. |
| HCB-004 | Gate1g / OpenAI | OpenAI budget / alert final setting | `WARN` | Usage, limits, monthly budget, alerts, thresholds, and rate limits were visible. Release owner accepts app-side limits plus `NATIVE_MINUTE_DISABLE_OPENAI=1` as Web beta mitigation; provider-side hard cap is not treated as guaranteed. | Add or confirm app-side quota / usage limits before broader public launch. |
| HCB-005 | Gate1g / ElevenLabs | Explicit alert / notification setting | `WARN` | Dashboard, usage, billing/plan, quota/credits, auto recharge, request activity, and successful request visibility were confirmed, but explicit alert/notification setting is not confirmed. Release owner accepts app-side limits, cache reuse, manual monitoring, and `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` for Web beta. | Confirm alert/notification or stronger app-side quota before broader public launch. |
| HCB-006 | Gate1g / Supabase Storage | Storage usage / egress visibility | `PASS` | Storage usage, egress / cached egress, plan / billing cycle visibility were confirmed without recording raw project refs, object keys, signed URLs, storage paths, or detailed usage amounts. | Recheck during release-candidate proof or after dashboard changes. |
| HCB-007 | Gate1f / Support | Public support contact | `PASS` | Web beta support contact is confirmed as `bakkanakuma@gmail.com`; this is intentionally public support contact information. | Recheck before formal public launch / Store submission. |
| HCB-008 | Gate1f / Account deletion | Account deletion SLA and manual cleanup owner | `PASS` | First response target is 3 business days, completion target is 30 days, and manual cleanup owner is app owner. | Recheck before Store submission and before actual destructive completion path is exposed. |
| HCB-009 | Gate1e / Legal draft | Privacy / Terms / Support / account deletion draft review | `WARN` | Drafts mostly match implementation and provider roles, but copy clarity needs improvement and deletion SLA was not visible before this update. Formal legal review is not complete. | Improve beta copy clarity; do not treat as formal legal approval. |
| HCB-010 | Gate1 / Azure | Post-confirmation Azure pronunciation live smoke | `PASS` | Human browser smoke confirmed `record -> evaluate -> review -> progress` with Azure pronunciation evaluator after Azure resource confirmation. Score, weak words, coach / next step, and progress reflection were visible; raw audio, keys, endpoints, and raw ids were not recorded. | Recheck after provider/env changes or before broader public launch. |

## Final Human-Check Batch Result - 2026-05-10

Overall Web beta decision is now `GO WITH WARNINGS`.

There are no remaining Final Human Check `BLOCKED` items after the Azure update and Gate1l owner acceptance. Release / deploy / rollback / incident / post-deploy smoke / provider monitoring / support-deletion owner is app owner. No production deploy has been performed.

PASS:

- Support contact is confirmed for Web beta.
- Account deletion first response target is 3 business days.
- Account deletion completion target is 30 days.
- Manual cleanup owner is app owner.
- OpenAI limits, monthly budget, usage alert, alert threshold, and rate limit visibility were confirmed.
- ElevenLabs usage / credits, billing / plan, auto recharge status, request analytics, and successful request visibility were confirmed.
- Supabase Storage required buckets, usage, egress / cached egress, plan / billing cycle, upload kill switch, and Gate1b protected replay proof were confirmed.
- Azure Speech resource visibility, region/resource confirmation, pricing tier visibility, Keys and Endpoint page visibility, Metrics / Usage / Quotas-like page visibility, Azure subscription visibility, Cost Management / billing access, upgrade to pay-as-you-go, and kill switch were confirmed.
- Azure pronunciation live smoke passed through `record -> evaluate -> review -> progress` in a human browser check.

WARN:

- OpenAI remains on Default project, accepted by the release owner for small-cohort Web beta.
- OpenAI has visible budget/alerts, but app-side hard cap is handled through app-side limits and kill switch operations rather than guaranteed provider-side stop.
- ElevenLabs explicit alert / notification setting is not confirmed; release owner accepts app-side limits, cache reuse, manual monitoring, and kill switch operations for Web beta.
- `/privacy`, `/terms`, `/support`, and `/support/account-deletion` are Web beta drafts and need clarity improvement / formal review before broader release.

BLOCKED:

- None currently recorded in the Final Human Check Backlog. Do not convert remaining `WARN` items to `PASS` without proof.

Redaction status: no raw API key, billing amount, account id, subscription id, project id, resource id, signed URL, storage path, raw user id, audio id, or take id is recorded.

## Final Human-Check Batch

Before Web beta, review this backlog together with:

- `docs/gate1j-final-human-check-batch-runbook.md`
- `docs/gate1g-provider-budget-kill-switch-proof-template.md`
- `docs/gate1i-web-beta-release-candidate-proof-template.md`
- `docs/gate1f-web-beta-manual-qa-runbook.md`
- `docs/gate1b-production-supabase-spot-check-proof-template.md`
- public draft routes: `/privacy`, `/terms`, `/support`, `/support/account-deletion`

The final batch can pass Web beta only when all `BLOCKED` items are resolved or explicitly accepted by the human release owner with a documented fallback.
