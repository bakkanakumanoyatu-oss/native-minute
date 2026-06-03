# Gate 5c Screenshot Candidate Plan / Reviewer Evidence Template

Status: `plan_ready_human_review_required`

Gate 5c defines the screenshot candidate set and reviewer evidence template for Native Minute v1 before App Store / Google Play submission work begins.

This is planning/template work only. It does not capture screenshots, generate images, operate App Store Connect, operate Google Play Console, submit App Privacy or Google Data Safety answers, introduce Capacitor, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, change env/dashboard state, call provider APIs, or implement Brush-up.

Brush-up remains deferred to v1.1. Do not show Brush-up, best-take voice material, voice clone improvement, or script-scoped Brush-up voice variants as v1 functionality in screenshots, captions, reviewer evidence, metadata, support copy, or privacy/data-safety notes.

## Screenshot Candidate Set

Use a safe demo or reviewer account only. Screenshots must not show full email addresses, auth ids, private transcript bodies, private script text, raw recordings, raw provider responses, provider ids, signed URLs, Storage object keys, private audio paths, env values, billing details, or secrets.

| Candidate | Route / surface | Screenshot focus | Safe caption direction | Status |
| --- | --- | --- | --- | --- |
| Home / practice entry | Home | Main practice entry and one-minute loop positioning. | `Start a one-minute English practice loop.` | `candidate` |
| Practice library | `/scripts` | Pick or resume a practice script. | `Choose today's short speaking practice.` | `candidate` |
| Script creation | `/scripts/new` | Create a short script or use a safe demo template. | `Make a short script for one focused practice.` | `candidate` |
| Listen | `/scripts/[id]/listen` | Normal model audio and protected replay. | `Listen to model audio before recording.` | `candidate` |
| Record | `/scripts/[id]/record` | Record a practice take and see recording/provider notice. | `Record your take when you are ready.` | `candidate` |
| Review | `/scripts/[id]/review/[takeId]` | Learning feedback, weak words, and next practice point. | `Review feedback as learning support.` | `candidate` |
| Progress | `/progress` | Latest / best take continuity and progress reflection. | `Compare your latest and best takes.` | `candidate` |
| Settings / legal links | `/settings` | Privacy, Terms, Support, and deletion request links. | `Manage privacy, support, and account help.` | `candidate_optional` |
| Support / deletion path | `/support/account-deletion` | Account deletion request path without actual deletion claim. | `Find the account deletion request path.` | `candidate_optional` |

Recommended first Store set for human review:

1. Home / practice entry.
2. Script creation.
3. Listen.
4. Record.
5. Review.
6. Progress.

Optional if Store slots allow:

- Settings / legal links.
- Support / account deletion request path.

## Caption / Message Candidate Pool

Keep captions factual and v1-scoped:

- `1-minute English practice`
- `Create a short speaking script`
- `Listen to model audio`
- `Record your take`
- `Check pronunciation, fluency, and rhythm`
- `Find weak words and the next practice point`
- `Track latest and best takes`
- `Review privacy, support, and account options`

Japanese working notes for the release owner:

- `1分英語スクリプト`
- `聞く`
- `録る`
- `発音・流暢さ・リズムを確認`
- `弱点語と次の練習ポイント`
- `進捗確認`

Final captions are `human_required` and must match the final screenshots, platform rules, localization plan, and legal/support review.

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
- `account deletion is complete` before disposable proof and destructive path approval

Safer alternatives:

- `practice support`
- `learning feedback`
- `one-minute speaking loop`
- `model audio`
- `latest and best takes`
- `account deletion request path`
- `human review required`

## Reviewer Evidence Template

Reviewer evidence is a safe operation guide and proof package for Store review preparation. It is not the same as internal release QA evidence.

### Safe Fields

| Field | Safe value guidance |
| --- | --- |
| `evidence_id` | Operator-generated safe alias. |
| `prepared_for` | `app_store_review`, `google_play_review`, or `both`. |
| `reviewer_account_status` | `human_required`, `ready`, `blocked`, or `not_applicable`. |
| `reviewer_account_safe_alias` | Alias only; no full email or auth id. |
| `build_or_url` | Production URL or build label; no private token. |
| `login_flow_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `script_creation_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `listen_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `record_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `evaluate_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `review_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `progress_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `privacy_terms_support_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `account_deletion_request_status` | `pass`, `warn`, `blocked`, or `human_required`. |
| `provider_failure_recovery_status` | `pass`, `warn`, `blocked`, `not_applicable`, or `human_required`. |
| `brush_up_expected_in_v1` | Must be `false`. |
| `redaction_status` | `pass`, `warn`, or `fail`. |
| `next_action` | Safe next action label. |

### Reviewer Flow Draft

1. Open the production URL or native review build URL supplied by the release owner.
2. Sign in with the provided reviewer account.
3. Open `/scripts`.
4. Create a short practice script from `/scripts/new`, or use a pre-created reviewer script.
5. Open listen and play or generate normal model audio.
6. Open record and create a short practice recording.
7. Run evaluation.
8. Open review and confirm learning feedback appears.
9. Open progress and confirm latest / best continuity.
10. Open `/settings`.
11. Confirm Privacy Policy, Terms, Support, and account deletion request/help are reachable.
12. Do not expect Brush-up in v1.

### Provider Failure / Kill Switch Recovery Note

Reviewer evidence should explain that provider-disabled proof is operator-only. Store reviewers should not need provider dashboard access, env access, billing access, or API keys. If a provider is unavailable during review, the app should show safe recovery copy without secrets, raw provider responses, private audio paths, Storage object keys, provider ids, transcript bodies, or env values.

### Account Deletion Review Note

v1 exposes account deletion request, confirmation, dry-run, and proof-first surfaces. Do not claim actual deletion completion until disposable proof and destructive path approval are complete. If live deletion proof is requested, use a disposable account only and follow the later Gate 4h / destructive proof gates.

## QA Evidence vs Store Reviewer Evidence

| Evidence type | Audience | Purpose | Safe content |
| --- | --- | --- | --- |
| Internal QA evidence | release owner / operators | Prove behavior before release decisions. | pass/warn/blocked status, safe counts, safe route labels, redaction checks, blocker codes. |
| Store reviewer evidence | App Store / Google Play reviewers | Explain how to review the app safely. | reviewer account instructions, v1 route flow, provider recovery note, privacy/support/deletion paths. |

Internal QA evidence can include more operational status, but still must not include private data. Store reviewer evidence should be shorter, action-oriented, and free of provider internals, dashboard details, private account identifiers, raw content, and implementation-only notes.

## Human Required

- Final screenshots.
- App icon.
- Final app name.
- Final subtitle / short description.
- Final screenshot captions and localization.
- Reviewer account and reviewer account safe alias.
- Final reviewer instructions.
- Support URL.
- Privacy Policy URL.
- Account deletion request URL.
- Terms URL if used.
- Legal approval for Store copy and screenshots.
- Final platform-specific screenshot sizes and device frames.
- Final confirmation that screenshots contain no private data.
- Final confirmation that Brush-up is absent from v1 screenshots and reviewer notes.

## Non-Capture Boundary

Gate 5c did not:

- capture screenshots;
- generate images;
- create app icons;
- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Data Safety answers;
- introduce Capacitor;
- run QA;
- rerun Gate 4h;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- call provider cleanup;
- change env or dashboards;
- implement Brush-up.
