import { z } from "zod";
import { G5D4_SCHEMA_VERSIONS } from "./g5d4-proof-contract.mjs";

export const G5D4_FORBIDDEN_FIXTURE_PATHS = Object.freeze([
  "direct_storage_upload",
  "uploadOwnedRecording",
  "admin_recording_insert",
  "automated_magic_link_session"
]);

export const G5D4_FIXTURE_PREPARATION_STATES = Object.freeze([
  "not_started",
  "fixture_a_login_verified",
  "fixture_b_login_verified",
  "processing_consents_verified",
  "consent_sample_material_verified",
  "normal_recordings_verified",
  "provider_awareness_verified",
  "deletion_request_verified",
  "prep_stop_verified",
  "targets_sealed_verified",
  "human_gate_ready"
]);

const preparationStateSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.fixturePreparation),
    state: z.enum(G5D4_FIXTURE_PREPARATION_STATES),
    completedCheckpoints: z.array(z.enum(G5D4_FIXTURE_PREPARATION_STATES)),
    nextCheckpoint: z.enum(G5D4_FIXTURE_PREPARATION_STATES).nullable(),
    humanActionRequired: z.boolean(),
    destructiveExecutionAuthorized: z.literal(false)
  })
  .strict();

const checkpointEvidenceSchemas = Object.freeze({
  fixture_a_login_verified: z
    .object({ fixtureRole: z.literal("fixture_a"), magicLinkLoginObserved: z.literal(true) })
    .strict(),
  fixture_b_login_verified: z
    .object({ fixtureRole: z.literal("fixture_b"), magicLinkLoginObserved: z.literal(true) })
    .strict(),
  processing_consents_verified: z
    .object({
      fixtureAConsentCount: z.literal(2),
      fixtureBConsentCount: z.literal(2),
      voiceCloningAcceptedForBoth: z.literal(true),
      pronunciationProcessingAcceptedForBoth: z.literal(true)
    })
    .strict(),
  consent_sample_material_verified: z
    .object({
      fixtureAConsentSamplePresent: z.literal(true),
      fixtureBConsentSamplePresent: z.literal(true),
      personalMaterialExcluded: z.literal(true)
    })
    .strict(),
  normal_recordings_verified: z
    .object({
      fixtureARecordingPresent: z.literal(true),
      fixtureBRecordingPresent: z.literal(true),
      recordingContract: z.enum(["consent_gated_web", "consent_gated_mobile"]),
      directStorageBypassUsed: z.literal(false)
    })
    .strict(),
  provider_awareness_verified: z
    .object({
      disposableProviderResourceCountA: z.literal(1),
      disposableProviderResourceCountB: z.literal(1),
      humanProviderAwarenessObserved: z.literal(true)
    })
    .strict(),
  deletion_request_verified: z
    .object({
      fixtureADeletionRequestCount: z.literal(1),
      fixtureARequestState: z.literal("confirmed"),
      fixtureBDeletionRequestCount: z.literal(0)
    })
    .strict(),
  prep_stop_verified: z
    .object({
      fixtureAObservedRows: z.literal(17),
      fixtureBObservedRows: z.literal(16),
      durableTargetsBeforeSeal: z.literal(0),
      destructiveMutations: z.literal(0)
    })
    .strict(),
  targets_sealed_verified: z
    .object({
      fixtureAObservedRows: z.literal(22),
      providerTargets: z.literal(1),
      storageTargets: z.literal(4),
      durableTargets: z.literal(5),
      deletedRows: z.literal(15),
      anonymizedRows: z.literal(1),
      retainedRows: z.literal(6),
      destructiveMutations: z.literal(0)
    })
    .strict(),
  human_gate_ready: z
    .object({
      sealedManifestVerified: z.literal(true),
      collectorCurrent: z.literal(true),
      humanAuthorizationCreated: z.literal(false),
      destructiveGuardEnabled: z.literal(false)
    })
    .strict()
});

const ORDER = G5D4_FIXTURE_PREPARATION_STATES;

export function createFixturePreparationState() {
  return preparationStateSchema.parse({
    schemaVersion: G5D4_SCHEMA_VERSIONS.fixturePreparation,
    state: "not_started",
    completedCheckpoints: [],
    nextCheckpoint: "fixture_a_login_verified",
    humanActionRequired: true,
    destructiveExecutionAuthorized: false
  });
}

export function advanceFixturePreparation(currentState, checkpoint, evidence) {
  const current = preparationStateSchema.parse(currentState);
  if (checkpoint !== current.nextCheckpoint) throw new Error("fixture preparation checkpoint order mismatch");
  const evidenceSchema = checkpointEvidenceSchemas[checkpoint];
  if (!evidenceSchema) throw new Error("fixture preparation checkpoint is not advanceable");
  evidenceSchema.parse(evidence);
  if (
    checkpoint === "normal_recordings_verified" &&
    (evidence.directStorageBypassUsed || !evidence.recordingContract.startsWith("consent_gated_"))
  ) {
    throw new Error("canonical recording fixture must use the normal consent-gated Web/Mobile contract");
  }

  const index = ORDER.indexOf(checkpoint);
  const nextCheckpoint = ORDER[index + 1] ?? null;
  return preparationStateSchema.parse({
    ...current,
    state: checkpoint,
    completedCheckpoints: [...current.completedCheckpoints, checkpoint],
    nextCheckpoint,
    humanActionRequired: checkpoint !== "human_gate_ready",
    destructiveExecutionAuthorized: false
  });
}

function assertReadOnlyPreparationVerifier(verifier) {
  if (!verifier || typeof verifier !== "object") throw new Error("fixture verifier missing");
  const keys = Object.keys(verifier).sort();
  if (keys.length !== 1 || keys[0] !== "inspectCheckpoint" || typeof verifier.inspectCheckpoint !== "function") {
    throw new Error("fixture helper exposes verification only");
  }
  return verifier;
}

export async function verifyAndAdvanceFixturePreparation(currentState, verifier) {
  const current = preparationStateSchema.parse(currentState);
  if (current.nextCheckpoint === null) return current;
  const readOnlyVerifier = assertReadOnlyPreparationVerifier(verifier);
  const evidence = await readOnlyVerifier.inspectCheckpoint({ checkpoint: current.nextCheckpoint });
  return advanceFixturePreparation(current, current.nextCheckpoint, evidence);
}

export function assertFixturePreparationHasNoUnsafeAutomation(sourceText) {
  const importPattern = /import\s*\{[^}]*\buploadOwnedRecording\b[^}]*\}\s*from/;
  const unsafeSessionPattern = /^\s*import[^\n]*(?:playwright|puppeteer)|browser\.click\s*\(/im;
  if (importPattern.test(sourceText) || unsafeSessionPattern.test(sourceText)) {
    throw new Error("unsafe fixture preparation automation detected");
  }
  return true;
}
