# G5C-B5 Voice-only Deletion Web/Mobile UI

Status: `CLOSED_COMMITTED_PASS`

Gate: `G5C-B5`
MODE: `G5C_B5_FINAL_CLOSEOUT_COMMIT_AND_PUSH_V1`

Final proof accepted: `G5C_B5_WEB_MOBILE_UI_NON_DESTRUCTIVE_RUNTIME_SMOKE_PASS`.

Canonical Staging is `native-minute-staging` (`ztlliqishddrrvqqrrlu`). Forward-only migration `0020_g5c_b5_post_delete_verification_transitions.sql` is applied; Staging migration history is `0001`–`0020`.

- Backend prerequisite: `HDC_G5C_B5_SELF_SERVICE_REQUEST_DRIVEN_FINALIZATION_V1` is closed. Request-driven orchestration keeps GET read-only, limits one POST to at most one durable step, performs post-delete verification, and invokes the guarded finalizer through a separate boundary. Web uses cookie authority and Mobile uses a Bearer-only BFF; safe client state supports retry/resume and durable `manual_required`.
- Web and Mobile provide Settings → Voice Data at dedicated `/settings/voice-data`, separate from Account Deletion. The confirmation UX explains deleted versus retained data and covers processing, `retry_available`, `manual_required`, `completed`, and `already_no_voice`; the latter offers Voice Setup. Refresh/relaunch re-fetches durable status.
- UI safety is preserved: no typed DELETE, safe DTOs only, and no raw operation/provider/Storage data exposure. GET remains read-only. A processing batch has at most three POSTs, including a retry POST; continuation is explicit and GET-first. Transport failures do not infer a result.
- Independent evidence accepted: initial UI audit findings, the processing-continuation and retry-budget remediations, actual Chromium component tests, and the final focused read-only re-audit all passed. The non-destructive Web/Mobile runtime smoke also passed.
- Runtime smoke covered Web Settings / Voice Data render and refresh, Mobile Settings / Voice Data render and relaunch, Web cookie GET, and Mobile Bearer GET. Destructive mutation count was `0`.

P0=`0`; P1=`0`; P2=`0`.

No source implementation, test, backend/BFF route, migration, database, Storage, provider, Account Deletion, or Staging state was changed for this docs-only closeout.

Next Gate: G5C-B6 regression / isolation / partial failure / crash / refresh. G5C-B6 and B7 live destructive proof are not started by this closeout.
