# Gate 5i Screenshot Candidate Capture Internal Review

Status: `BLOCKED: no_authenticated_clean_demo_session`

Gate 5i attempted the internal review screenshot candidate capture path for Native Minutes v1. This was intended to be PC-based mobile-width capture for internal review only, not final Store screenshots.

No screenshot candidates were captured because the in-app browser did not have an authenticated clean demo account session. Opening the protected `/scripts` surface at mobile width redirected to the login page with `login_required`. Codex did not send a magic link, retry reviewer login, use the delete-test account, or use a real / personal account.

## Scope Boundary

This Gate 5i pass did not:

- capture final Store screenshots;
- capture internal screenshot candidate image files;
- generate images;
- create an app icon;
- operate Store Console;
- operate App Store Connect;
- operate Google Play Console;
- introduce Capacitor;
- start TestFlight;
- start Google closed testing;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- execute provider cleanup;
- call provider APIs;
- change env or dashboard settings;
- retry reviewer account login;
- resend magic links.

## Capture Attempt

| Item | Result |
| --- | --- |
| Browser surface | in-app browser |
| Viewport | mobile-width portrait candidate, `390x844` |
| Environment | production web |
| Intended account context | `plus_demo_account` safe alias |
| Attempted protected route | `/scripts` |
| Observed result | redirected to `/login` with `login_required` |
| Screenshot files created | `0` |
| Stop reason | authenticated clean demo session was not available to Codex |

## Minimum Candidate Set

These remain the minimum candidate set, but none were captured in this Gate 5i pass.

| Asset id | Screen | Route / surface | Capture status | Safe caption candidate |
| --- | --- | --- | --- | --- |
| `shot_01_home` | Home / practice entry | Home | `not_captured_blocked` | `1分の練習を始める` |
| `shot_02_script_creation` | Script creation | `/scripts/new` | `not_captured_blocked` | `1分英語スクリプトを作る` |
| `shot_03_listen` | Listen | `/scripts/[id]/listen` | `not_captured_blocked` | `お手本を聞く` |
| `shot_04_record` | Record | `/scripts/[id]/record` | `not_captured_blocked` | `自分の発音を録音する` |
| `shot_05_review` | Review | `/scripts/[id]/review/[takeId]` | `not_captured_blocked` | `発音・流暢さ・リズムを確認` |
| `shot_06_progress` | Progress | `/progress` | `not_captured_blocked` | `最新結果とベスト結果を確認` |

## Optional Candidate Set

These remain optional and were not captured.

| Asset id | Screen | Route / surface | Capture status | Safe caption candidate |
| --- | --- | --- | --- | --- |
| `shot_07_scripts` | Scripts / practice stock | `/scripts` | `not_captured_blocked` | `練習ストックを選ぶ` |
| `shot_08_settings` | Settings | `/settings` | `not_captured_blocked` | `設定とサポートを確認` |
| `shot_09_support_privacy_deletion` | Privacy / Support / Account deletion request | `/privacy`, `/support`, `/support/account-deletion` | `not_captured_blocked` | `プライバシーとサポート` |

## Account / Data Safety

- Use only `plus_demo_account` safe alias for screenshot capture.
- Do not use the reviewer account while verification is deferred.
- Do not use the delete-test account because it is reserved for account deletion proof.
- Do not use real / personal accounts.
- Do not record full email addresses, auth user ids, auth tokens, cookies, private URLs, raw transcript text, raw audio paths, Storage paths, Storage object keys, signed URLs, provider responses, provider ids, secrets, env values, or personal data.

## Demo Script

The human-confirmed demo script remains the intended screenshot script:

`Today, I will practice speaking clearly and confidently for one minute. I want to improve my pronunciation, rhythm, and fluency little by little. I will slow down, breathe naturally, and focus on each word. Even small progress matters, and I can become more comfortable each time I practice.`

It is original, non-private, and claim-safe. It was not loaded into a capture session during this blocked pass.

## Store Claim Safety

This pass did not introduce Store claims. Future screenshots and captions must still avoid:

- guaranteed improvement;
- perfect pronunciation assessment;
- medical or institutional assessment;
- Brush-up as a v1 feature;
- voice clone improvement as a v1 feature;
- best-take provider submission as v1 behavior;
- completed actual deletion before a separately approved destructive proof;
- native app availability before Capacitor/native packaging is complete and reviewed.

## Layout / Copy Observations

No authenticated screenshot candidates were captured, so no layout or copy issue can be judged from the minimum set in this pass.

The login redirect page itself rendered at mobile width and did not expose private account data. It is not part of the screenshot candidate set.

## Next Human Step

To rerun Gate 5i, a human should prepare the browser session with the clean demo account and then ask Codex to capture internal review candidates without sending a new magic link from Codex. The rerun should stop again if the authenticated session is absent or if any screenshot would expose private or raw data.
