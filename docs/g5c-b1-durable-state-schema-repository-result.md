# G5C-B1 Durable State / Repository Foundation

Status: `IMPLEMENTED_REPOSITORY_VALIDATED_PENDING_INDEPENDENT_AUDIT`

Scope is limited to migration `0015_g5c_b1_voice_deletion_durable_state.sql`, aligned TypeScript DB types, and a server-only repository for voice-only deletion operations and targets.

- The two new tables are RLS-enabled with no authenticated client policies. Snapshot sealing and lease claim use service-role-only RPCs.
- Snapshot targets and the `snapshot_status=succeeded` transition are one database transaction. The schema enforces active-operation uniqueness, target fingerprint uniqueness, owner-scoped target FK, lease pairs, completion safety, pre-destructive `failed`, and locator scrubbing.
- No migration was applied to Staging. No provider deletion, Storage deletion, consent withdrawal, actual runner, account-deletion integration, or learning-history target was added.
