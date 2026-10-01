#!/usr/bin/env node
import { assertWritesAllowed, getWriteFenceState } from "../lib/operations/write-fence.mjs";

import {
  parseArgs,
  printHelp,
  resolveAccountDeletionRequestReadOnly,
  runAccountDeletionOperator
} from "./account-deletion-operator-runner.mjs";

const parsed = parseArgs(process.argv.slice(2));

if (parsed.help) {
  printHelp();
}

try {
  assertWritesAllowed();
} catch {
  const fence = getWriteFenceState();
  console.log(JSON.stringify({ status: "blocked", safeReasonCode: fence.code, reason: fence.reason, destructiveOperationsAttempted: 0 }));
  process.exit(2);
}

const { createAccountDeletionProviderOperatorBridge } = await import("../services/account-deletion/account-deletion-provider-operator.service.ts");
const { createAccountDeletionStorageOperatorBridge } = await import("../services/account-deletion/account-deletion-storage-operator.service.ts");
const { createAccountDeletionDatabaseOperatorBridge } = await import("../services/account-deletion/account-deletion-database-operator.service.ts");
const { createAccountDeletionAuthOperatorBridge } = await import("../services/account-deletion/account-deletion-auth-operator.service.ts");
const { createAccountDeletionCompletionOperatorBridge } = await import("../services/account-deletion/account-deletion-completion-operator.service.ts");

const providerBridge = createAccountDeletionProviderOperatorBridge({ env: process.env });
const storageBridge = createAccountDeletionStorageOperatorBridge({ env: process.env });
const databaseBridge = createAccountDeletionDatabaseOperatorBridge({ env: process.env });
const authBridge = createAccountDeletionAuthOperatorBridge({ env: process.env });
const completionBridge = createAccountDeletionCompletionOperatorBridge({ env: process.env });
const stageServices = {
  ...providerBridge.stageServices,
  ...storageBridge.stageServices,
  ...databaseBridge.stageServices,
  ...authBridge.stageServices,
  ...completionBridge.stageServices
};
const summary = await runAccountDeletionOperator(parsed, {
  env: process.env,
  requestResolver: (input) => {
    if (input.stage === "status" || input.stage === "summary") {
      return resolveAccountDeletionRequestReadOnly(input, process.env);
    }
    if (input.stage === "provider") return providerBridge.requestResolver(input);
    if (input.stage === "storage") return storageBridge.requestResolver(input);
    if (input.stage === "database") return databaseBridge.requestResolver(input);
    if (input.stage === "auth") return authBridge.requestResolver(input);
    if (input.stage === "completion") return completionBridge.requestResolver(input);
    return Promise.resolve({ ok: false, safeReasonCode: "stage_service_unavailable" });
  },
  stageServices
});

console.log(JSON.stringify(summary, null, 2));

if (["blocked", "failed", "manual_required"].includes(summary.status)) {
  process.exitCode = 2;
}
