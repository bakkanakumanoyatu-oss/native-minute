# Gate 4b v1 Privacy / Terms / Support Scaffold

Gate 4b implements the minimal v1 copy and route scaffold for Privacy Policy, Terms, Support, account deletion explanation, and Settings / Account legal navigation.

This is a small UI/copy scaffold. It does not implement actual account deletion, Auth user deletion, Storage deletion, provider cleanup execution, DB schema changes, API contract changes, provider calls, env changes, dashboard operations, Brush-up, Capacitor, or Store submission.

## Existing Route Inventory

| Surface | Status | Gate 4b action |
| --- | --- | --- |
| `/privacy` | existed | Updated to v1 release candidate draft copy. |
| `/terms` | existed | Updated to v1 release candidate draft copy. |
| `/support` | existed | Updated to v1 release candidate draft copy. |
| `/support/account-deletion` | existed | Updated to clarify request/dry-run only and no actual deletion execution. |
| `/settings` | existed | Kept as the Settings / Account entry point and refreshed copy for legal/support/deletion links. |
| global footer | existed | Refreshed draft label to v1 release candidate draft. |

## Copy Scope

Gate 4b copy now covers:

- normal practice recordings;
- OpenAI transcription;
- Azure pronunciation evaluation;
- AI coaching / feedback and Script Studio generation;
- normal model audio / voice setup;
- voice sample / consent recording;
- Supabase Auth / DB / private Storage / protected replay;
- account deletion request and dry-run status;
- human approval requirements before Store submission.

Brush-up is explicitly treated as v1.1 deferred. v1 copy must not claim Brush-up is available, must not say a best take is sent as script-scoped voice material, and must not make Brush-up-specific deletion or revoke claims.

## Account Deletion Boundary

The account deletion surfaces are still request / confirmation / dry-run / proof-prep only.

Gate 4b does not:

- run actual deletion jobs;
- delete Supabase Auth users;
- delete Storage objects;
- call provider cleanup;
- delete or anonymize DB rows;
- enable destructive guards;
- claim deletion is complete for Store submission.

The public account deletion page and Settings panel now state that Store submission still needs actual deletion path proof, disposable proof, provider cleanup proof, and final human approval.

## human_required

The following remain human-required before Store submission:

- final Privacy Policy URL;
- final Terms URL, if used for Store distribution;
- final Support URL / inbox;
- final account deletion request URL;
- legal owner and final legal approval;
- App Privacy and Google Data Safety final answers;
- reviewer account and reviewer instructions;
- actual account deletion disposable proof;
- provider cleanup proof for normal v1 voice resources.

The current support contact remains `bakkanakuma@gmail.com` from earlier human confirmation, but final support URL / inbox operations remain human-required for Store release.

## Files Updated

- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/support/page.tsx`
- `app/support/account-deletion/page.tsx`
- `app/settings/page.tsx`
- `app/layout.tsx`
- `components/legal/beta-legal-page.tsx`
- `components/account/account-deletion-panel.tsx`
- `docs/current-state.md`
- `docs/store-release-mainline-inventory.md`
- `outputs/store_release_gate4b_privacy_terms_support_scaffold/gate4b_privacy_terms_support_scaffold.json`

## Handoff

Next work should implement the first actual Gate 4c privacy / consent / deletion behavior batch only after this scaffold is reviewed. The safest next step is a small implementation batch for consent / notice UI surfaces, followed by account deletion actual path proof planning or implementation under a separate scoped task.
