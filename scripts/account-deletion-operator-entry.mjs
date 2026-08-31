#!/usr/bin/env node

import {
  parseArgs,
  printHelp,
  resolveAccountDeletionRequestReadOnly,
  runAccountDeletionOperator
} from "./account-deletion-operator-runner.mjs";
import { createAccountDeletionProviderOperatorBridge } from "../services/account-deletion/account-deletion-provider-operator.service.ts";

const parsed = parseArgs(process.argv.slice(2));

if (parsed.help) {
  printHelp();
}

const providerBridge = createAccountDeletionProviderOperatorBridge({ env: process.env });
const summary = await runAccountDeletionOperator(parsed, {
  env: process.env,
  requestResolver: (input) =>
    input.stage === "status" || input.stage === "summary"
      ? resolveAccountDeletionRequestReadOnly(input, process.env)
      : providerBridge.requestResolver(input),
  stageServices: providerBridge.stageServices
});

console.log(JSON.stringify(summary, null, 2));

if (["blocked", "failed", "manual_required"].includes(summary.status)) {
  process.exitCode = 2;
}
