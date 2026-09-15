#!/usr/bin/env node
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { runRetentionPurgeOperator } from "../services/account-deletion/retention-purge-operator.service.ts";

// Existing operator env convention. No remote action occurs without execute + guard.
dotenv.config({ path: ".env.local", quiet: true });
try {
  const { values } = parseArgs({ options: {
    resource: { type: "string" }, mode: { type: "string" }, "after-id": { type: "string" }, help: { type: "boolean" }
  } });
  if (values.help) {
    console.log("retention:purge --mode execute --resource quota|voice|account [--after-id UUID]\nOne candidate per invocation. Independent table cursors; sweep quota, voice, then account.\nStart later sweeps at no cursor, including after hold release. Requires existing destructive guard.");
  } else {
    const result = await runRetentionPurgeOperator({ resource: values.resource, mode: values.mode, afterId: values["after-id"] });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "succeeded") process.exitCode = 2;
  }
} catch {
  console.log(JSON.stringify({ status: "blocked", safeReasonCode: "retention_input_invalid", rpcCalls: 0 }));
  process.exitCode = 2;
}
