# Store Release QA Readiness Refresh

Status: `refresh_ready`

This refresh updates the Store release QA checklist after the latest non-destructive evidence work.

It does not run QA, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB cleanup, execute provider cleanup, operate Store Console, capture screenshots, create app icons, introduce Capacitor, call providers, change env, or resend magic links.

Brush-up remains deferred to v1.1 and must not appear in v1 Store metadata, screenshots, reviewer instructions, public support copy, or release QA claims.

## Updated Readiness Inputs

| Input | Current status | QA impact |
| --- | --- | --- |
| Gate 0 production auth smoke | `PASS` | Auth callback, `/login`, `/scripts`, refresh session, logout -> magic link -> login, and prior static asset 404 chain are ready for release QA regression coverage. |
| Practice slot management | `PASS` production human smoke | QA must include five-slot full state, sixth-script block, organize-stock link, per-card delete action, confirmation UI, reopened slot, new script after deletion, and intact `/progress`. |
| Gate 4h safe dry-run proof | `PASS: human_observed_safe_dry_run_summary` | QA can treat request creation, typed confirmation, safe summary, redaction, and no actual deletion as covered by human-observed evidence. Actual deletion stays out of normal QA. |
| Gate 4m Storage cleanup proof readiness | `ready_with_store_blocker` | QA must keep Storage cleanup actual proof as a Store-submission blocker until a separate approved destructive gate or explicit acceptance. |
| Gate 4n actual proof approval packet | `packet_ready_not_approved` | QA must verify no actual deletion is implied; the approval phrase is defined only for a future gate. |
| Account deletion public copy | `polished` | QA must verify user-facing copy stays simple, avoids internal proof language, and does not imply deletion has completed. |
| Store asset readiness | Gate 5e / 5f / 5g complete | QA can reference the screenshot and device planning, but should not capture assets until human-required Store asset prerequisites close. |

## Refreshed QA Checklist

| Area | Account / environment | Required check | Status before execution |
| --- | --- | --- | --- |
| Auth callback regression | clean demo account / production web | `/login` opens, login reaches `/scripts`, refresh keeps session, logout -> new magic link -> login works, no `callback_failed` or static asset 404 chain. | `ready_for_qa` |
| Main loop | clean demo account / production web | Create script, listen, record, evaluate, review, progress, second take continuity. | `ready_for_qa` |
| Five-slot management | clean demo account / production web | Fill five slots, confirm sixth script is blocked, use organize-stock link, delete one script with confirmation, confirm slot reopens, create a new script, verify `/progress` remains intact. | `ready_for_qa` |
| Practice script deletion safety | clean demo account / production web | Confirm deletion is scoped to the current user's script and remains separate from account deletion / Storage cleanup. | `ready_for_qa_with_storage_warning` |
| Progress display | clean demo account / production web | Latest / best / selected slot display remains stable after script delete and recreation. | `ready_for_qa` |
| Account deletion request flow | disposable account only | Confirm request created, typed confirmation completed, safe summary visible, no raw identifiers shown, actual deletion not run. | `covered_by_gate4h_human_observed_pass` |
| Account deletion actual proof | disposable account only | Provider -> Storage -> DB -> Auth proof requires a separate explicit destructive approval gate. | `blocked_outside_release_qa` |
| Privacy / Terms / Support / footer | no private account required | Routes open, support contact is current, public copy avoids internal planning labels and misleading deletion-complete wording. | `ready_for_qa` |
| Consent / provider notices | clean demo account / production web | Listen / record / review / voice setup explain recording, provider usage, AI feedback limits, voice sample/consent recording, and legal/support links. | `ready_for_qa` |
| Provider kill switch | local / approved production-safe check | Gate 4k local smoke is baseline; production-like operation proof still needs human-approved execution without env value recording. | `human_required` |
| Store claim safety | metadata / screenshot / reviewer drafts | No guaranteed improvement, perfect assessment, medical/institutional claim, Brush-up v1 claim, voice clone improvement v1 claim, or deletion-complete claim. | `ready_for_review` |
| Mobile browser | mobile Safari / mobile Chrome | Auth, record, upload, protected replay, legal/support routes, account deletion copy visibility, and audio recovery. | `human_required` |
| Reviewer flow | reviewer account | Reviewer login, main loop, settings/support/deletion request path, and no Brush-up v1 claim. | `human_required_deferred` |
| Store data forms | human Store owner | App Privacy / Google Data Safety answers match actual v1 behavior and deletion state. | `human_required` |

## Account Separation

Use separate account contexts in future QA:

| Account context | Use for | Do not use for |
| --- | --- | --- |
| Clean demo account | Auth regression, main loop, five-slot management, progress, screenshot candidate flow. | Actual deletion proof or reviewer password evidence. |
| Reviewer account | Store reviewer instructions and final reviewer login smoke. | Disposable deletion proof, provider cleanup, or internal operator proof. |
| Disposable deletion account | Account deletion request, typed confirmation, safe dry-run summary, and future actual proof if explicitly approved. | Screenshots, reviewer flow, demo/main Store flow, or real user data. |

Do not record full email, full auth user id, tokens, cookies, Storage object keys, full paths, transcript bodies, raw audio, provider raw responses, or secrets in any QA evidence.

## Blocker / Human Required / Deferred

### Blocker

- Store submission remains blocked by actual account deletion proof or explicit owner/legal acceptance of the current safe-dry-run state.
- Storage cleanup actual proof remains blocked until a separate approved destructive gate or explicit acceptance.
- Store submission remains blocked if final App Privacy / Google Data Safety answers do not match implemented behavior.

### Human Required

- Reviewer account final login verification.
- Final support / legal / deletion copy approval.
- Mobile browser / future WebView audio and replay smoke.
- Production-safe kill switch operation proof.
- App Privacy / Google Data Safety final answers.
- Screenshot capture and redaction review.
- App icon and platform-specific Store asset requirements.
- Apple Developer / Google Play Console readiness and Google closed testing setup.

### Deferred

- Brush-up implementation, best-take provider submission, script-scoped voice variants, Brush-up cleanup, and Brush-up Store claims remain v1.1.
- Practice slot Storage object cleanup is a warning / future gate, not a v1 Store submission blocker unless Store/legal review requires per-script file deletion.
- Actual account deletion remains a separately approved destructive gate, not part of this readiness refresh.

## Release QA Execution Order Refresh

1. Local route / lint-safe smoke planning review.
2. Production Web auth callback regression.
3. Clean demo account main loop.
4. Five-slot management and script deletion / recreation.
5. Privacy / Terms / Support / footer / account deletion public copy.
6. Provider notice and consent notice checks.
7. Provider kill switch operation proof only after human-approved safe procedure.
8. Mobile browser smoke.
9. Reviewer account smoke after reviewer verification.
10. Disposable account actual deletion proof only after explicit approval phrase is provided in a later destructive gate.
11. Final Store data forms, screenshot, asset, and release signoff.

## Non-Destructive Boundary

This refresh did not:

- run release QA;
- target any account;
- execute actual account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- call provider APIs;
- change DB schema or migrations;
- change API contracts;
- change env or dashboard settings;
- operate Store Console;
- capture screenshots;
- create app icons;
- introduce Capacitor;
- resend magic links;
- verify reviewer login.
