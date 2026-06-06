# Gate 5f Store Asset Capture Readiness Check

Status: `readiness_check_complete_capture_not_ready_human_required`

Gate 5f checks whether Native Minute v1 is ready to move from Store asset planning into actual screenshot capture, app icon creation, and Store asset finalization.

This is a readiness check only. It does not capture screenshots, generate images, create an app icon, operate App Store Connect, operate Google Play Console, submit App Privacy or Google Data Safety answers, introduce Capacitor, run QA, rerun Gate 4h, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, change env/dashboard state, call provider APIs, connect voice providers, or implement Brush-up.

Gate 0 auth callback production smoke is a prerequisite and is now `PASS`: production latest deploy includes `0bd55b4 Fix auth callback login redirect handling`, `/login` opens, new email login works, `/scripts` and `/progress` are usable for a clean new account, refresh keeps the session, logout -> new magic link -> login works, and the prior `callback_failed` / `/login` 404 / `/_next/static` 404 chain is resolved.

Brush-up remains deferred to v1.1. Store assets, captions, reviewer notes, screenshots, metadata, privacy copy, support copy, and Store submission notes must not claim Brush-up, best-take provider submission, voice clone improvement, script-scoped voice material, or Brush-up-specific generated audio as v1 functionality.

## Readiness Matrix

| Area | Readiness status | Notes |
| --- | --- | --- |
| Gate 0 auth smoke prerequisite | `ready` | Production human smoke PASS is recorded in `outputs/store_release_gate0_auth_callback_production_human_smoke/`. |
| Screenshot candidate set | `ready` | Gate 5c / 5e define Home, script creation, listen, record, review, progress, plus optional scripts/settings/legal surfaces. |
| Screenshot capture | `human_required` | Actual capture needs final account, demo script, device selection, redaction review, and final Store copy decisions. |
| App icon | `not_started` | Final brand/icon decision and asset creation are outside Gate 5f. |
| App name / subtitle | `human_required` | Use Gate 5b candidates only until release owner finalizes. |
| Short description | `human_required` | Draft direction exists; final text requires human/legal approval. |
| Long description | `human_required` | Gate 5b draft is source material only. |
| Screenshot captions | `human_required` | Safe caption pool exists; final captions need localization and legal review. |
| Support URL | `human_required` | Must point to final public support surface before Store submission. |
| Privacy URL | `human_required` | Must point to final public Privacy Policy. |
| Account deletion URL | `human_required` | Must point to final account deletion request/help path without overclaiming actual deletion completion. |
| Reviewer account | `human_required` | Gate 5d has placeholder only; no credentials belong in repo/docs/outputs. |
| Clean demo account | `human_required` | Needed before capture to avoid private data and stale account state. |
| Demo script | `human_required` | Must be short, neutral, non-private, and safe for screenshots/review. |
| Redaction rule | `ready` | Do not capture full emails, auth ids, transcript bodies, private scripts, raw recordings, Storage paths, signed URLs, provider ids, secrets, env values, or billing details. |
| Mobile viewport / device selection | `human_required` | iPhone / Android sizes and device framing need final platform-specific decision. |
| Platform-specific asset requirements | `not_started` | App Store / Google Play current asset sizes and console requirements need human/platform check before capture. |
| Store claim safety boundary | `ready` | Claims-to-avoid are defined by Gate 5b / 5c / 5e and repeated below. |
| Brush-up v1.1 deferral boundary | `ready` | Brush-up is excluded from v1 Store assets. |

## Ready Items

- Gate 0 production auth smoke prerequisite.
- v1 screenshot candidate surfaces.
- Minimum screenshot set definition: Home / practice entry, script creation, listen, record, review, progress.
- Optional screenshot surfaces: Scripts, Settings, Privacy / Support / Account deletion request path.
- Safe caption candidate pool.
- Redaction rule.
- Screenshot capture evidence template.
- v1 scope boundary.
- Brush-up v1.1 defer boundary.
- Store claim safety list.

## Human Required Items

- Final screenshot capture.
- Final app name.
- Final subtitle.
- Final short description.
- Final long description.
- Final screenshot captions and localization.
- Final support URL.
- Final Privacy Policy URL.
- Final account deletion request URL.
- Final Terms URL if used.
- Reviewer account and safe alias.
- Clean demo account.
- Safe demo script.
- Mobile viewport / device selection.
- App Store specific asset requirement check.
- Google Play specific asset requirement check.
- Final legal / support approval.
- Final redaction review.
- Final confirmation that Brush-up is absent from v1 assets.

## Blocked / Not Started

- Actual screenshot capture is blocked until the human-required items above are ready.
- App icon creation is not started.
- Platform-specific screenshot size / device frame decisions are not started.
- Store Console asset upload is not started.
- App Privacy / Google Data Safety final console answers remain outside this gate.
- Capacitor / native packaging is not started by Gate 5f.
- Gate 4h disposable account dry-run proof remains blocked on human disposable account preparation.
- Actual account deletion proof remains outside this gate.

## Conditions To Enter Screenshot Capture

Actual screenshot capture can start only when all of these are true:

- Final app name / subtitle / description direction is approved for capture.
- Support URL, Privacy URL, Terms URL if used, and account deletion request URL are final enough for screenshots and reviewer notes.
- Reviewer or clean demo account exists and contains no private data.
- Safe demo script exists and is short, neutral, non-private, and not copyrighted.
- Target viewport / device sizes are selected for App Store and Google Play.
- Store claim safety list has been reviewed by the release owner.
- Redaction rule is accepted by the person capturing assets.
- Brush-up remains absent from screenshots, captions, metadata, and reviewer notes.
- Account deletion is described as request/help path unless actual deletion proof is later completed and approved.

## Conditions That Block Capture

Do not start capture if any of these are true:

- Final Store name / subtitle / captions require unresolved legal judgment.
- Support URL, Privacy URL, or account deletion URL is unknown and must appear in screenshots or metadata.
- Reviewer account, clean demo account, or demo script is missing.
- Screenshots would expose full email, auth id, transcript body, private script, raw recording, private audio path, Storage object key, signed URL, provider id, env value, secret, or billing detail.
- Any screenshot, caption, metadata, or reviewer note would imply Brush-up is available in v1.
- Any copy would imply guaranteed improvement, perfect pronunciation scoring, native-speaker replacement, medical/institutional assessment, or complete account deletion before proof.
- Capture would require Store Console operation, App Store Connect operation, Google Play Console operation, provider API calls, dashboard/env changes, DB/schema changes, destructive cleanup, Capacitor, or voice provider work.

## Store Claim Safety

Avoid these claims in v1 assets:

- `ネイティブになる`
- `必ず上達`
- `完全な発音判定`
- `医療・教育機関レベル`
- `official ability assessment`
- `perfect pronunciation scoring`
- `native speaker replacement`
- `Brush-up is available in v1`
- `voice clone improvement is available in v1`
- `best take becomes voice material in v1`
- `account deletion is fully complete` before disposable proof and destructive path approval
- `native app` before Capacitor/native packaging is complete and reviewed

Safer directions:

- `one-minute speaking practice`
- `model audio`
- `learning feedback`
- `practice support`
- `latest and best takes`
- `account deletion request path`

## Non-Execution Boundary

Gate 5f did not:

- capture screenshots;
- generate images;
- create app icons;
- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Data Safety answers;
- introduce Capacitor;
- run QA;
- rerun Gate 4h;
- target real, reviewer, demo, or disposable accounts;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- call provider cleanup;
- change env or dashboards;
- connect voice providers;
- implement Brush-up.
