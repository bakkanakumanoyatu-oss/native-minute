# Store Release Final Copy Polish Plan

Status: `plan_ready_human_legal_required_before_store_submission`

This plan identifies Store-submission-facing copy polish work before screenshots, Store Console input, Capacitor, or actual deletion proof. It is a planning checkpoint only.

It does not execute account deletion, Auth deletion, Storage deletion, DB cleanup, provider cleanup, provider API calls, env/dashboard changes, screenshot capture, Store Console operation, App Store Connect operation, Google Play Console operation, Capacitor work, app icon creation, reviewer login retry, or magic link resend.

Brush-up remains deferred to v1.1 and must not appear as a v1 feature claim.

## Surfaces Checked

User-facing copy was reviewed in these current surfaces:

- Home: `app/page.tsx`
- Practice / Scripts: `app/scripts/page.tsx`
- Script creation: `app/scripts/new/page.tsx` and script studio components
- Listen: `app/scripts/[id]/listen/page.tsx`
- Record: `app/scripts/[id]/record/page.tsx` and recording components
- Review: `app/scripts/[id]/review/[takeId]/page.tsx`
- Progress: `app/progress/page.tsx`
- Settings: `app/settings/page.tsx`
- Privacy: `app/privacy/page.tsx`
- Terms: `app/terms/page.tsx`
- Support: `app/support/page.tsx`
- Account deletion: `app/support/account-deletion/page.tsx` and `components/account/account-deletion-panel.tsx`
- Footer / legal links: `app/layout.tsx`
- Provider / consent notices: `components/legal/consent-notice.tsx`, `components/voice/*`

## Main Finding

The main practice loop copy is mostly user-facing and does not show major Store-unsafe claims. The highest-priority polish target is the legal/support/settings/account-deletion layer, where several internal planning phrases are still visible:

- `draft`
- `candidate`
- `release candidate draft`
- `final human approval required`
- `human_required`
- `Gate`
- `smoke`
- `internal proof`
- `Store submission blocker`
- `scaffold`
- `dry-run`
- `cleanup`
- `stage`
- `guard`
- `destructive`
- provider-internal labels such as `provider cleanup`, `DB cleanup`, and `Auth cleanup`

These phrases are useful in repo docs and operator proof, but should not remain as primary user-facing Store copy unless intentionally placed in an internal operator-only surface.

## Copy To Remove Or Reword Before Store Submission

### Footer

- Current issue: footer says `v1 release candidate draft. Final human approval required.`
- Store-facing direction: replace with a simple product/support sentence and legal links.
- Keep internal approval status in docs/outputs, not public footer.

### Settings

- Current issue: `Gate 0 smoke`, `release candidate draft`, and `Privacy draft / Terms draft / Support draft` are visible.
- Store-facing direction: remove Gate/smoke language and use user-facing labels such as Privacy Policy, Terms, Support, and Account deletion request.
- Keep accurate account deletion copy: request / confirmation / safe summary now, actual deletion only after the approved destructive gate.

### Privacy / Terms / Support / Account Deletion Pages

- Current issue: pages still use `Draft`, `release candidate draft`, `final human approval`, `human_required`, `Store submission`, `scaffold`, `actual destructive cleanup`, and `blocker`.
- Store-facing direction: convert to final-user language after legal/support approval:
  - Privacy Policy
  - Terms
  - Support
  - Account and data deletion
  - account deletion request
  - support response target
  - data deletion will be handled according to the published policy
- Do not claim deletion is complete until actual deletion proof is explicitly approved.

### Account Deletion Panel

- Current issue: the UI still exposes some technical status labels and safe-summary mechanics.
- Store-facing direction: keep status transparency, but prefer user-facing phrases:
  - `外部音声サービスの確認`
  - `保存ファイルの確認`
  - `アプリデータの確認`
  - `ログインアカウントの確認`
  - `削除対象の件数確認`
- Internal stage names can remain as secondary status if needed for support, but should not dominate the page.

### Provider / Consent Notices

- Current issue: some notices mention `human approval required` and v1/v1.1 implementation boundaries.
- Store-facing direction: keep concise provider/data notices, but move implementation planning details to docs or support pages. Brush-up absence can be stated only if needed to prevent confusion, not as a main feature note.

## Keep In Docs / Operator Evidence, Not User-Facing Copy

These terms can remain in repo docs, outputs, operator proof, release checklists, and internal runbooks:

- Gate
- smoke
- proof package
- dry-run
- destructive gate
- human_required
- release candidate
- blocker
- provider cleanup
- Storage cleanup
- DB cleanup
- Auth cleanup
- redaction scan
- Store operation boundary

## Store Claim Safety

The final copy must avoid claims that imply:

- becoming a native speaker;
- guaranteed improvement;
- complete or perfect pronunciation scoring;
- medical, institutional, or official assessment;
- Brush-up availability in v1;
- voice clone improvement in v1;
- best take provider submission in v1;
- complete account deletion before actual deletion proof is approved;
- native app availability before Capacitor/native packaging is complete.

Safer v1 wording:

- one-minute English speaking practice;
- model audio for practice;
- pronunciation, fluency, and rhythm feedback as learning support;
- latest and best take review;
- progress tracking;
- support and account deletion request path.

## Final Copy Polish Checklist

### Before Screenshot Capture

- Remove public `draft` / `release candidate` / `human_required` labels from footer, Settings, Privacy, Terms, Support, and Account deletion pages.
- Replace Gate/smoke/proof language with user-facing explanations.
- Confirm support email and URLs are still valid.
- Confirm app name / subtitle remain accepted candidates.
- Confirm demo script remains non-private and claim-safe.
- Confirm Brush-up is absent from screenshots, metadata, reviewer instructions, and public v1 feature copy.
- Confirm account deletion copy does not say or imply deletion is complete.

### Before Store Submission

- Human/legal approval for Privacy Policy and Terms.
- Human approval for Support and account deletion request wording.
- Final App Privacy / Google Data Safety mapping matches implemented behavior.
- Reviewer account instructions are final and do not include credentials in repo docs/outputs.
- Actual deletion proof remains separate until explicitly approved; if not complete, Store-facing copy must describe the currently supported request/support path accurately.
- Release QA verifies no internal labels are visible in public routes.

## Human Required / Legal Required

- Legal approval for Privacy Policy and Terms final wording.
- Release owner approval for Store metadata and screenshots.
- Support owner approval for support contact, response timing, and support fallback wording.
- Final reviewer account login verification.
- Final App Privacy and Google Data Safety answers.
- Final decision on whether account deletion public copy can mention manual/support handling before actual deletion proof.
- Explicit destructive-gate approval before any actual deletion proof.

## Recommended Next Step

Proceed with a small UI copy pass focused only on footer, Settings, Privacy, Terms, Support, and Account deletion pages. Keep the change text-only, preserve deletion safety boundaries, and run lint/build/typecheck because route/page copy will change.
