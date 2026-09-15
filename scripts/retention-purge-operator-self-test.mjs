import assert from "node:assert/strict";
import { runRetentionPurgeOperator } from "../services/account-deletion/retention-purge-operator.service.ts";
const row = { examined: 1, purged: 0, skipped_hold: 0, skipped_not_expired: 0, skipped_unsafe: 0,
  legacy_hold_linkage_unresolved: 1, next_after_id: "93000000-0000-4000-8000-000000000001" };
let calls = 0;
const repository = { purgeNext: async () => { calls++; return row; } };
const blocked = await runRetentionPurgeOperator({ resource: "quota", mode: "execute" }, { env: {}, repository });
assert.equal(blocked.status, "blocked");
assert.equal(calls, 0);
const result = await runRetentionPurgeOperator({ resource: "quota", mode: "execute" }, {
  env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }, repository
});
assert.equal(calls, 1);
assert.equal(result.status, "succeeded");
assert.equal(result.safeCounts.legacy_hold_linkage_unresolved, 1);
assert.equal(result.safeCounts.purged, 0);
console.log("R2_OPERATOR_REAL_MODULE_FAKE_ONLY_PASS; NETWORK_CALLS=0");
