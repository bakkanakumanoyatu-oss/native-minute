# Gate 5j Human Screenshot Capture Instructions

Status: `instruction_pack_ready_capture_not_started`

Gate 5j gives a human operator concrete instructions for taking iPhone screenshot candidates for Native Minutes v1. These are internal review candidates first, not final Store screenshots.

This gate does not capture screenshots, create screenshot files, generate images, create an app icon, operate Store Console, operate App Store Connect, operate Google Play Console, introduce Capacitor, start TestFlight, start Google closed testing, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB cleanup, execute provider cleanup, call provider APIs, change env/dashboard settings, retry reviewer login, or resend magic links.

Brush-up remains deferred to v1.1 and must not appear in screenshots, captions, metadata, reviewer instructions, support copy, or Store claims.

## Account And Data Context

Use only the clean demo account context.

| Account context | Use for capture? | Notes |
| --- | --- | --- |
| clean demo account | Yes | Use for main screenshots. Do not show or record the full email. |
| reviewer account | No | Verification is deferred; keep it out of screenshots. |
| delete-test account | No | Reserved for account deletion proof; never use for Store screenshots. |
| real / personal account | No | Blocked for screenshot capture. |

Use the human-confirmed demo script:

`Today, I will practice speaking clearly and confidently for one minute. I want to improve my pronunciation, rhythm, and fluency little by little. I will slow down, breathe naturally, and focus on each word. Even small progress matters, and I can become more comfortable each time I practice.`

The script is original, non-private, and claim-safe. Do not mix it with private transcript text, private scripts, or real user practice data.

## Before Capture

1. Use an iPhone in portrait orientation.
2. Sign in to production with the clean demo account before capture.
3. Do not capture the login email entry screen, magic-link email, mailbox, browser password manager, auth callback URL, or any screen showing the full email.
4. Turn on Focus / Do Not Disturb or otherwise prevent notification banners from appearing.
5. Close Mail, Messages, password managers, and unrelated tabs before capture.
6. Use a clean browser tab/session with no personal tabs visible.
7. Keep Safari / browser controls out of the candidate image when practical. If the browser top/bottom chrome or URL bar would show a private URL or account detail, do not use that screenshot.
8. Confirm the demo account contains no private scripts, private recordings, private transcript text, personal names, or personal email addresses in visible UI.
9. Prepare or choose the demo script. If a new practice is needed, create it from the demo script only.
10. Confirm that the screenshot is for internal review only and not final Store submission.

## Minimum Screenshot Candidate Order

Capture these first. If any screen exposes private data or looks broken, stop and record the issue instead of continuing.

| Order | Asset id | Screen | Route / action | What to show | Safe caption candidate |
| --- | --- | --- | --- | --- | --- |
| 1 | `shot_01_home` | Home / practice entry | Open Home after login. | The one-minute practice entry point and main navigation. | `1分の練習を始める` |
| 2 | `shot_02_script_creation` | Script creation | Open `/scripts/new`; show the creation entry or the safe demo script in the form if needed. | Creating a one-minute English script without private content. | `1分英語スクリプトを作る` |
| 3 | `shot_03_listen` | Listen | Open the demo script's Listen screen. | Model audio / listen-first practice controls and readable script preview. | `お手本を聞く` |
| 4 | `shot_04_record` | Record | Open the demo script's Record screen. | Recording entry, microphone/upload notice, and provider notice without private data. | `自分の発音を録音する` |
| 5 | `shot_05_review` | Review | Open a safe saved review for the demo script. | Score / feedback / next practice point without raw private transcript content. | `発音・流暢さ・リズムを確認` |
| 6 | `shot_06_progress` | Progress | Open `/progress`. | Latest / best continuity for the safe demo script. | `最新結果とベスト結果を確認` |

## Optional Screenshot Candidate Order

Capture these only if the minimum set is clean and Store review strategy still needs extra trust / account surfaces.

| Order | Asset id | Screen | Route / action | What to show | Safe caption candidate |
| --- | --- | --- | --- | --- | --- |
| 7 | `shot_07_scripts` | Scripts / practice stock | Open `/scripts`. | Five-slot practice stock and visible organization flow without private titles. | `練習ストックを選ぶ` |
| 8 | `shot_08_settings` | Settings | Open `/settings`. | Support, privacy, terms, and account help links. Avoid showing full email. | `設定とサポートを確認` |
| 9 | `shot_09_support_privacy_deletion` | Privacy / Support / Account deletion request | Open `/privacy`, `/support`, or `/support/account-deletion`. | Trust / support path only if copy is clean and no deletion-complete claim appears. | `プライバシーとサポート` |

## Do Not Capture

Do not include any of the following in a screenshot or screenshot evidence:

- full email address;
- magic-link email or inbox;
- auth callback URL;
- auth token;
- cookies;
- private URL;
- password manager or saved password prompts;
- raw transcript body;
- raw audio waveform or private audio content that identifies a person;
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

Do not use or capture captions / visible copy that reads like:

- guaranteed improvement;
- perfect pronunciation assessment;
- medical or institutional assessment;
- Brush-up is available in v1;
- voice clone improvement is available in v1;
- best take becomes provider voice material in v1;
- account deletion is fully complete;
- native app availability before Capacitor/native packaging is complete and reviewed.

Safe directions are:

- one-minute speaking practice;
- model audio;
- learning feedback;
- latest / best take;
- practice stock;
- account deletion request path.

## After Capture Human Checklist

For each captured candidate, record only safe status:

| Field | Safe value guidance |
| --- | --- |
| `asset_id` | Use the asset id from this instruction pack. |
| `screen` | Safe screen label, such as `home`, `listen`, or `progress`. |
| `device` | `iphone`, no serial number. |
| `browser` | `safari` or `chrome`; do not include private profile info. |
| `account_context` | `clean_demo`, no email. |
| `caption_candidate` | Safe caption candidate from this pack or a safer short variant. |
| `contains_private_data` | Must be `false` before internal review. |
| `contains_browser_private_ui` | `false` unless explicitly accepted for internal review; never final Store. |
| `brush_up_claim_absent` | Must be `true`. |
| `deletion_complete_claim_absent` | Must be `true`. |
| `approved_for_final_store_submission` | `false`; this gate is internal review only. |
| `notes` | Short safe summary only. |

Reject and retake any candidate that shows private data, full email, browser/mail UI with private context, raw provider or storage values, risky Store claims, broken layout, unreadable text, or actual deletion-complete wording.

## Non-Capture Boundary

Gate 5j creates instructions only. It did not capture screenshots, create screenshot files, generate images, create an app icon, operate Store Console, operate App Store Connect, operate Google Play Console, introduce Capacitor, start native testing, execute deletion, call providers, change env/dashboard settings, retry reviewer login, or resend magic links.
