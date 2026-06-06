# Gate 5g Mobile Device Selection / Asset Requirements Plan

Status: `plan_ready_human_required_before_capture`

Gate 5g turns the Gate 5e / 5f Store asset plan into a concrete pre-capture device and requirement checklist. It is planning only: no screenshots were captured, no images or app icons were generated, no App Store Connect / Google Play Console operation happened, no Capacitor work started, no reviewer login or magic link resend was attempted, and no DB / Auth / Storage / provider cleanup or actual deletion occurred.

Brush-up remains deferred to v1.1. Store screenshots, captions, reviewer notes, metadata, and support/privacy copy must not claim Brush-up, best-take provider submission, voice clone improvement, script-scoped voice material, or Brush-up-specific generated audio as v1 functionality.

## Repo-Confirmed Inputs

- Gate 0 production auth smoke is `PASS`.
- App name / subtitle candidate is human-confirmed: `Native Minutes` / `1分間のナチュラル発音トレーニング`.
- Support email is unified to `nativeminutes.support@gmail.com`.
- `/privacy`, `/support`, and `/support/account-deletion` opened in human check.
- `+demo` and `+delete-test` login flows are `PASS`.
- Reviewer account candidate is recorded as `nativeminutes.support+reviewer@gmail.com`, but verification is `human_required_deferred` because of temporary email / magic link rate-limit risk.
- Demo script candidate is human-confirmed and Store-safe.

## Device / Viewport Candidates

These are capture planning candidates, not Store Console-verified final requirements.

| Target | Candidate viewport / device family | Purpose | Status |
| --- | --- | --- | --- |
| iPhone primary | Modern large iPhone portrait viewport, such as a 6.7-inch class device | Main App Store phone screenshot set | `human_required` |
| iPhone secondary | Smaller iPhone portrait viewport, such as a 6.1-inch class device | Text-fit / layout sanity check before capture | `optional_human_required` |
| Android primary | Modern Android phone portrait viewport, Pixel-like or similar | Main Google Play phone screenshot set | `human_required` |
| Android secondary | Narrow Android phone portrait viewport | Text-fit / control overlap sanity check | `optional_human_required` |
| Desktop / Web fallback | Desktop web viewport for docs/reviewer evidence only | Fallback evidence, not primary mobile Store asset | `optional` |

Exact pixel dimensions, Store-specific screenshot sizes, device frames, density buckets, and whether tablet screenshots are needed are `human_required / platform_check_required` because current App Store Connect / Google Play Console requirements must be checked by a human before capture.

## Minimum Screenshot Set

Use the human-confirmed demo script and a reviewer or clean demo account with no private data.

1. Home / practice entry.
2. Script creation.
3. Listen.
4. Record.
5. Review.
6. Progress.

## Optional Screenshot Set

Add only if Store slots, redaction, and final copy review allow.

- Scripts / practice library.
- Settings.
- Privacy / Support / Account deletion request path.
- Reviewer/support evidence screen, if needed for reviewer instructions and if no private data appears.

## Per-Device Capture Targets

| Device target | Minimum targets | Optional targets | Pre-capture checks |
| --- | --- | --- | --- |
| iPhone primary | Home, Script creation, Listen, Record, Review, Progress | Scripts, Settings, legal/support path | Text legibility, button fit, audio controls not covering content, no private data, no Brush-up claim |
| Android primary | Home, Script creation, Listen, Record, Review, Progress | Scripts, Settings, legal/support path | Same as iPhone plus browser/device chrome cropping risk |
| Desktop fallback | Home, Script creation, Listen, Record, Review, Progress | Settings / legal surfaces | Internal evidence only unless Store strategy explicitly allows web screenshots |

## Human-Required Before Capture

- Reviewer account final login verification after rate-limit risk clears, or a clean demo account that has no private data.
- Final choice of iPhone target device / viewport.
- Final choice of Android target device / viewport.
- Current App Store screenshot size / device family requirements.
- Current Google Play screenshot size / phone/tablet/feature-graphic requirements.
- Whether tablet screenshots are required or strategically useful.
- Whether device frames are allowed / desired.
- Final short description, long description source, and screenshot captions.
- Final legal/support approval for visible copy.
- Final redaction review for screenshots and evidence.
- Confirmation that app name / subtitle candidates are acceptable in Store Console.
- Confirmation that support/privacy/account deletion URLs remain valid.

## Unknown / Platform Check Required

- Exact App Store Connect screenshot pixel sizes, device class requirements, and upload rules.
- Exact Google Play screenshot dimensions, count limits, device class requirements, and feature graphic / promotional asset needs.
- Whether current Store submission requires tablet assets for the selected release strategy.
- Whether a Web/PWA screenshot can be used as fallback evidence, or only native-shell screenshots are acceptable after Capacitor.
- Whether app icon source asset size, safe area, and adaptive icon layers need to be prepared in this same asset batch.

## Store Claim Safety

The current app name, subtitle, and demo script remain Store-claim safe for planning. They do not claim:

- `ネイティブになる`
- `必ず上達`
- `完全な発音判定`
- `医療・教育機関レベル`
- `Brush-up is available in v1`
- `voice clone improvement is available in v1`
- `best take becomes voice material in v1`
- `account deletion is fully complete` before disposable proof and destructive path approval
- `native app` before Capacitor/native packaging is complete and reviewed

## Capture Entry Criteria

Actual screenshot capture can start only after:

- reviewer or clean demo account is confirmed;
- mobile device / viewport targets are chosen;
- platform-specific screenshot requirements are checked by a human;
- demo script remains approved;
- final captions / descriptions are approved for capture;
- Store claim safety is reviewed;
- redaction rules are accepted by the person capturing assets;
- Brush-up remains absent from screenshots, metadata, captions, and reviewer notes.

## Non-Execution Boundary

Gate 5g did not:

- capture screenshots;
- generate images;
- create app icons;
- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Google Data Safety answers;
- introduce Capacitor;
- start TestFlight or Google closed testing;
- retry reviewer login;
- resend magic links;
- rerun Gate 4h;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- execute provider cleanup;
- change env or dashboards;
- connect voice providers;
- implement Brush-up.
