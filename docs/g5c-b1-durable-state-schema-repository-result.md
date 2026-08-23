# G5C-B1 Durable State / Repository Foundation

Status: `REMEDIATION_IMPLEMENTED_PENDING_INDEPENDENT_REAUDIT`

Scope is limited to migration `0015_g5c_b1_voice_deletion_durable_state.sql`, aligned TypeScript DB types, and a server-only repository for voice-only deletion operations and targets.

- The two new tables are RLS-enabled with no authenticated client policies. Explicit table ACLs revoke all access from `PUBLIC`, `anon`, and `authenticated`; service-role DML is granted explicitly. Snapshot sealing, lease claim, and completion use service-role-only RPCs.
- Snapshot targets and the `snapshot_status=succeeded` transition are one database transaction. A focused finalization RPC atomically verifies the completion prerequisites, scrubs every verified target locator, removes the consent snapshot reference, closes the lease, and marks the operation completed with 90-day audit retention.
- Operation and target transition triggers reject unresolved completion, early/reconciliation-blocking locator scrub, locator restoration after scrub, destructive timestamp rollback, destructive-to-failed transitions, and completed-to-noncompleted rollback. These contracts still require actual PostgreSQL negative proof only after the unapplied migration is reviewed and applied by the authorized Staging workflow.
- No migration was applied to Staging. No provider deletion, Storage deletion, consent withdrawal, actual runner, account-deletion integration, or learning-history target was added.
