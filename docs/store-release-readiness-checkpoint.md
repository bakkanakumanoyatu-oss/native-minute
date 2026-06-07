# Store Release Readiness Checkpoint

Status: `non_destructive_checkpoint_ready_human_required_before_store_submission`

This checkpoint summarizes the Store release mainline after Gate 0, Gate 4h, account deletion copy smoke, and Gate 5e / 5f / 5g planning. It is a non-destructive readiness record only.

It does not execute account deletion, Supabase Auth deletion, Storage deletion, DB cleanup, provider cleanup, provider API calls, dashboard/env changes, screenshot capture, app icon creation, Store Console operation, App Store Connect operation, Google Play Console operation, Capacitor work, reviewer login retry, or magic link resend.

Brush-up remains deferred to v1.1 and must not appear as a v1 Store claim.

## Checkpoint Summary

Native Minute is ready to continue with Store release preparation, but it is not ready for Store submission or screenshot capture yet.

The Web core has production human smoke evidence, the account deletion request / safe dry-run surface has human-observed safe evidence, support/privacy/account deletion URLs have passed human open checks, support contact is unified, and Store asset planning has a candidate app name, subtitle, demo script, screenshot set, device plan, and claim-safety boundary.

The remaining work is mostly human confirmation, Store asset creation, Store metadata finalization, release QA, native packaging, and one explicitly approved future destructive proof gate for actual account deletion.

## Completed / Ready Evidence

- Gate 0 auth callback production smoke: `PASS`.
- Gate 4h disposable account safe dry-run proof: `PASS: human_observed_safe_dry_run_summary`.
- Account deletion copy production smoke on `/settings`: `PASS`.
- Support contact: unified for Native Minutes support.
- Privacy URL, Support URL, and Account deletion request URL: human open check `PASS`.
- App name / subtitle candidate: `Native Minutes` / `1分間のナチュラル発音トレーニング`.
- Store / screenshot / reviewer demo script: human-confirmed candidate.
- `+demo` login flow: `PASS`.
- `+delete-test` login flow: `PASS`.
- Gate 5e Store asset capture plan: complete.
- Gate 5f Store asset capture readiness check: complete; capture not ready until human-required items close.
- Gate 5g mobile / device selection and platform asset requirements plan: complete; platform-specific requirements remain human-required.

## Human Required / Blocker / Deferred

### Human Required Before Store Submission

- Reviewer account final login verification.
- Final Store-facing copy polish, including draft labels, mixed English technical labels, and final human approval wording.
- Final support / privacy / account deletion URL confirmation at submission time.
- Final Store metadata: app name acceptance, subtitle, short description, long description, keywords, category, countries/regions, and age rating answers.
- App Privacy and Google Data Safety final answers.
- Reviewer instructions finalization.
- App Store / Google Play reviewer account readiness.
- Apple Developer / Google Play Console registration and access readiness.
- Google closed testing tester setup.
- Release QA execution and signoff.

### Human Required Before Screenshot / Asset Capture

- Reviewer or clean demo account confirmation with no private data.
- Final iPhone and Android capture device / viewport choices.
- Current App Store and Google Play screenshot / asset requirements check.
- Screenshot capture.
- App icon creation.
- Final screenshot captions and localization.
- Final redaction review.

### Explicitly Deferred / Separate Gate

- Actual account deletion proof remains a future explicitly approved destructive gate.
- Supabase Auth deletion, Storage deletion, DB destructive cleanup, and provider cleanup remain out of scope until that gate.
- Capacitor iOS / Android conversion remains future work.
- TestFlight and Google closed testing remain future work.
- App Store / Google Play submission remains future work.
- Brush-up, best-take provider submission, script-scoped voice material, voice clone improvement, and Brush-up-specific cleanup remain v1.1 work.

## Recommended Next Order

1. Finalize reviewer or clean demo account readiness without recording credentials in repo docs or outputs.
2. Perform final copy polish for Store-facing Privacy / Terms / Support / Account deletion wording, keeping actual deletion status accurate.
3. Complete human platform checks for App Store / Google Play asset requirements, device sizes, app icon requirements, and screenshot strategy.
4. Capture screenshots and create app icon only after redaction and claim-safety review.
5. Finalize Store metadata, reviewer instructions, App Privacy, and Google Data Safety answers.
6. Run Gate 6 release QA across production Web, mobile browsers, provider normal/disabled paths, legal/support routes, account deletion request/dry-run, logs/redaction, and reviewer flow.
7. Run actual deletion proof only in a later explicitly approved destructive gate.
8. Start Capacitor iOS / Android work only after Web release readiness and Store-facing safety items are accepted.
9. Proceed to TestFlight / Google closed testing, then Store submission and resubmission loop.

## Store Claim Safety

Do not use claims that imply:

- guaranteed improvement;
- complete or perfect pronunciation scoring;
- medical, institutional, or official ability assessment;
- native speaker replacement;
- Brush-up availability in v1;
- voice clone improvement in v1;
- best take provider submission in v1;
- complete account deletion before the destructive proof gate;
- native app availability before Capacitor/native packaging is complete.

Safer v1 claims remain one-minute speaking practice, model audio, learning feedback, latest/best take review, progress tracking, and account deletion request/support path.

## Non-Execution Boundary

This checkpoint did not:

- execute actual account deletion;
- delete a Supabase Auth user;
- remove Storage objects;
- perform DB destructive cleanup;
- execute provider cleanup;
- change DB schema or migrations;
- change env or dashboard settings;
- call provider APIs;
- capture screenshots;
- generate images;
- create an app icon;
- operate Store Console, App Store Connect, or Google Play Console;
- introduce Capacitor;
- retry reviewer login or resend magic links;
- connect voice providers;
- implement Brush-up.
