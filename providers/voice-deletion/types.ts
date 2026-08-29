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

/**
 * Closed evidence from one diagnostic provider GET. This deliberately excludes
 * raw provider payloads, messages, identifiers, URLs, headers, and credentials.
 */
export type VoiceDeletionProviderDiagnosticEvidence = {
  adapterOutcome:
    | "present_owner_true"
    | "present_owner_false"
    | "present_owner_unknown"
    | "strict_voice_not_found"
    | "credential_missing"
    | "invalid_provider_reference"
    | "auth_failed"
    | "permission_denied"
    | "rate_limited"
    | "provider_unavailable"
    | "timeout"
    | "network_error"
    | "provider_rejected"
    | "protocol_error";
  httpStatusCategory:
    | "success"
    | "not_found"
    | "authentication_rejected"
    | "authorization_rejected"
    | "rate_limited"
    | "provider_rejected"
    | "provider_unavailable"
    | "protocol_error"
    | "not_called";
  safeProviderType: "not_found" | "authentication_error" | "other" | "unknown";
  safeProviderCode: "voice_not_found" | "invalid_api_key" | "other" | "unknown";
  mapperBranch:
    | "present_matching_voice"
    | "present_protocol_error"
    | "strict_voice_not_found"
    | "not_found_protocol_error"
    | "http_authentication_rejected"
    | "http_authorization_rejected"
    | "http_rate_limited"
    | "http_provider_unavailable"
    | "http_provider_rejected"
    | "unexpected_http_status"
    | "credential_missing"
    | "invalid_provider_reference"
    | "timeout"
    | "network_error";
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

/**
 * Read-only diagnostic projection. It is intentionally separate from normal
 * runner results so durable deletion decisions continue to use result.kind.
 */
export type ReconcileVoiceAbsenceDiagnosticResult = {
  result: ReconcileVoiceAbsenceResult;
  evidence: VoiceDeletionProviderDiagnosticEvidence;
};

export interface VoiceDeletionProviderAdapter {
  deleteVoice(input: DeleteVoiceInput): Promise<DeleteVoiceResult>;
  reconcileVoiceAbsence(input: ReconcileVoiceAbsenceInput): Promise<ReconcileVoiceAbsenceResult>;
}

export interface VoiceDeletionProviderDiagnosticAdapter {
  reconcileVoiceAbsenceWithSafeEvidence(
    input: ReconcileVoiceAbsenceInput
  ): Promise<ReconcileVoiceAbsenceDiagnosticResult>;
}
