/**
 * Server-only boundary for a sealed, provider-owned voice resource. These values
 * must be sourced by a future runner from a durable target, never from a client.
 */
export type DeleteVoiceInput = {
  providerResourceId: string;
};

export type ReconcileVoiceAbsenceInput = {
  providerResourceId: string;
};

/** Provider protocol outcomes, deliberately distinct from durable target states. */
export type VoiceDeletionProviderFailureKind =
  | "credential_missing"
  | "invalid_provider_reference"
  | "not_found"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network_error"
  | "provider_rejected"
  | "protocol_error";

export type DeleteVoiceResult =
  | { kind: "deleted" }
  | { kind: VoiceDeletionProviderFailureKind };

export type ReconcileVoiceAbsenceResult =
  | { kind: "present"; ownerSignal: "true" | "false" | "unknown" }
  | { kind: "verified_absent" }
  | { kind: Exclude<VoiceDeletionProviderFailureKind, "not_found"> };

export interface VoiceDeletionProviderAdapter {
  deleteVoice(input: DeleteVoiceInput): Promise<DeleteVoiceResult>;
  reconcileVoiceAbsence(input: ReconcileVoiceAbsenceInput): Promise<ReconcileVoiceAbsenceResult>;
}
