# G5C-B1 Durable State / Repository Foundation

Status: `CARDINALITY_REMEDIATION_IMPLEMENTED_PENDING_FINAL_CONFIRMATION`

Scope is limited to migration `0015_g5c_b1_voice_deletion_durable_state.sql`, aligned TypeScript DB types, and a server-only repository for voice-only deletion operations and targets.

The `create_or_get_voice_deletion_operation` `RETURNS TABLE` contract remains unchanged. Its generated Database type now models the PostgREST result as an array, while the repository explicitly applies `.single()` and fails closed if the RPC does not yield exactly one row. Migration 0015 remains unapplied.

- The two new tables are RLS-enabled with no authenticated client policies. Explicit table ACLs revoke every privilege from `PUBLIC`, `anon`, `authenticated`, and `service_role`; `service_role` receives `SELECT` only. All current mutation paths are fixed-signature `SECURITY DEFINER` RPCs with explicit service-role-only `EXECUTE` grants.
- Snapshot targets and the `snapshot_status=succeeded` transition are one database transaction. Creation, snapshot sealing, lease claim/release, and finalization are focused RPCs; the repository has no direct operation/target insert, update, or delete path.
- Finalization requires `processing`, `post_delete_verification`, the caller-owned unexpired lease token, sealed snapshot, consent/verification success, and target-kind-specific absence evidence. It atomically scrubs verified target locators, removes the consent snapshot reference, closes the lease, and marks the operation completed with 90-day audit retention. No custom GUC is an authorization mechanism.
- Operation and target transition triggers retain defense-in-depth for immutable target identity, completed state, destructive timestamp rollback, and destructive-to-failed transitions. These contracts still require actual PostgreSQL negative proof only after the unapplied migration is reviewed and applied by the authorized Staging workflow.
- No migration was applied to Staging. No provider deletion, Storage deletion, consent withdrawal, actual runner, account-deletion integration, or learning-history target was added.
