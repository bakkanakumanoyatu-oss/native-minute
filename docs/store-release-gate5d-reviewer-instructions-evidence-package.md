# Gate 5d Reviewer Instructions / Evidence Package Draft

Status: `draft_ready_human_review_required`

Gate 5d turns the Gate 5b / Gate 5c reviewer notes into a more practical reviewer instruction draft and evidence package shape for Native Minute v1.

This is draft/template work only. It does not create reviewer accounts, record reviewer credentials, operate App Store Connect, operate Google Play Console, capture screenshots, run QA, rerun Gate 4h, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, change env/dashboard state, call provider APIs, introduce Capacitor, or implement Brush-up.

Brush-up remains deferred to v1.1. Do not include Brush-up, best-take provider submission, script-scoped voice material, or voice clone improvement in v1 reviewer steps, evidence, screenshots, Store metadata, privacy copy, or support copy.

## Reviewer Account Placeholder

Reviewer account creation is `human_required`.

Use this placeholder shape only:

| Field | Draft value | Notes |
| --- | --- | --- |
| `reviewer_account_required` | `true` | Store review requires an account that can run the v1 loop. |
| `reviewer_email` | `human_required` | Do not record the full email in docs / outputs. |
| `reviewer_password` | `never_record_here` | Never store reviewer password in repo, docs, outputs, or screenshots. |
| `reviewer_account_ready` | `pending` | Human must create / verify account later. |
| `reviewer_account_safe_alias` | `human_required` | Example shape: `reviewer_account_01`, not an email. |
| `reviewer_account_instructions_ready` | `draft` | This Gate 5d document is draft until human review. |

## Reviewer Instructions Draft

Use concise instructions in Store review notes. Do not include private data, API details, provider dashboard notes, env values, or raw evidence.

### 1. Login

1. Open the production URL or native review build URL supplied by the release owner.
2. Sign in with the provided reviewer account using the approved login method.
3. Expected result: the app reaches `/scripts` or a safe authenticated practice entry.
4. If login fails, note the safe error state and contact support through the supplied support URL. Do not expose auth internals.

### 2. Script Creation

1. Open `/scripts`.
2. Select an existing reviewer script or open `/scripts/new`.
3. Create a short, safe one-minute English practice script.
4. Expected result: the new script is saved and can open the listen step.

Safe test script guidance:

- Use neutral, non-private content.
- Keep it short enough for one-minute speaking practice.
- Do not use personal data, private names, credentials, legal identifiers, medical details, or sensitive work content.
- Do not use copyrighted passages or public figures' speech text.

### 3. Listen

1. Open listen for the script.
2. Play existing model audio or generate normal model audio if needed.
3. Expected result: model audio is playable through the app-owned replay surface.
4. v1 review note: this is normal model audio. Brush-up is not part of v1.

### 4. Record

1. Open record for the script.
2. Record a short practice take or use the approved recording path.
3. Expected result: the app shows a safe recording notice and allows evaluation.
4. Do not record private speech, real private identifiers, or sensitive content for review.

### 5. Evaluate

1. Start evaluation from the record step.
2. Expected result: the app processes the take and navigates to review when complete.
3. Provider note: transcription and pronunciation evaluation run through server-side provider boundaries. Reviewers do not need provider dashboard access.

### 6. Review

1. Open the review page for the take.
2. Confirm that learning feedback appears.
3. Expected result: review can show transcript summary, pronunciation / fluency / rhythm-oriented feedback, weak words, and next-step coaching as learning support.
4. Claim boundary: feedback is not an official ability assessment, perfect pronunciation judgment, or guaranteed improvement claim.

### 7. Progress

1. Open `/progress`.
2. Select the reviewer script if needed.
3. Expected result: latest / best continuity is visible for the practice loop.
4. If no prior data exists, a safe empty state is acceptable.

### 8. Settings / Privacy / Terms / Support / Account Deletion Request

1. Open `/settings`.
2. Confirm links to Privacy Policy, Terms, Support, and account deletion request/help are reachable.
3. Open `/privacy`, `/terms`, `/support`, and `/support/account-deletion` if requested.
4. Expected result: these pages explain v1 data handling and support/deletion request paths without claiming actual deletion completion before proof.

### 9. Provider Unavailable / Disabled Behavior

If a provider is unavailable or disabled:

- expected result: the app shows safe recovery copy;
- reviewer should not need dashboard, env, billing, API key, or provider account access;
- the UI must not expose secrets, env values, raw provider responses, transcript bodies, private audio paths, Storage object keys, provider ids, full emails, or auth ids.

Provider-disabled proof is an operator/release-owner check, not a Store reviewer task.

### 10. v1 Scope Note

Brush-up is not a v1 feature. Reviewers should not expect:

- best-take provider submission;
- script-scoped Brush-up voice material;
- voice clone improvement from a user's best take;
- Brush-up generated model audio;
- Brush-up-specific consent, revoke, or deletion proof.

## Reviewer Evidence Package Draft

Record only safe status fields. Do not record credentials, raw user content, raw provider data, private identifiers, or private paths.

| Field | Allowed values / guidance |
| --- | --- |
| `package_id` | Operator-generated safe alias. |
| `prepared_for` | `app_store_review`, `google_play_review`, or `both`. |
| `prepared_at` | Timestamp or date. |
| `reviewer_account_status` | `pending`, `ready`, `blocked`, or `human_required`. |
| `reviewer_account_safe_alias` | Alias only; no full email. |
| `reviewer_password_status` | Must be `never_record_here`. |
| `reviewer_account_instructions_ready` | `draft`, `ready`, or `human_required`. |
| `build_or_url_status` | `human_required`, `ready`, or `blocked`. |
| `test_script_safe_summary` | Safe description such as `short neutral one-minute script`; no script body. |
| `main_loop_result` | `pass`, `warn`, `blocked`, `not_run`, or `human_required`. |
| `privacy_terms_support_result` | `pass`, `warn`, `blocked`, `not_run`, or `human_required`. |
| `account_deletion_request_result` | `pass`, `warn`, `blocked`, `not_run`, or `human_required`. |
| `provider_notice_result` | `pass`, `warn`, `blocked`, `not_run`, or `human_required`. |
| `kill_switch_recovery_result` | `pass`, `warn`, `blocked`, `not_applicable`, or `human_required`. |
| `screenshot_reference` | Safe screenshot set alias only; no file with private data. |
| `human_required` | List of remaining human-owned items. |
| `redaction_status` | `pass`, `warn`, or `fail`. |
| `brush_up_expected_in_v1` | Must be `false`. |
| `next_action` | Safe next action label. |

## Show / Do Not Show Boundary

### OK to Show Reviewers

- Safe operation steps.
- Safe test script summary or approved demo script.
- Route flow: login, `/scripts`, `/scripts/new`, listen, record, review, progress, settings.
- Expected results for each route.
- Privacy / Terms / Support / account deletion request locations.
- Safe provider unavailable recovery explanation.
- Short v1 scope note that Brush-up is not included.

### Do Not Show Reviewers

- API keys.
- Env values.
- Raw provider responses.
- Provider dashboard or billing details.
- Full transcript bodies.
- Full private script bodies.
- Raw audio files.
- Private Storage paths or object keys.
- Signed URLs.
- Provider voice ids.
- Full personal email addresses.
- Auth user ids.
- Personal user recordings.
- Reviewer password.
- Internal destructive cleanup steps.

## Human Required

- Reviewer account creation.
- Reviewer account safe alias.
- Reviewer password transfer outside repo/docs/outputs.
- Final reviewer instructions.
- Final production URL or native review build URL.
- Final support URL.
- Final Privacy Policy URL.
- Final Terms URL if used.
- Final account deletion request URL.
- Final screenshots / screenshot aliases.
- Final legal approval for reviewer notes.
- Final confirmation that provider unavailable copy is acceptable for Store review.
- Final confirmation that Brush-up is absent from v1 reviewer notes.

## Non-Execution Boundary

Gate 5d did not:

- create reviewer accounts;
- record reviewer passwords;
- operate App Store Connect;
- operate Google Play Console;
- capture screenshots;
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
