#!/usr/bin/env node

import {
  parseArgs,
  printHelp,
  resolveAccountDeletionRequestReadOnly,
  runAccountDeletionOperator
} from "./account-deletion-operator-runner.mjs";
import { createAccountDeletionProviderOperatorBridge } from "../services/account-deletion/account-deletion-provider-operator.service.ts";
import { createAccountDeletionStorageOperatorBridge } from "../services/account-deletion/account-deletion-storage-operator.service.ts";
import { createAccountDeletionDatabaseOperatorBridge } from "../services/account-deletion/account-deletion-database-operator.service.ts";

const parsed = parseArgs(process.argv.slice(2));

if (parsed.help) {
  printHelp();
}

const providerBridge = createAccountDeletionProviderOperatorBridge({ env: process.env });
const storageBridge = createAccountDeletionStorageOperatorBridge({ env: process.env });
const databaseBridge = createAccountDeletionDatabaseOperatorBridge({ env: process.env });
const stageServices = {
  ...providerBridge.stageServices,
  ...storageBridge.stageServices,
  ...databaseBridge.stageServices
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
    return Promise.resolve({ ok: false, safeReasonCode: "stage_service_unavailable" });
  },
  stageServices
});

console.log(JSON.stringify(summary, null, 2));

if (["blocked", "failed", "manual_required"].includes(summary.status)) {
  process.exitCode = 2;
}
