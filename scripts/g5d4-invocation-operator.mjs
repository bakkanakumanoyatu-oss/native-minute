import { readInvocationSnapshot, readInvocationAuthorization, atomicPublishPrivateFile } from "./g5d4-proof-private-state.mjs";
import { assertFreshInvocation } from "./g5d4-invocation-evidence.mjs";
// Proof-only guards around the unchanged canonical operator and its public factories.
import { evidenceAssert, exactEvidence } from "./g5d4-invocation-evidence.mjs";
const actionMethods = {
  provider: { seal: ["sealProviderSnapshot"], delete: ["beginDeleteAttempt", "recordDeleteResult"], verify: ["beginReconciliationAttempt", "recordReconciliationResult"], finalize: ["finalizeProviderStage"], replay: [] },
  storage: { seal: ["beginStorageSnapshot", "sealStorageSnapshot"], delete: ["beginDeleteAttempt", "recordDeleteResult"], verify: ["beginVerificationAttempt", "recordVerificationResult"], finalize: ["finalizeStorageStage"], replay: [] }
};
export function guardInvocationRepository(repository, snapshot) {
  const { stage, action, targetId } = snapshot.spec;
  const { requestId, a } = snapshot.context;
  const counts = new Map();
  return Object.fromEntries(Object.entries(repository).map(([name, fn]) => [name, async (...args) => {
    if (typeof fn !== "function") throw new Error("unknown repository method");
    const first = args[0];
    if (typeof first === "string") {
      evidenceAssert(first === requestId || first === snapshot.context.requestRef, "repository exact request");
      if (typeof args[1] === "string") evidenceAssert(args[1] === a.userId, "repository exact owner");
    } else if (first) {
      for (const [field, expected] of [["deletionRequestId", requestId], ["userId", a.userId], ["expectedUserId", a.userId], ["expectedTargetUserId", a.userId], ["targetId", targetId]]) {
        if (field in first) exactEvidence(first[field], expected, `repository ${field}`);
      }
    }
    const read = name.startsWith("get") || name.startsWith("list") || name === "resolveAuthority";
    if (!read) {
      let allowed = actionMethods[stage]?.[action];
      if (stage === "database") allowed = ["finalizeDatabaseStage"];
      if (stage === "auth") allowed = action === "replay" ? [] : ["sealAuthIntent", "beginVerificationAttempt", "recordVerificationResult", "authorizeDeleteDispatch", "recordDispatchOutcome", "finalizeAuthStage"];
      if (stage === "completion") allowed = ["finalizeCompletion"];
      const lease = ["provider", "storage"].includes(stage) && action !== "seal" && action !== "replay" && (name.startsWith("claim") || name.startsWith("release"));
      evidenceAssert(lease || allowed?.includes(name), "unapproved canonical action");
      const count = (counts.get(name) ?? 0) + 1; counts.set(name, count);
      evidenceAssert(count <= (stage === "auth" && ["beginVerificationAttempt", "recordVerificationResult"].includes(name) ? 2 : 1), "bounded canonical calls");
    }
    const result = await fn(...args);
    if (name.startsWith("list")) {
      const expected = snapshot.actual[`${stage}Targets`];
      const project = rows => rows.map(t => ({ id: t.id, status: t.status, deletion_request_id: t.deletion_request_id, user_id: t.user_id, delete_attempt_count: t.delete_attempt_count })).sort((x, y) => x.id.localeCompare(y.id));
      exactEvidence(project(result), project(expected), "current target identity/state");
    }
    return result;
  }]));
}
export function guardInvocationExternal(adapter, snapshot) {
  const { stage, action, targetId } = snapshot.spec;
  const target = snapshot.actual[`${stage}Targets`]?.find(x => x.id === targetId);
  let actions = 0; let inventoryReads = 0; let authReads = 0;
  const methods = stage === "provider" ? ["deleteVoice", "reconcileVoiceAbsence"] : stage === "storage" ? ["listOwnedInventory", "deleteObject", "verifyObjectAbsence"] : ["getUserById", "deleteUser"];
  return Object.fromEntries(methods.map(name => [name, async (...args) => {
    const fn = adapter[name]; evidenceAssert(typeof fn === "function", "required external method");
    const input = args[0];
    if (stage === "provider") {
      evidenceAssert(name === (action === "delete" ? "deleteVoice" : action === "verify" ? "reconcileVoiceAbsence" : ""), "approved Provider action");
      evidenceAssert(target && input.providerResourceId === target.provider_resource_id && ++actions <= 1, "approved exact Provider target");
    } else if (stage === "storage") {
      if (name === "listOwnedInventory") evidenceAssert(action === "seal" && input === snapshot.context.a.userId && ++inventoryReads <= 2, "Storage seal inventory");
      else {
        evidenceAssert(name === (action === "delete" ? "deleteObject" : action === "verify" ? "verifyObjectAbsence" : ""), "approved Storage action");
        evidenceAssert(target && input.userId === snapshot.context.a.userId && input.objectKey === target.storage_object_key && input.targetKind === target.target_kind && ++actions <= 1, "approved exact Storage target");
      }
    } else {
      evidenceAssert(stage === "auth" && action === "auth_step" && input === snapshot.context.a.userId, "exact Auth action/identity");
      if (name === "getUserById") evidenceAssert(++authReads <= 2, "Auth read bound");
      else evidenceAssert(name === "deleteUser" && ++actions <= 1, "Auth deletion bound");
    }
    return fn.apply(adapter, args);
  }]));
}
export async function executeInvocationCanonicalOperator(runDirectory, proofPath, consumedPath) {
  evidenceAssert(arguments.length === 3 && process.env.G5D4_INTERNAL_CHILD === "1" && process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE === "1", "internal invocation guard");
  const snapshot = readInvocationSnapshot(runDirectory, proofPath, "live");
  assertFreshInvocation(snapshot);
  const authorization = readInvocationAuthorization(runDirectory, consumedPath, snapshot, "consumed");
  atomicPublishPrivateFile(runDirectory, `${authorization.id}-operator-started.json`, "{}\n");
  const stage = snapshot.spec.stage;
  const modules = {
    provider: ["provider", "Provider"], storage: ["storage", "Storage"], database: ["database", "Database"], auth: ["auth", "Auth"], completion: ["completion", "Completion"]
  };
  const [slug, label] = modules[stage];
  const service = await import(`../services/account-deletion/account-deletion-${slug}-operator.service.ts`);
  const repositorySlug = stage === "database" ? "database-finalizer" : stage === "completion" ? "completion" : `${slug}-durable`;
  const repoModule = await import(`../services/account-deletion/account-deletion-${repositorySlug}.repository.ts`);
  const repositoryName = `createAccountDeletion${label}${stage === "database" ? "Finalizer" : stage === "completion" ? "" : "Durable"}Repository`;
  const options = { env: process.env, repository: guardInvocationRepository(repoModule[repositoryName](), snapshot) };
  if (stage === "provider") {
    const module = await import("../providers/voice-deletion/index.ts");
    options.providerAdapter = guardInvocationExternal(module.createElevenLabsVoiceDeletionProviderAdapter(), snapshot);
  } else if (stage === "storage") {
    const module = await import("../services/account-deletion/account-deletion-storage-adapter.ts");
    options.storageAdapter = guardInvocationExternal(module.createAccountDeletionStorageAdapter(), snapshot);
  } else if (stage === "auth") {
    const module = await import("../services/account-deletion/account-deletion-auth-adapter.ts");
    options.authAdapter = guardInvocationExternal(module.createAccountDeletionAuthProductionAdapter(), snapshot);
  }
  const bridge = service[`createAccountDeletion${label}OperatorBridge`](options);
  const { parseArgs, runAccountDeletionOperator } = await import("./account-deletion-operator-runner.mjs");
  const args = ["--stage", stage, "--request", snapshot.context.requestRef, "--execute", "--proof", proofPath,
    "--env-label", snapshot.environment.projectLabel, "--latest-dry-run-runnable", "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"];
  if (stage !== "provider") args.push("--prior-stage-satisfied");
  let resolveCalls = 0; let stageCalls = 0;
  return runAccountDeletionOperator(parseArgs(args), {
    env: process.env,
    requestResolver: async input => {
      evidenceAssert(++resolveCalls === 1 && input.stage === stage && input.requestRef === snapshot.context.requestRef, "exact canonical resolver call");
      const resolved = await bridge.requestResolver(input);
      if (resolved.ok) {
        const internal = resolved.internal;
        evidenceAssert(internal?.deletionRequestId === snapshot.context.requestId, "resolved exact request");
        if (internal.userId != null) evidenceAssert(internal.userId === snapshot.context.a.userId, "resolved exact user");
        if (internal.expectedUserId != null) evidenceAssert(internal.expectedUserId === snapshot.context.a.userId, "resolved exact expected user");
      }
      return resolved;
    },
    stageServices: { [stage]: async input => { evidenceAssert(++stageCalls === 1, "one canonical invocation"); return bridge.stageServices[stage](input); } }
  });
}
