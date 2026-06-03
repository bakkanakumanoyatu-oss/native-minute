# Gate 5e Store Asset Capture Plan

Status: `plan_ready_human_review_required`

Gate 5e defines the Store asset capture plan for Native Minute v1 before App Store / Google Play submission work begins.

This is planning/template work only. It does not capture screenshots, generate images, create an app icon, operate App Store Connect, operate Google Play Console, submit App Privacy or Google Data Safety answers, run QA, rerun Gate 4h, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, change env/dashboard state, call provider APIs, introduce Capacitor, or implement Brush-up.

Brush-up remains deferred to v1.1. Do not show Brush-up, best-take provider submission, voice clone improvement, or script-scoped Brush-up voice variants as v1 functionality in assets, screenshots, captions, metadata, reviewer notes, privacy copy, support copy, or Store submission notes.

## Store Asset Capture Plan

| Asset / metadata | Gate 5e plan | Capture / finalization status |
| --- | --- | --- |
| Screenshots | Use the v1 main loop and legal/support surfaces below. Capture only with a safe demo or reviewer account. | `human_required` |
| App icon | Needs final brand/icon decision and asset generation outside this gate. | `human_required` |
| App name / subtitle | Use Gate 5b candidates until final Store owner decision. | `human_required` |
| Short description | Keep factual: one-minute English speaking practice. | `human_required` |
| Long description | Use Gate 5b draft as the source; no Brush-up v1 claim. | `human_required` |
| Preview captions | Use the safe caption pool below, then localize / legally review. | `human_required` |
| Support URL | Must point to final support surface. | `human_required` |
| Privacy URL | Must point to final public Privacy Policy. | `human_required` |
| Account deletion URL | Must point to final account deletion request/help path. | `human_required` |
| Reviewer account / instructions | Use Gate 5d draft after human account preparation. | `human_required` |

## Screenshot Candidate Set

Use safe demo content only. Do not capture full email addresses, auth ids, transcript bodies, full private scripts, raw recordings, raw provider responses, provider ids, signed URLs, Storage object keys, private audio paths, env values, billing details, reviewer password, or secrets.

| Candidate | Route / surface | Capture purpose | Store-safe angle |
| --- | --- | --- | --- |
| Home / practice entry | Home | Show the app as a one-minute practice loop. | Start a short speaking session. |
| Scripts | `/scripts` | Show selecting / resuming practice. | Pick today's short practice. |
| Script creation | `/scripts/new` | Show creating a short script. | Make a one-minute English script. |
| Listen | `/scripts/[id]/listen` | Show normal model audio / replay. | Listen before recording. |
| Record | `/scripts/[id]/record` | Show recording entry and notice. | Record your own take. |
| Review | `/scripts/[id]/review/[takeId]` | Show learning feedback and weak words. | See feedback as practice support. |
| Progress | `/progress` | Show latest / best continuity. | Track your latest and best takes. |
| Settings | `/settings` | Show account, support, legal, deletion request links. | Manage privacy and account help. |
| Privacy / Support / Account deletion | `/privacy`, `/support`, `/support/account-deletion` | Show public support/deletion surfaces if needed. | Find privacy, support, and deletion request info. |

## Recommended First Store Set

Minimum set:

1. Home / practice entry.
2. Script creation.
3. Listen.
4. Record.
5. Review.
6. Progress.

Add if Store slots, review strategy, and redaction allow:

- Scripts / practice library.
- Settings.
- Privacy / Support / Account deletion request path.

Common App Store / Google Play candidates:

- Home / practice entry.
- Script creation.
- Listen.
- Record.
- Review.
- Progress.

iPhone / Android capture check:

- Verify mobile viewport readability.
- Verify bottom audio controls do not hide important captioned content.
- Verify record controls and permission copy are visible without private content.
- Verify Review / Progress text is legible without exposing private transcript bodies.
- Verify Settings / legal links are reachable and not overclaiming deletion completion.

## Screenshot Caption Candidates

Use short captions. Final text and localization are `human_required`.

- `1分英語スクリプトを作る`
- `お手本を聞く`
- `自分の発音を録音する`
- `発音・流暢さ・リズムを確認`
- `弱点語と次の練習ポイントを見る`
- `最新結果とベスト結果を確認`

English working alternatives:

- `Create a one-minute English script`
- `Listen to model audio`
- `Record your take`
- `Check pronunciation, fluency, and rhythm`
- `Find weak words and the next practice point`
- `Compare latest and best takes`

## Store Claims to Avoid

Do not use:

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

Safer alternatives:

- `practice support`
- `learning feedback`
- `one-minute speaking loop`
- `normal model audio`
- `latest and best takes`
- `account deletion request path`

## Capture Preparation Checklist

These must be prepared before actual capture:

- Final app name.
- Final subtitle.
- Final short description / long description source.
- Final support URL.
- Final Privacy Policy URL.
- Final account deletion request URL.
- Final Terms URL if used.
- Reviewer account safe alias.
- Clean demo account or safe reviewer account.
- Safe demo script with no private content.
- Redaction rule for screenshots and evidence.
- Mobile viewport / device selection for App Store and Google Play.
- Platform-specific screenshot sizes and device frames.
- Decision on whether Settings / deletion request screenshots are included.
- Final legal approval for captions and Store claims.

Do not show in screenshots:

- full email addresses;
- reviewer password;
- auth user ids;
- transcript bodies;
- full private scripts;
- raw recordings;
- private user audio;
- raw provider responses;
- provider dashboard or billing data;
- env values;
- API keys;
- private Storage paths or object keys;
- signed URLs;
- provider voice ids;
- actual deletion proof before it exists;
- Brush-up v1 claims.

## Screenshot Capture Evidence Template

Record only safe fields:

| Field | Allowed values / guidance |
| --- | --- |
| `asset_id` | Operator-generated safe alias. |
| `screen` | `home`, `scripts`, `script_creation`, `listen`, `record`, `review`, `progress`, `settings`, `privacy_support_deletion`. |
| `environment` | `local`, `production_web`, `mobile_browser`, `native_review_build`, or `unknown`. |
| `account_type` | `demo`, `reviewer`, `owner`, or `unknown`; no email/auth id. |
| `safe_caption` | Final or draft caption without risky claims. |
| `contains_personal_data` | boolean; must be `false` for Store-ready asset. |
| `redaction_required` | boolean. |
| `v1_scope_ok` | boolean. |
| `brush_up_claim_absent` | boolean; must be `true`. |
| `approved_for_store_submission` | `false`, `pending_human_review`, or `true_after_human_approval`. |
| `notes` | Safe notes only; no private data. |

## Human Required

- Final screenshot capture.
- App icon creation.
- Final app name.
- Final subtitle.
- Final short description.
- Final long description.
- Final legal approval.
- Final support URL.
- Final Privacy Policy URL.
- Final account deletion request URL.
- Final Terms URL if used.
- Reviewer account.
- Demo script.
- Clean demo account.
- Device / screenshot size selection.
- App Store specific asset requirement check.
- Google Play specific asset requirement check.
- Final redaction review.
- Final confirmation that Brush-up is absent from v1 assets.

## Non-Capture Boundary

Gate 5e did not:

- capture screenshots;
- generate images;
- create app icons;
- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Data Safety answers;
- run QA;
- rerun Gate 4h;
- target real, reviewer, or disposable accounts;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- call provider cleanup;
- change env or dashboards;
- introduce Capacitor;
- implement Brush-up.
