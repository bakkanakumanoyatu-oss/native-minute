# G5D Completion foundation migration final authority closeout result

Recorded: 2026-09-04 (Asia/Tokyo)

Mode: `G5D_COMPLETION_FOUNDATION_MIGRATION_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH`

Status: `G5D_COMPLETION_FOUNDATION_MIGRATION_CLOSED_COMMITTED_PASS`

This result records the final repository authority for the Completion foundation and the minimum correction for the accepted independent-review P1: Completion expiry used a session-TimeZone-dependent calendar-day interval. The independent timezone-invariant expiry focused re-review passed and closed that P1. Account deletion audit retention remains 90 days as human-facing policy; its DB canonical implementation is exactly 2160 elapsed hours after `completed_at`, independent of session TimeZone and DST. This is a correctness fix, not a policy change. Completion operator/service/routing is not implemented; Completion, G5D-2, and Gate 5 remain open. Migration `0027` is not applied to Canonical Staging or Production.

## Preflight and migration identity

The initial checkpoint matched the accepted authority exactly: working root `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`, HEAD/upstream `6c3997ba9e1ca81087608a88dfba8c9b889ddc03`, ahead/behind `0/0`, tracked worktree clean, and only the allowed existing `supabase/.temp/` untracked directory. `npm run check:workspace` and initial `git diff --check` passed.

The correction checkpoint matched the requested base: the same root, branch, HEAD/upstream, the known six-file Completion WIP, and no commit or push. The existing `supabase/.temp/` directory was not read, written, or removed. The accepted review verdict was `NOT PASS` with Completion diff `P0/P1/P2/UNKNOWN = 0/1/0/0`; this correction changes only that expiry P1.

The repository migration chain was exact and contiguous `0001` through `0026`, with no `0027`. This unit adds exactly one next migration:

`supabase/migrations/0027_g5d_completion_foundation.sql`

It adds no table or column. It contains only the Completion historical preflight, completed composite constraint, focused prerequisite helper, Completion transition/immutability trigger, one focused Completion RPC, the minimum Auth-trigger compatibility correction needed for a post-Auth update, and narrowed Completion column ACL.

## Historical-row fail-closed preflight

The first executable migration block rejects, without repair or backfill:

- non-completed rows retaining `completed_at`;
- completed rows missing `completed_at`, exact `completed_at + interval '2160 hours'` expiry, or `last_attempted_at = completed_at`;
- completed rows with non-null owner/failure fields, notification state other than `not_needed`, or non-empty metadata;
- completed rows lacking exact Provider, Storage, Database, or Auth parent authority;
- completed rows with Provider/Storage child count, owner-null, terminal, scrub, reconciliation/verification, failure, manual, or retry contradictions;
- completed rows with invalid DB D/A/R equation, polarity, or retained-evidence count;
- completed rows with invalid Auth intent/generation/verification/sub-finalization ordering or unsrubbed transient/target authority.

A second disposable PostgreSQL database applied `0001` through `0026`, inserted a legal-under-0026 but anomalous `status='requested' / completed_at IS NOT NULL` row, and attempted `0027` transactionally. The migration raised `historical account deletion completion rows require reconciliation before G5D Completion`; the row remained unchanged and the new constraint/RPC remained absent. Automatic repair/backfill was zero.

## Completed composite and transition authority

The validated `account_deletion_requests_completion_terminal_shape_check` enforces:

- `status='completed'` only with non-null `completed_at`;
- `expires_at = completed_at + interval '2160 hours'`, an absolute delta of exactly `7,776,000` seconds;
- `last_attempted_at = completed_at`;
- `user_id IS NULL`;
- cleared `failure_stage` and `failure_reason_code`;
- `notification_status='not_needed'`;
- `metadata='{}'::jsonb`;
- every non-completed row has `completed_at IS NULL` while existing non-completed `expires_at` semantics remain unchanged.

The focused trigger rejects completed inserts, any first transition other than `confirmed -> completed`, direct `completed_at` assignment outside that transition, and rewrites/reversion of status, timestamps/expiry, notification state, owner, failure state, metadata, or last-attempted authority after completion.

G5D-2M's Auth trigger previously rejected every later update to an already Auth-sub-finalized row even when no Auth durable field changed. Migration `0027` narrows only the terminal-entry clause to rows whose prior `auth_sub_finalized_at` is null. All Auth durable-field immutability, generation, verification binding, target scrub, manual stickiness, and sub-finalization requirements remain intact. The known `auth_terminal_authority_missing` allowlist P2 is unchanged.

## Focused RPC contract

`finalize_account_deletion_completion(uuid)` is the only new callable RPC. It:

- accepts only an exact deletion-request UUID;
- locks the exact parent row `FOR UPDATE`;
- revalidates persisted Provider, Storage, Database, and Auth authority from the database;
- performs no external action and accepts no caller-supplied prior-stage flag;
- writes the Completion terminal fields atomically only for the first valid `confirmed` call;
- returns an immutable no-op `already_completed` replay after revalidation;
- raises and rolls back on missing, malformed, nonterminal, manual, unknown, cross-request, or contradictory authority.

Provider validation includes exact version/seal/polarity/count/lease/sub-finalization and every child being terminal, owner-null, locator-scrubbed, reconciled, verified absent, and clear of failure/manual/retry evidence. Storage applies the analogous exact collection/seal/fingerprint/count/lease/sub-finalization and child authority. Database requires the accepted inventory version, nonnegative PostgreSQL integers, exact `observed = deleted + anonymized + retained`, status polarity, and retained count equal to the request plus current Provider/Storage evidence. Auth requires the accepted intent version, terminal generation polarity, positive verification attempt authority, ordered verified-absence/sub-finalization timestamps, null owner/target/transient result binding, and cleared failure state.

The first write changes exactly `status`, `completed_at`, `expires_at`, `notification_status`, `failure_stage`, `failure_reason_code`, and `last_attempted_at`; the existing updated-at trigger owns `updated_at`. It does not change `anonymized_user_ref`, `retry_count`, prior-stage evidence, or quota/voice retention anchors.

All five Completion expiry authority sites in migration `0027` use the same `interval '2160 hours'` definition: historical preflight, completed composite constraint, transition validation, already-completed replay validation, and first terminal write. No Completion authority site in `0027` retains the old calendar-day expression. Quota-event, completed voice-deletion audit, operational-log, and Provider/Storage/Auth evidence retention semantics were not changed.

## Replay, concurrency, ACL, and generated type

The row lock serializes concurrent first callers. Disposable two-session proof produced one `completion_finalized` write and one `already_completed` replay with identical completion/expiry timestamps. A response-loss-equivalent second call recovered the already-completed result without rewriting timestamps.

The RPC and trigger/helper owners are `postgres` with fixed `search_path = pg_catalog, public`. `PUBLIC`, `anon`, and `authenticated` have no RPC execute privilege; `service_role` alone can execute it. Trigger/helper functions are not callable by application roles. Direct `service_role` update authority is removed from `completed_at`, `expires_at`, and `notification_status`; request `status`, `confirmed_at`, and `metadata` authority needed by existing creation/confirmation flow is preserved. A forged direct service-role Completion update failed, and prior Provider/Storage/Database/Auth RPC execute authority remained present.

`types/database.ts` adds only the generated-compatible `finalize_account_deletion_completion` function signature and five return fields. No table type changes were needed.

## Isolated PostgreSQL proof

A fresh disposable `public.ecr.aws/supabase/postgres:17.6.1.165` database, with only minimal local Supabase platform schema stubs for repository migrations, applied the exact repository chain `0001` through `0027` without a manual application patch. The repository proof script returned:

`G5D_COMPLETION_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS`

The proof covers:

- valid first completion and exact terminal write;
- already-completed and response-loss-equivalent replay with unchanged timestamps/expiry;
- America/New_York first completion followed by UTC replay, with exact `7,776,000`-second authority;
- deterministic 2026 fall-back and 2027 spring-forward boundary fixtures, each replayed from America/New_York to UTC with unchanged persisted instants;
- reverse UTC first completion to America/New_York replay and a UTC/America/New_York/Asia/Tokyo constraint/predicate probe;
- Provider and Storage child mismatch rollback/write zero;
- DB D/A/R contradiction rollback/write zero;
- Auth nonterminal, non-null owner, and unsrubbed Auth target rollback/write zero;
- retained child failure/retry evidence rollback/write zero;
- forged service-role direct Completion denial;
- completed-state rewrite/reversion denial;
- two-session serialization to one first write plus one replay;
- exact-request UUID isolation, unknown UUID failure, and different-request write zero;
- unrelated quota and voice retention anchors unchanged;
- function owner/search-path/ACL, validated constraint, enabled trigger, direct-column ACL, and prior-stage RPC catalog authority.

Proof-only impossible states used `session_replication_role=replica` and temporary constraint removal only inside the disposable database, restored and revalidated before proof completion. No bypass, debug path, or runtime control was added to repository migration/application code. Both disposable containers were removed after validation.

## Validation and boundaries

- `npm run check:workspace`: PASS.
- Clean disposable PostgreSQL `0001` through `0027` migration-chain apply: PASS.
- Historical valid `+2160 hours` and legitimate open-row migration acceptance: PASS.
- Historical bad expiry at `+1 second`, DST-like `+1 hour`, and DST-like `-1 hour`: fail-closed PASS, with automatic repair/backfill zero.
- Focused Completion isolated runtime proof: PASS.
- DST fall-back, spring-forward, reverse-session replay, and cross-TimeZone constraint probes: PASS.
- Focused Completion contract/SHA/generated-type test: PASS, 10/10.
- Existing Provider/Storage/Database/Auth relevant regressions: PASS, 24/24, 18/18, 11/11, and 35/35.
- `npm run lint` and `npm run mobile:lint`: PASS, zero warnings/errors.
- `npm run typecheck` and `npm run mobile:typecheck`: PASS.
- final `git diff --check`: PASS.
- Build: not required because no UI, route, or build-only source changed.

No Completion service/operator/bridge or canonical `completion` routing was added. No connected proof, Canonical Staging push/apply, Production mutation, real Provider/Storage/Auth call, DB finalizer call outside the disposable database, destructive-guard enablement, purge worker, notification sender, generic deletion framework, new table/column, commit, or push occurred.

The independent focused re-review passed and the accepted Completion timezone P1 is closed. Completion migration `0027` repository authority is `CLOSED_COMMITTED_PASS`; Canonical Staging apply is not started. Completion diff is `P0=0 / P1=0 / P2=0 / correctness UNKNOWN=0`; program aggregate is `P0=0 / P1=0 / P2=1 / correctness UNKNOWN=0`. The sole program P2 is the accepted nonblocking `auth_terminal_authority_missing` deferred cleanup and was not changed.

## Migration byte authority

SHA-256: `ff05fd6ffcca8e1a78c62418360e74f2d025f2779dcd6ea9f147919359728beb`

This hash identifies repository migration bytes only. Migration `0027` remains unapplied to Canonical Staging.

## Exact next action

`G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_APPLY`
