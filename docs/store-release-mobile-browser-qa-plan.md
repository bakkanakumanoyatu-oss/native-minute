# Store Release Mobile Browser QA Plan

Status: `plan_ready_with_iphone_safari_pass`

This plan prepares mobile browser QA for the v1 Store release path. It is a checklist and evidence template only.

It does not execute QA, send magic links, log into reviewer accounts, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB cleanup, execute provider cleanup, operate Store Console, capture screenshots, create app icons, introduce Capacitor, call providers, or change env/dashboard settings.

Brush-up remains deferred to v1.1 and must not appear in v1 mobile QA claims, Store copy, screenshots, reviewer instructions, or support copy.

## Human QA Result: iPhone Safari

Status: `PASS`

Human-run production mobile QA on iPhone Safari passed with a clean demo account context.

| Area | Result |
| --- | --- |
| login | `PASS` |
| scripts | `PASS` |
| five-slot management | `PASS` |
| script creation | `PASS` |
| listen audio | `PASS` |
| record microphone / upload | `PASS` |
| review playback | `PASS` |
| progress | `PASS` |
| settings / legal pages | `PASS` |
| notes | `none` |

The run did not execute actual deletion, Auth deletion, Storage deletion, DB cleanup, provider cleanup, Store Console work, screenshot capture, app icon creation, Capacitor work, provider API calls by Codex, env/dashboard operation, reviewer relogin, or magic-link resend by Codex.

## Scope

Mobile browser QA should verify the Web core before native packaging:

- login / logout / magic link;
- Home / Practice / Scripts;
- five-slot management;
- script creation;
- Listen / audio playback;
- Record / microphone / upload;
- Review / saved recording playback;
- Progress;
- Settings;
- Privacy / Terms / Support / Account deletion;
- small-screen layout and text fit;
- Safari / Chrome differences;
- provider failure / upload failure copy;
- Store claim safety and public copy.

## Device Matrix

| Target | Required? | Main purpose | Notes |
| --- | --- | --- | --- |
| iPhone Safari | Required | Primary iOS mobile browser smoke, including microphone permission, audio playback, auth callback, and small-screen layout. | Treat as the highest-risk WebView-adjacent path before Capacitor. |
| iPhone Chrome | Recommended | Same iOS browser engine with Chrome UI differences and auth/link handoff differences. | Helps catch URL bar / viewport / magic-link handoff differences. |
| Android Chrome | Required | Primary Android mobile browser smoke, including microphone permission, upload, audio playback, and layout. | Use a clean browser profile/session when possible. |
| Desktop responsive fallback | Optional | Planning/debug backup only. | Do not treat as mobile PASS evidence. |

## Pre-Run Setup

Before human execution:

1. Confirm the production URL and intended build are current.
2. Choose the account context:
   - clean demo account for main loop / five-slot / progress;
   - reviewer account only after reviewer verification is ready;
   - disposable account only for account deletion request / safe summary, never for screenshots or main demo flow.
3. Confirm the device/browser label can be recorded safely without private identifiers.
4. Confirm no screenshot capture is required for this QA run.
5. Confirm no Store Console, Capacitor, provider dashboard, or env operation is part of the run.
6. Keep evidence to safe status, route labels, and issue summaries only.

Do not record full email, auth user id, cookies, tokens, Storage keys, Storage full paths, transcript bodies, raw audio, provider raw responses, provider ids, secrets, env values, or private account details.

## iPhone Safari Checklist

| Area | Steps | Expected result | Status template |
| --- | --- | --- | --- |
| Login / auth callback | Open production URL, go to login, complete magic-link login using the chosen safe account. | User reaches `/scripts`; no `callback_failed`, `/login` 404, or static asset 404 chain. | `pass / fail / blocked / human_required` |
| Session refresh | Refresh `/scripts` and `/progress`. | Session remains valid and protected pages render. | `pass / fail / blocked` |
| Logout / re-login | Log out, then complete a fresh login only if human approves sending a link. | Logout clears session; re-login reaches `/scripts`. | `pass / fail / blocked / human_required` |
| Home / Scripts | Open Home and `/scripts`. | Main actions fit on screen and no content overlaps. | `pass / fail / blocked` |
| Five-slot management | In a prepared account, confirm five-slot full state, organize-stock link, delete action visibility, confirmation UI, reopened slot, and new script after deletion. | Slot management works and `/progress` stays intact. | `pass / fail / blocked / not_applicable` |
| Script creation | Create or duplicate a safe script. | User reaches Listen or clear next step; five-slot limit is respected. | `pass / fail / blocked` |
| Listen audio | Play generated or cached model audio. | Audio starts after user gesture; controls fit; protected replay works. | `pass / fail / blocked` |
| Record | Grant microphone permission and record a short safe take. | Recording starts/stops; too-short recovery copy is understandable. | `pass / fail / blocked / human_required` |
| Upload fallback | If available and approved, choose a safe local audio file. | Upload path does not expose private path and gives clear status. | `pass / fail / blocked / not_applicable` |
| Evaluate / Review | Evaluate the take and open Review. | Review renders saved score/feedback and does not overclaim assessment accuracy. | `pass / fail / blocked` |
| Saved recording playback | Play saved recording from Review. | Authenticated playback works without exposing private path. | `pass / fail / blocked` |
| Progress | Open `/progress` for selected script. | Latest / best / saved recordings display correctly after mobile flow. | `pass / fail / blocked` |
| Settings / legal | Open Settings, Privacy, Terms, Support, Account deletion. | Routes load, copy is user-facing, no deletion-complete claim. | `pass / fail / blocked` |
| Provider / upload failure copy | Observe any provider/upload failure if it naturally occurs. Do not force env changes. | Error copy is safe, short, and does not expose raw provider responses. | `pass / fail / blocked / not_applicable` |

## iPhone Chrome Checklist

Run the iPhone Safari checklist in a lighter pass:

- login / auth callback;
- session refresh;
- Home / Scripts layout;
- Listen playback;
- Record permission and stop flow;
- Review saved recording playback;
- Progress;
- Settings / legal / account deletion route loading;
- no Brush-up v1 claim or deletion-complete claim.

Pay special attention to magic-link handoff and viewport changes caused by browser chrome.

## Android Chrome Checklist

| Area | Steps | Expected result | Status template |
| --- | --- | --- | --- |
| Login / auth callback | Open production URL and complete magic-link login with a safe account. | User reaches `/scripts`; no callback/static asset failure chain. | `pass / fail / blocked / human_required` |
| Session refresh / logout | Refresh protected routes and log out. | Session behavior matches desktop smoke. | `pass / fail / blocked` |
| Home / Scripts layout | Open Home and `/scripts`. | Text fits; primary buttons are reachable; no overlap. | `pass / fail / blocked` |
| Five-slot management | Confirm the same stock management path if the account is prepared. | Delete confirmation, reopened slot, and new script creation work. | `pass / fail / blocked / not_applicable` |
| Script creation | Create a safe script. | v1 flow moves to Listen or a clear next step. | `pass / fail / blocked` |
| Listen audio | Play model audio. | Playback works after user gesture; controls remain visible. | `pass / fail / blocked` |
| Record / microphone | Grant permission and record. | Recording can be evaluated or gives safe recovery. | `pass / fail / blocked / human_required` |
| Upload fallback | If approved, test safe file upload. | No private local path appears in UI/evidence. | `pass / fail / blocked / not_applicable` |
| Review / playback | Evaluate and play saved recording. | Review and authenticated playback work. | `pass / fail / blocked` |
| Progress | Open `/progress`. | Latest / best continuity is intact. | `pass / fail / blocked` |
| Settings / legal | Open Settings, Privacy, Terms, Support, Account deletion. | User-facing copy remains clear and non-destructive. | `pass / fail / blocked` |

## Evidence Template

Use this template for each device/browser run:

| Field | Safe value guidance |
| --- | --- |
| `run_id` | Safe alias, not a user id. |
| `run_date` | Date or timestamp. |
| `environment` | `production_web_mobile_browser`, `local_mobile_browser`, or `unknown`. |
| `device_family` | `iphone`, `android`, or `desktop_fallback`; no serial number. |
| `browser` | `safari`, `chrome`, or `unknown`. |
| `account_context` | `clean_demo`, `reviewer`, `disposable`, `owner`, or `unknown`; no email. |
| `route_or_feature` | Safe route / feature label. |
| `result` | `pass`, `fail`, `blocked`, `human_required`, or `not_applicable`. |
| `issue_summary` | Short safe summary only. |
| `redaction_status` | `pass`, `warn`, or `fail`. |
| `store_claim_safety` | `pass`, `warn`, or `fail`. |
| `actual_deletion_executed` | Always `false` for this QA plan. |
| `provider_api_called_by_codex` | Always `false` for this QA plan. |
| `screenshot_captured` | `false` unless a later screenshot gate explicitly approves it. |
| `next_action` | Safe next step label. |

## Human Required / Blocker

### Human Required

- Physical or approved remote iPhone / Android device access.
- Human-approved safe account selection.
- Any magic-link send or resend.
- Microphone permission decision.
- Optional upload fallback file selection.
- Final reviewer account verification.
- Any production-safe provider failure or kill-switch operation proof.
- Any screenshot capture or Store asset capture.

### Blocker

- Login cannot reach `/scripts` on mobile.
- Refresh breaks session on protected pages.
- Microphone cannot record or recover safely.
- Audio playback cannot start after user gesture on required mobile browsers.
- Five-slot management cannot free a slot and recreate a script.
- `/progress` breaks after mobile record/evaluate or script delete/recreate.
- Privacy / Terms / Support / Account deletion routes do not load.
- Public copy implies actual deletion has already completed.
- Evidence would require recording private identifiers, raw provider output, transcript body, raw audio, tokens, cookies, or Storage paths.

## Store Claim Safety

Mobile QA must confirm public copy does not claim:

- guaranteed improvement;
- perfect pronunciation assessment;
- medical or institutional assessment;
- Brush-up as a v1 feature;
- voice clone improvement as a v1 feature;
- best take provider submission as v1 behavior;
- actual deletion is complete before a separately approved destructive proof.

## Non-Execution Boundary

This plan did not:

- run mobile QA;
- send or resend magic links;
- log into reviewer accounts;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- call provider APIs;
- operate Store Console;
- capture screenshots;
- create app icons;
- introduce Capacitor;
- change env or dashboard settings.
