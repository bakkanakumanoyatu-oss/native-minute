import "server-only";
import { randomUUID } from "node:crypto";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createElevenLabsVoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type { Database } from "@/types/database";
import { runVoiceDeletionConsentStep } from "./voice-deletion-consent-runner";
import {
  hasValidPartialFailureRetryAt,
  hasVoiceDeletionManualCandidate,
  isAlreadyNoVoiceInventory,
  mapVoiceDeletionClientState,
  type SafeVoiceDeletionClientState
} from "./voice-deletion-client-state";
import { runVoiceDeletionDatabaseStep } from "./voice-deletion-database-runner";
import { runVoiceDeletionPostDeleteVerificationStep } from "./voice-deletion-post-delete-verification-runner";
import { runVoiceDeletionProviderStep } from "./voice-deletion-provider-runner";
import {
  createVoiceDeletionRepository,
  type VoiceDeletionRepository
} from "./voice-deletion.repository";
import { createVoiceDeletionStorageAdapter } from "./voice-deletion-storage-adapter";
import { runVoiceDeletionStorageStep } from "./voice-deletion-storage-runner";
import {
  collectVoiceOnlyDeletionSnapshot,
  createVoiceOnlyDeletionDurableSnapshotTargets,
  type VoiceOnlyDeletionSnapshot
} from "./voice-deletion.service";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type OperationInput = { client: AppSupabaseClient; userId: string };
type StepInput = { operationId: string; userId: string };
type StepRunner = (input: StepInput) => Promise<unknown>;

const DATABASE_TARGET_KINDS = new Set(["saved_model_audio", "script_audio", "voice_binding"]);
const PROVIDER_TARGET_KINDS = new Set(["provider_voice"]);
const STORAGE_TARGET_KINDS = new Set(["voice_sample", "voice_consent_recording", "script_audio_storage"]);
const DEFAULT_LEASE_SECONDS = 60;

export type VoiceDeletionOperationService = {
  getStatus(input: OperationInput): Promise<SafeVoiceDeletionClientState>;
  request(input: OperationInput): Promise<SafeVoiceDeletionClientState>;
  advance(input: OperationInput): Promise<SafeVoiceDeletionClientState>;
};

export type VoiceDeletionOperationServiceDependencies = {
  repository: VoiceDeletionRepository;
  collectSnapshot(client: AppSupabaseClient, userId: string): Promise<VoiceOnlyDeletionSnapshot>;
  runConsentStep: StepRunner;
  runProviderStep: StepRunner;
  runStorageStep: StepRunner;
  runDatabaseStep: StepRunner;
  runPostDeleteVerificationStep: StepRunner;
  createLeaseToken(): string;
  now(): Date;
};

function databaseTargetsAreComplete(targets: Target[]) {
  return targets
    .filter((target) => DATABASE_TARGET_KINDS.has(target.target_kind))
    .every(
      (target) =>
        target.status === "verified_absent" &&
        target.verification_status === "verified_absent" &&
        target.reconciliation_status === "not_applicable"
    );
}

function providerTargetsAreVerifiedAbsent(targets: Target[]) {
  return targets
    .filter((target) => PROVIDER_TARGET_KINDS.has(target.target_kind))
    .every(
      (target) =>
        target.status === "verified_absent" &&
        target.verification_status === "not_applicable" &&
        target.reconciliation_status === "verified_absent"
    );
}

function storageTargetsAreVerifiedAbsent(targets: Target[]) {
  return targets
    .filter((target) => STORAGE_TARGET_KINDS.has(target.target_kind))
    .every(
      (target) =>
        target.status === "verified_absent" &&
        target.verification_status === "verified_absent" &&
        target.reconciliation_status === "not_applicable" &&
        target.delete_attempt_count >= 1
    );
}

function hasManualTarget(targets: Target[]) {
  return targets.some((target) => target.status === "manual_required");
}

function retryIsInFuture(operation: Operation, now: Date) {
  return Boolean(
    operation.next_retry_at &&
      Number.isFinite(Date.parse(operation.next_retry_at)) &&
      Date.parse(operation.next_retry_at) > now.getTime()
  );
}

function createDefaultDependencies(): VoiceDeletionOperationServiceDependencies {
  const repository = createVoiceDeletionRepository();
  const providerAdapter = createElevenLabsVoiceDeletionProviderAdapter();
  const storageAdapter = createVoiceDeletionStorageAdapter();

  return {
    repository,
    collectSnapshot: collectVoiceOnlyDeletionSnapshot,
    runConsentStep: (input) => runVoiceDeletionConsentStep(input, { repository }),
    runProviderStep: (input) => runVoiceDeletionProviderStep(input, { repository, providerAdapter }),
    runStorageStep: (input) => runVoiceDeletionStorageStep(input, { repository, storageAdapter }),
    runDatabaseStep: (input) => runVoiceDeletionDatabaseStep(input, { repository }),
    runPostDeleteVerificationStep: (input) =>
      runVoiceDeletionPostDeleteVerificationStep(input, { repository }),
    createLeaseToken: randomUUID,
    now: () => new Date()
  };
}

export function createVoiceDeletionOperationService(
  provided?: VoiceDeletionOperationServiceDependencies
): VoiceDeletionOperationService {
  const dependencies = provided ?? createDefaultDependencies();
  const { repository } = dependencies;

  async function mapCurrent(
    input: OperationInput,
    operation?: Operation | null,
    inventory?: VoiceOnlyDeletionSnapshot
  ) {
    const currentInventory = inventory ?? (await dependencies.collectSnapshot(input.client, input.userId));
    const currentOperation = operation === undefined
      ? (await repository.getActiveOperation(input.userId)) ?? (await repository.getLatestOperation(input.userId))
      : operation;

    return mapVoiceDeletionClientState({
      operation: currentOperation,
      inventory: currentInventory,
      now: dependencies.now()
    });
  }

  async function finalizeOneStep(operation: Operation, userId: string) {
    const leaseToken = dependencies.createLeaseToken();
    const lease = await repository.claimExpiredOrAvailableLease({
      operationId: operation.id,
      userId,
      leaseToken,
      leaseSeconds: DEFAULT_LEASE_SECONDS
    });

    if (!lease) {
      return;
    }

    try {
      if (
        lease.status === "processing" &&
        lease.current_stage === "post_delete_verification" &&
        lease.post_delete_verification_status === "succeeded"
      ) {
        await repository.finalizeOperation(operation.id, userId, leaseToken);
      }
    } finally {
      await repository.releaseLease({ operationId: operation.id, userId, leaseToken });
    }
  }

  async function advanceOneStep(
    input: OperationInput,
    operation: Operation,
    inventory?: VoiceOnlyDeletionSnapshot
  ) {
    if (operation.status === "manual_required" || operation.status === "failed" || operation.status === "completed") {
      return;
    }
    if (operation.status === "partial_failure") {
      if (!hasValidPartialFailureRetryAt(operation) || retryIsInFuture(operation, dependencies.now())) {
        return;
      }
    }

    const stepInput = { operationId: operation.id, userId: input.userId };

    if (operation.snapshot_status === "pending") {
      const snapshot = inventory ?? (await dependencies.collectSnapshot(input.client, input.userId));
      if (hasVoiceDeletionManualCandidate(snapshot)) {
        await repository.markPreflightManualRequired(input.userId);
        return;
      }
      await repository.sealSnapshot(
        operation.id,
        input.userId,
        createVoiceOnlyDeletionDurableSnapshotTargets(snapshot)
      );
      return;
    }

    if (operation.current_stage === null || operation.current_stage === "consent_withdrawal") {
      await dependencies.runConsentStep(stepInput);
      return;
    }
    if (operation.current_stage === "provider_cleanup") {
      const targets = await repository.listOperationTargets(operation.id, input.userId);
      if (providerTargetsAreVerifiedAbsent(targets)) {
        if (!hasManualTarget(targets)) {
          // Storage owns its entry transition. This POST cannot also complete a
          // provider target, because that branch returned through its runner.
          await dependencies.runStorageStep(stepInput);
        }
      } else {
        await dependencies.runProviderStep(stepInput);
      }
      return;
    }
    if (operation.current_stage === "storage_cleanup") {
      const targets = await repository.listOperationTargets(operation.id, input.userId);
      if (storageTargetsAreVerifiedAbsent(targets)) {
        if (!hasManualTarget(targets)) {
          // DB owns its entry transition and therefore runs only on a later POST.
          await dependencies.runDatabaseStep(stepInput);
        }
      } else {
        await dependencies.runStorageStep(stepInput);
      }
      return;
    }
    if (operation.current_stage === "database_cleanup") {
      const targets = await repository.listOperationTargets(operation.id, input.userId);
      if (databaseTargetsAreComplete(targets)) {
        await dependencies.runPostDeleteVerificationStep(stepInput);
      } else {
        await dependencies.runDatabaseStep(stepInput);
      }
      return;
    }
    if (operation.current_stage === "post_delete_verification") {
      if (operation.post_delete_verification_status === "succeeded") {
        await finalizeOneStep(operation, input.userId);
      } else {
        await dependencies.runPostDeleteVerificationStep(stepInput);
      }
    }
  }

  return {
    async getStatus(input) {
      return mapCurrent(input);
    },

    async request(input) {
      const inventory = await dependencies.collectSnapshot(input.client, input.userId);
      const active = await repository.getActiveOperation(input.userId);

      if (active) {
        await advanceOneStep(input, active, inventory);
        return mapCurrent(
          input,
          await repository.getOperationForUser(active.id, input.userId),
          inventory
        );
      }

      const latest = await repository.getLatestOperation(input.userId);
      if (latest?.status === "failed") {
        return mapCurrent(input, latest, inventory);
      }
      if (isAlreadyNoVoiceInventory(inventory)) {
        return mapCurrent(input, latest, inventory);
      }
      if (hasVoiceDeletionManualCandidate(inventory)) {
        const manual = await repository.markPreflightManualRequired(input.userId);
        return mapCurrent(input, manual, inventory);
      }

      const created = await repository.createOrGetActiveOperation(input.userId);
      return mapCurrent(input, created.operation, inventory);
    },

    async advance(input) {
      const operation = await repository.getActiveOperation(input.userId);
      if (!operation) {
        return mapCurrent(input);
      }

      await advanceOneStep(input, operation);
      const current = await repository.getOperationForUser(operation.id, input.userId);
      return mapCurrent(input, current);
    }
  };
}

export async function getVoiceDeletionStatus(input: OperationInput) {
  return createVoiceDeletionOperationService().getStatus(input);
}

export async function requestVoiceDeletion(input: OperationInput) {
  return createVoiceDeletionOperationService().request(input);
}

export async function advanceVoiceDeletion(input: OperationInput) {
  return createVoiceDeletionOperationService().advance(input);
}
