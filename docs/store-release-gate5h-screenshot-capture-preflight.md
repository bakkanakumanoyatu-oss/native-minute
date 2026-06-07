# Gate 5h Screenshot Capture Preflight

Status: `preflight_ready_capture_not_started`

Gate 5h prepares the screenshot capture run for Native Minutes v1. It does not capture screenshots.

This is docs/output-only. It does not generate images, create an app icon, operate Store Console, operate App Store Connect, operate Google Play Console, introduce Capacitor, start TestFlight, start Google closed testing, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB cleanup, execute provider cleanup, call provider APIs, change env/dashboard settings, retry reviewer login, or resend magic links.

Brush-up remains deferred to v1.1 and must not appear in v1 screenshots, captions, metadata, reviewer instructions, support copy, privacy copy, or Store claims.

## Inputs

| Input | Status |
| --- | --- |
| Gate 5e Store asset capture plan | `complete` |
| Gate 5f Store asset capture readiness check | `complete` |
| Gate 5g mobile / device selection plan | `complete` |
| iPhone Safari mobile QA | `PASS` |
| iPhone Chrome lightweight mobile QA | `PASS` |
| Android Chrome mobile QA | `human_required_later / device_unavailable` |
| App name candidate | `Native Minutes` |
| Subtitle candidate | `1分間のナチュラル発音トレーニング` |
| Demo script candidate | `human_confirmed / claim_safe` |
| Support / Privacy / Account deletion URLs | `human_check_PASS` |

## Account Context

Use the clean demo account context for screenshot capture.

| Account context | Use for screenshots? | Status | Notes |
| --- | --- | --- | --- |
| `plus_demo_account` | Yes | `ready_for_capture_preflight` | Use the human-confirmed clean demo account. Do not show or record the full email in screenshots or screenshot evidence. |
| reviewer account | No | `verification_deferred` | Keep for reviewer instructions after final login verification. Do not use for capture now. |
| `plus_delete_test_account` | No | `deletion_proof_only` | Reserved for account deletion safe dry-run / future destructive proof. Never use for Store screenshots. |
| real / personal account | No | `blocked` | Do not use for screenshots or Store evidence. |

## Demo Script

Use the human-confirmed demo script candidate for screenshot setup:

`Today, I will practice speaking clearly and confidently for one minute. I want to improve my pronunciation, rhythm, and fluency little by little. I will slow down, breathe naturally, and focus on each word. Even small progress matters, and I can become more comfortable each time I practice.`

This script is original, non-private, and claim-safe. It should not be mixed with private transcript text or real user practice data.

## Minimum Screenshot Set

| Asset id | Screen | Route / surface | Purpose | Safe caption candidate |
| --- | --- | --- | --- | --- |
| `shot_01_home` | Home / practice entry | Home | Show the one-minute practice entry point. | `1分の練習を始める` |
| `shot_02_script_creation` | Script creation | `/scripts/new` | Show creating a short practice script. | `1分英語スクリプトを作る` |
| `shot_03_listen` | Listen | `/scripts/[id]/listen` | Show model audio / listen-first practice. | `お手本を聞く` |
| `shot_04_record` | Record | `/scripts/[id]/record` | Show recording your take. | `自分の発音を録音する` |
| `shot_05_review` | Review | `/scripts/[id]/review/[takeId]` | Show feedback and next practice point. | `発音・流暢さ・リズムを確認` |
| `shot_06_progress` | Progress | `/progress` | Show latest / best continuity. | `最新結果とベスト結果を確認` |

## Optional Screenshot Set

Add these only if final Store slots, redaction, and copy review allow:

| Asset id | Screen | Route / surface | Purpose | Safe caption candidate |
| --- | --- | --- | --- | --- |
| `shot_07_scripts` | Scripts / practice stock | `/scripts` | Show five-slot practice stock and resume flow. | `練習ストックを選ぶ` |
| `shot_08_settings` | Settings | `/settings` | Show support, privacy, and account help entry points. | `設定とサポートを確認` |
| `shot_09_support_privacy_deletion` | Privacy / Support / Account deletion request | `/privacy`, `/support`, `/support/account-deletion` | Show trust and account request surfaces if Store review strategy needs them. | `プライバシーとサポート` |

## Do Not Capture

Screenshots and evidence must not show:

- full email;
- auth token;
- cookies;
- private URL;
- raw transcript;
- transcript body;
- raw audio path;
- Storage path;
- Storage object key;
- signed URL;
- provider response;
- provider id;
- secret or env value;
- billing data;
- reviewer password;
- personal data;
- real user records;
- delete-test account data;
- actual deletion proof before it exists.

## Store Claim Safety

Do not use captions, screenshots, or metadata that read like:

- guaranteed improvement;
- perfect pronunciation assessment;
- medical or institutional assessment;
- Brush-up is available in v1;
- voice clone improvement is available in v1;
- best take becomes provider voice material in v1;
- actual deletion is fully complete;
- native app availability before Capacitor/native packaging is complete.

Safer directions:

- one-minute speaking practice;
- model audio;
- learning feedback;
- latest / best take;
- practice stock;
- account deletion request path.

## Human Required Before Capture

- Final iPhone / Android device size or viewport for capture.
- Final App Store screenshot requirement check.
- Final Google Play screenshot requirement check.
- Final copy / caption review.
- Final legal/support review for visible copy.
- Final redaction review.
- Final confirmation that the demo account contains no private data.
- Final decision whether optional Settings / Privacy / Support / Account deletion screenshots are needed.
- App icon is a separate task.
- Store Console upload requirements are a separate task.
- Android Chrome remains `human_required_later / device_unavailable`; do not claim Android capture readiness until device/platform needs are decided.

## Capture Entry Criteria

Start screenshot capture only when:

- clean demo account is ready and private-data free;
- demo script is loaded or ready to load;
- target device / viewport has been chosen;
- minimum screenshot set is approved;
- captions are approved for capture;
- redaction rules are accepted by the person capturing;
- screenshots will not show full email, private data, raw paths, provider data, tokens, or secrets;
- Brush-up and actual-deletion-complete claims are absent.

## Blockers

Do not start screenshot capture if:

- final copy requires legal judgment;
- screenshots would expose private data or raw/internal values;
- Store Console is needed to decide the capture itself;
- Android device capture is mandatory but no Android device is available;
- reviewer account or delete-test account would be used for screenshots;
- screenshots would imply Brush-up v1 availability or completed actual deletion;
- capture would require provider API calls, env/dashboard changes, destructive cleanup, Capacitor, or Store Console operation.

## Non-Capture Boundary

Gate 5h did not:

- capture screenshots;
- generate images;
- create app icons;
- operate Store Console;
- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Data Safety answers;
- introduce Capacitor;
- start TestFlight;
- start Google closed testing;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- call provider APIs;
- change env or dashboards;
- retry reviewer login;
- resend magic links.
