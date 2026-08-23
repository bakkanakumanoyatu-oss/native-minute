import "server-only";
import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  Json,
  VoiceDeletionTargetKind
} from "@/types/database";

type VoiceDeletionOperationRow = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type VoiceDeletionTargetRow = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type PostgrestErrorLike = { message: string; code?: string };
type CreateOrGetOperationResult = { operation_id: string; created: boolean };

const ACTIVE_OPERATION_STATUSES = ["pending", "processing", "partial_failure", "manual_required"] as const;

export type VoiceDeletionSnapshotTarget = {
  targetKind: VoiceDeletionTargetKind;
  targetFingerprint: string;
  sourceRowId?: string | null;
  providerName?: string | null;
  providerResourceId?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
};

export type VoiceDeletionLeaseClaim = {
  operationId: string;
  userId: string;
  leaseToken: string;
  leaseSeconds: number;
};

export type VoiceDeletionRepository = {
  createOrGetActiveOperation(userId: string): Promise<{ operation: VoiceDeletionOperationRow; created: boolean }>;
  getActiveOperation(userId: string): Promise<VoiceDeletionOperationRow | null>;
  getOperationForUser(operationId: string, userId: string): Promise<VoiceDeletionOperationRow | null>;
  insertSnapshotTargets(
    operationId: string,
    userId: string,
    targets: VoiceDeletionSnapshotTarget[]
  ): Promise<VoiceDeletionOperationRow>;
  sealSnapshot(
    operationId: string,
    userId: string,
    targets: VoiceDeletionSnapshotTarget[]
  ): Promise<VoiceDeletionOperationRow>;
  listOperationTargets(operationId: string, userId: string): Promise<VoiceDeletionTargetRow[]>;
  claimExpiredOrAvailableLease(input: VoiceDeletionLeaseClaim): Promise<VoiceDeletionOperationRow | null>;
  releaseLease(input: Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken">): Promise<boolean>;
  finalizeOperation(operationId: string, userId: string, leaseToken: string): Promise<VoiceDeletionOperationRow>;
};

function asSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function isCreateOrGetOperationResult(value: unknown): value is CreateOrGetOperationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "operation_id" in value &&
    typeof value.operation_id === "string" &&
    value.operation_id.length > 0 &&
    "created" in value &&
    typeof value.created === "boolean"
  );
}

function mapRepositoryError(operation: string, error: PostgrestErrorLike) {
  return new AppError(500, `${operation}に失敗しました。`);
}

function toSnapshotTargetPayload(targets: VoiceDeletionSnapshotTarget[]): Json {
  return targets.map((target) => ({
    target_kind: target.targetKind,
    target_fingerprint: target.targetFingerprint,
    source_row_id: target.sourceRowId ?? null,
    provider_name: target.providerName ?? null,
    provider_resource_id: target.providerResourceId ?? null,
    storage_bucket: target.storageBucket ?? null,
    storage_object_key: target.storageObjectKey ?? null
  }));
}

/**
 * This repository is intentionally server-only. It owns durable operation and target
 * records but does not call provider, Storage, consent, or deletion services.
 */
export function createVoiceDeletionRepository(client: ServiceRoleClient = createSupabaseAdminClient()): VoiceDeletionRepository {
  async function getActiveOperation(userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client
        .from("voice_deletion_operations")
        .select("*")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_OPERATION_STATUSES])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("進行中の voice deletion operation の取得", result.error);
    }

    return result.data;
  }

  async function getOperationForUser(operationId: string, userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client
        .from("voice_deletion_operations")
        .select("*")
        .eq("id", operationId)
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation の取得", result.error);
    }

    return result.data;
  }

  async function createOrGetActiveOperation(userId: string) {
    const result = asSingle<CreateOrGetOperationResult>(
      await client.rpc("create_or_get_voice_deletion_operation", { p_user_id: userId }).single()
    );

    if (result.error || !isCreateOrGetOperationResult(result.data)) {
      throw mapRepositoryError("voice deletion operation の作成", result.error ?? { message: "operation row was not returned" });
    }

    const operation = await getOperationForUser(result.data.operation_id, userId);

    if (!operation) {
      throw mapRepositoryError("voice deletion operation の取得", { message: "operation row was not returned" });
    }

    return { operation, created: result.data.created };
  }

  async function sealSnapshot(operationId: string, userId: string, targets: VoiceDeletionSnapshotTarget[]) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("seal_voice_deletion_snapshot", {
        p_operation_id: operationId,
        p_user_id: userId,
        p_targets: toSnapshotTargetPayload(targets)
      })
    );

    if (result.error || !result.data) {
      throw mapRepositoryError("voice deletion snapshot の atomic seal", result.error ?? { message: "operation row was not returned" });
    }

    return result.data;
  }

  async function listOperationTargets(operationId: string, userId: string) {
    const result = asMany<VoiceDeletionTargetRow>(
      await client
        .from("voice_deletion_targets")
        .select("*")
        .eq("operation_id", operationId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion target の取得", result.error);
    }

    return result.data ?? [];
  }

  async function claimExpiredOrAvailableLease(input: VoiceDeletionLeaseClaim) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("claim_voice_deletion_operation_lease", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_lease_seconds: input.leaseSeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation lease の取得", result.error);
    }

    return result.data;
  }

  async function releaseLease(input: Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken">) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("release_voice_deletion_operation_lease", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation lease の解放", result.error);
    }

    return result.data !== null;
  }

  async function finalizeOperation(operationId: string, userId: string, leaseToken: string) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("finalize_voice_deletion_operation", {
        p_operation_id: operationId,
        p_user_id: userId,
        p_lease_token: leaseToken
      })
    );

    if (result.error || !result.data) {
      throw mapRepositoryError("voice deletion operation の安全な完了", result.error ?? { message: "operation row was not returned" });
    }

    return result.data;
  }

  return {
    createOrGetActiveOperation,
    getActiveOperation,
    getOperationForUser,
    // A standalone target insert is deliberately unavailable: this alias preserves the
    // repository contract while routing every snapshot through the single atomic RPC.
    insertSnapshotTargets: sealSnapshot,
    sealSnapshot,
    listOperationTargets,
    claimExpiredOrAvailableLease,
    releaseLease,
    // Completion deliberately has no generic status-update helper: the focused RPC
    // atomically proves target verification, scrubs locators, and closes the lease.
    finalizeOperation
  };
}
