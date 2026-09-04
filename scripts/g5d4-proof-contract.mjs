import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const G5D4_SCHEMA_VERSIONS = Object.freeze({
  privateManifest: "g5d4.private-manifest.v2",
  collectorSafe: "g5d4.collector-safe.v2",
  authorization: "g5d4.authorization.v2",
  proofBinding: "g5d4.proof-binding.v2",
  wrapperSafe: "g5d4.wrapper-safe.v1",
  fixturePreparation: "g5d4.fixture-preparation.v1"
});

export const G5D4_PROVENANCE = Object.freeze({
  live: Object.freeze({
    runPurpose: "g5d4_live",
    confirmation: "human_tty_live_v1",
    collector: "live_read_only_v1"
  }),
  selfTest: Object.freeze({
    runPurpose: "g5d4_self_test",
    confirmation: "self_test_v1",
    collector: "self_test_v1"
  })
});

export const G5D4_CANONICAL_STAGING = Object.freeze({
  projectLabel: "native-minute-staging",
  projectRef: "ztlliqishddrrvqqrrlu",
  environment: "canonical_staging"
});

export const G5D4_REQUIRED_MIGRATIONS = Object.freeze(
  Array.from({ length: 27 }, (_, index) => String(index + 1).padStart(4, "0"))
);

export const G5D4_ALIAS_ROLES = Object.freeze([
  "fixture_a",
  "fixture_b",
  "provider_resource",
  "storage_target",
  "request",
  "target_set"
]);

export const G5D4_WRITER_INTENT_KINDS = Object.freeze([
  "voice_create",
  "script_audio_create",
  "voice_sample_upload",
  "voice_consent_upload",
  "recording_upload"
]);

export const G5D4_PROCESSING_CONSENTS = Object.freeze([
  "voice_cloning",
  "pronunciation_processing"
]);

export const G5D4_STORAGE_BUCKETS = Object.freeze([
  "recordings",
  "script-audios",
  "voice-samples",
  "voice-consents"
]);

export const G5D4_MICRO_STEPS = Object.freeze([
  "fixture_a_magic_link",
  "fixture_b_magic_link",
  "processing_consents",
  "consent_sample_material",
  "normal_recording_flow",
  "provider_awareness",
  "deletion_request_confirmation",
  "seal_targets",
  "provider_cleanup",
  "storage_cleanup",
  "database_cleanup",
  "auth_cleanup",
  "completion_verification",
  "replay_verification",
  "mandatory_stop"
]);

export const G5D4_OPERATOR_MICRO_STEPS = Object.freeze({
  provider_cleanup: "provider",
  storage_cleanup: "storage",
  database_cleanup: "database",
  auth_cleanup: "auth",
  completion_verification: "completion"
});

const TABLE_DEFINITIONS = [
  ["profiles", "delete", 1],
  ["scripts", "delete", 1],
  ["script_audios", "cascade", 1],
  ["takes", "delete", 1],
  ["weak_words", "cascade", 1],
  ["coach_feedback", "cascade", 1],
  ["script_saved_model_audios", "cascade", 0],
  ["script_saved_best_takes", "cascade", 0],
  ["voices", "delete", 1],
  ["voice_consents", "delete", 1],
  ["processing_consents", "delete", 2],
  ["voice_deletion_operations", "anonymize", 0],
  ["voice_deletion_targets", "retain", 0],
  ["voice_asset_write_intents", "delete", 5],
  ["account_deletion_requests", "retain", 1],
  ["account_deletion_provider_targets", "retain", 0],
  ["quota_events", "anonymize", 1],
  ["account_deletion_storage_targets", "retain", 0]
];

export const G5D4_A_PREP_TABLE_CONTRACT = Object.freeze(
  TABLE_DEFINITIONS.map(([table, category, count]) => Object.freeze({ table, category, count }))
);

export const G5D4_A_SEALED_TABLE_CONTRACT = Object.freeze(
  TABLE_DEFINITIONS.map(([table, category, count]) =>
    Object.freeze({
      table,
      category,
      count:
        table === "account_deletion_provider_targets"
          ? 1
          : table === "account_deletion_storage_targets"
            ? 4
            : count
    })
  )
);

export const G5D4_B_CONTROL_TABLE_CONTRACT = Object.freeze(
  TABLE_DEFINITIONS.map(([table, category, count]) =>
    Object.freeze({
      table,
      category,
      count:
        table === "account_deletion_requests" ||
        table === "account_deletion_provider_targets" ||
        table === "account_deletion_storage_targets"
          ? 0
          : count
    })
  )
);

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const runIdSchema = z.string().regex(/^g5d4_run_[0-9a-f]{32}$/);
const authorizationIdSchema = z.string().regex(/^g5d4_authz_[0-9a-f]{32}$/);
export const g5d4AliasSchema = z.string().regex(/^g5d4_v1[0-9a-f]{64}$/);
export const g5d4MicroStepSchema = z.enum(G5D4_MICRO_STEPS);
export const g5d4OperatorMicroStepSchema = z.enum(Object.keys(G5D4_OPERATOR_MICRO_STEPS));
export const g5d4AliasRoleSchema = z.enum(G5D4_ALIAS_ROLES);

const instantSchema = z.string().datetime({ offset: true });
const nullableInstantSchema = instantSchema.nullable();
const nonNegativeIntSchema = z.number().int().nonnegative().safe();
const positiveIntSchema = z.number().int().positive().safe();

const tableCategorySchema = z.enum(["delete", "cascade", "anonymize", "retain"]);
const tableNameSchema = z.enum(TABLE_DEFINITIONS.map(([table]) => table));
const runPurposeSchema = z.enum([
  G5D4_PROVENANCE.live.runPurpose,
  G5D4_PROVENANCE.selfTest.runPurpose
]);
const confirmationProvenanceSchema = z.enum([
  G5D4_PROVENANCE.live.confirmation,
  G5D4_PROVENANCE.selfTest.confirmation
]);
const collectorProvenanceSchema = z.enum([
  G5D4_PROVENANCE.live.collector,
  G5D4_PROVENANCE.selfTest.collector
]);

function provenanceProfileMatches(value) {
  return (
    (value.runPurpose === G5D4_PROVENANCE.live.runPurpose &&
      value.confirmationProvenance === G5D4_PROVENANCE.live.confirmation &&
      value.collectorProvenance === G5D4_PROVENANCE.live.collector) ||
    (value.runPurpose === G5D4_PROVENANCE.selfTest.runPurpose &&
      value.confirmationProvenance === G5D4_PROVENANCE.selfTest.confirmation &&
      value.collectorProvenance === G5D4_PROVENANCE.selfTest.collector)
  );
}

function addProvenanceProfileIssue(value, context) {
  if (!provenanceProfileMatches(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["runPurpose"],
      message: "run purpose and provenance profile mismatch"
    });
  }
}

export const g5d4TableCountSchema = z
  .object({
    table: tableNameSchema,
    category: tableCategorySchema,
    count: nonNegativeIntSchema
  })
  .strict();

const processingConsentSchema = z
  .object({
    consentType: z.enum(G5D4_PROCESSING_CONSENTS),
    status: z.literal("active")
  })
  .strict();

const fixtureDarSchema = z
  .object({
    deleted: z.literal(15),
    anonymized: z.literal(1),
    retained: z.literal(6)
  })
  .strict();

const aFixtureContractBaseSchema = z
  .object({
    phase: z.enum(["prep_stop", "sealed"]),
    observedRows: z.union([z.literal(17), z.literal(22)]),
    prospectiveObservedRows: z.literal(22),
    dar: fixtureDarSchema,
    tables: z.array(g5d4TableCountSchema).length(18),
    processingConsents: z.array(processingConsentSchema).length(2),
    writerIntentKinds: z.array(z.enum(G5D4_WRITER_INTENT_KINDS)).length(5),
    provider: z.object({ present: z.literal(true), count: z.literal(1) }).strict(),
    storage: z.object({ required: z.literal(4), present: z.literal(4) }).strict(),
    auth: z.object({ present: z.literal(true) }).strict(),
    request: z
      .object({
        count: z.literal(1),
        state: z.enum(["requested", "confirmed"]),
        conflictCount: z.literal(0)
      })
      .strict(),
    durableTargets: z
      .object({
        provider: z.union([z.literal(0), z.literal(1)]),
        storage: z.union([z.literal(0), z.literal(4)]),
        total: z.union([z.literal(0), z.literal(5)]),
        state: z.enum(["absent", "sealed"])
      })
      .strict(),
    nextMicroStep: g5d4MicroStepSchema
  })
  .strict();

function sameOrderedValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function addExactArrayIssue(context, ok, path, message) {
  if (!ok) {
    context.addIssue({ code: z.ZodIssueCode.custom, path, message });
  }
}

export const g5d4AFixtureContractSchema = aFixtureContractBaseSchema.superRefine((value, context) => {
  const expectedTables =
    value.phase === "prep_stop" ? G5D4_A_PREP_TABLE_CONTRACT : G5D4_A_SEALED_TABLE_CONTRACT;
  const expectedObserved = value.phase === "prep_stop" ? 17 : 22;
  const expectedDurable =
    value.phase === "prep_stop"
      ? { provider: 0, storage: 0, total: 0, state: "absent" }
      : { provider: 1, storage: 4, total: 5, state: "sealed" };
  const expectedNext = value.phase === "prep_stop" ? "seal_targets" : "provider_cleanup";

  addExactArrayIssue(
    context,
    JSON.stringify(value.tables) === JSON.stringify(expectedTables),
    ["tables"],
    "A exact 18-table fixture contract mismatch"
  );
  addExactArrayIssue(
    context,
    value.observedRows === expectedObserved,
    ["observedRows"],
    "A corrected observed row count mismatch"
  );
  addExactArrayIssue(
    context,
    JSON.stringify(value.durableTargets) === JSON.stringify(expectedDurable),
    ["durableTargets"],
    "unexpected durable targets before Human Gate or sealed target mismatch"
  );
  addExactArrayIssue(
    context,
    value.nextMicroStep === expectedNext,
    ["nextMicroStep"],
    "A next micro-step mismatch"
  );
  addExactArrayIssue(
    context,
    sameOrderedValues(
      value.processingConsents.map((item) => item.consentType).sort(),
      [...G5D4_PROCESSING_CONSENTS].sort()
    ),
    ["processingConsents"],
    "exact two processing consents required"
  );
  addExactArrayIssue(
    context,
    sameOrderedValues([...value.writerIntentKinds].sort(), [...G5D4_WRITER_INTENT_KINDS].sort()),
    ["writerIntentKinds"],
    "exact five writer-intent kinds required"
  );
});

export const g5d4BControlContractSchema = z
  .object({
    observedRows: z.literal(16),
    tables: z.array(g5d4TableCountSchema).length(18),
    processingConsents: z.array(processingConsentSchema).length(2),
    writerIntentKinds: z.array(z.enum(G5D4_WRITER_INTENT_KINDS)).length(5),
    provider: z.object({ present: z.literal(true), count: z.literal(1) }).strict(),
    storage: z.object({ required: z.literal(4), present: z.literal(4) }).strict(),
    auth: z.object({ present: z.literal(true) }).strict(),
    deletionRequestCount: z.literal(0)
  })
  .strict()
  .superRefine((value, context) => {
    addExactArrayIssue(
      context,
      JSON.stringify(value.tables) === JSON.stringify(G5D4_B_CONTROL_TABLE_CONTRACT),
      ["tables"],
      "B exact 18-table control contract mismatch"
    );
    addExactArrayIssue(
      context,
      sameOrderedValues(
        value.processingConsents.map((item) => item.consentType).sort(),
        [...G5D4_PROCESSING_CONSENTS].sort()
      ),
      ["processingConsents"],
      "B exact two processing consents required"
    );
    addExactArrayIssue(
      context,
      sameOrderedValues([...value.writerIntentKinds].sort(), [...G5D4_WRITER_INTENT_KINDS].sort()),
      ["writerIntentKinds"],
      "B exact five writer-intent kinds required"
    );
  });

const rawStorageTargetSchema = z
  .object({
    bucket: z.enum(G5D4_STORAGE_BUCKETS),
    key: z.string().min(1).max(1024)
  })
  .strict();

function exactFourBuckets(value, context, path) {
  addExactArrayIssue(
    context,
    sameOrderedValues(
      value.map((target) => target.bucket).sort(),
      [...G5D4_STORAGE_BUCKETS].sort()
    ),
    path,
    "exact four storage buckets required"
  );
}

const rawStorageTargetsSchema = z
  .array(rawStorageTargetSchema)
  .length(4)
  .superRefine((value, context) => exactFourBuckets(value, context, []));

const aliasSetSchema = z
  .object({
    fixtureA: g5d4AliasSchema,
    fixtureB: g5d4AliasSchema,
    providerResource: g5d4AliasSchema,
    storageTargets: z.array(g5d4AliasSchema).length(4),
    request: g5d4AliasSchema,
    targetSet: g5d4AliasSchema
  })
  .strict();

const stageTargetSchema = z
  .object({
    alias: g5d4AliasSchema,
    digest: digestSchema,
    count: positiveIntSchema
  })
  .strict();

export const g5d4PrivateManifestSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.privateManifest),
    runId: runIdSchema,
    runPurpose: runPurposeSchema,
    confirmationProvenance: confirmationProvenanceSchema,
    collectorProvenance: collectorProvenanceSchema,
    generation: positiveIntSchema,
    previousGenerationDigest: digestSchema.nullable(),
    generationDigest: digestSchema,
    createdAt: instantSchema,
    sealed: z.boolean(),
    manifestSealDigest: digestSchema.nullable(),
    authority: z
      .object({
        environment: z.enum(["canonical_staging", "production"]),
        projectLabel: z.string().min(1).max(80),
        projectRef: z.string().regex(/^[a-z]{20}$/),
        commit: commitSchema
      })
      .strict(),
    rawAuthorities: z
      .object({
        fixtureAUserId: z.string().min(1).max(256),
        fixtureBUserId: z.string().min(1).max(256),
        fixtureAProviderResourceId: z.string().min(1).max(256),
        fixtureBProviderResourceId: z.string().min(1).max(256),
        fixtureAStorageTargets: rawStorageTargetsSchema,
        fixtureBStorageTargets: rawStorageTargetsSchema,
        deletionRequestId: z.string().min(1).max(256),
        deletionRequestRef: z.string().min(1).max(256)
      })
      .strict(),
    aliases: aliasSetSchema,
    stageTargets: z
      .object({
        provider_cleanup: stageTargetSchema,
        storage_cleanup: stageTargetSchema,
        database_cleanup: stageTargetSchema,
        auth_cleanup: stageTargetSchema,
        completion_verification: stageTargetSchema
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    addProvenanceProfileIssue(value, context);
    if (value.generation === 1 && value.previousGenerationDigest !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousGenerationDigest"],
        message: "first manifest generation cannot have a predecessor"
      });
    }
    if (value.generation > 1 && value.previousGenerationDigest === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousGenerationDigest"],
        message: "append-only manifest generation requires digest chaining"
      });
    }
    if (value.sealed !== (value.manifestSealDigest !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifestSealDigest"],
        message: "manifest seal state mismatch"
      });
    }
  });

const authorizationCoreSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.authorization),
    authorizationId: authorizationIdSchema,
    state: z.enum(["issued", "confirmed", "consumed"]),
    runId: runIdSchema,
    runPurpose: runPurposeSchema,
    confirmationProvenance: confirmationProvenanceSchema,
    collectorProvenance: collectorProvenanceSchema,
    microStep: g5d4OperatorMicroStepSchema,
    fixtureAlias: g5d4AliasSchema,
    targetAlias: g5d4AliasSchema,
    targetDigest: digestSchema,
    targetCount: positiveIntSchema,
    commit: commitSchema,
    projectRef: z.string().regex(/^[a-z]{20}$/),
    collectorDigest: digestSchema,
    issuedAt: instantSchema,
    confirmedAt: nullableInstantSchema,
    consumedAt: nullableInstantSchema,
    previousRecordDigest: digestSchema.nullable(),
    recordDigest: digestSchema,
    integrityMac: digestSchema
  })
  .strict();

export const g5d4AuthorizationSchema = authorizationCoreSchema.superRefine((value, context) => {
  addProvenanceProfileIssue(value, context);
  const validStateShape =
    (value.state === "issued" &&
      value.confirmedAt === null &&
      value.consumedAt === null &&
      value.previousRecordDigest === null) ||
    (value.state === "confirmed" &&
      value.confirmedAt !== null &&
      value.consumedAt === null &&
      value.previousRecordDigest !== null) ||
    (value.state === "consumed" &&
      value.confirmedAt !== null &&
      value.consumedAt !== null &&
      value.previousRecordDigest !== null);

  if (!validStateShape) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["state"],
      message: "authorization state transition shape is invalid"
    });
  }
  if (value.confirmedAt !== null && Date.parse(value.confirmedAt) < Date.parse(value.issuedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmedAt"],
      message: "authorization confirmation precedes issuance"
    });
  }
  if (
    value.consumedAt !== null &&
    value.confirmedAt !== null &&
    Date.parse(value.consumedAt) < Date.parse(value.confirmedAt)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consumedAt"],
      message: "authorization consumption precedes confirmation"
    });
  }
});

const stableRelationSchema = z
  .object({
    kind: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    targetId: z.string().min(1).max(256)
  })
  .strict();

export const g5d4PrivateStableRowSchema = z
  .object({
    id: z.string().min(1).max(256),
    ownerId: z.string().min(1).max(256).nullable(),
    createdAt: instantSchema,
    updatedAt: nullableInstantSchema,
    status: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).nullable(),
    relations: z.array(stableRelationSchema).max(16)
  })
  .strict();

const privateTableSnapshotSchema = z
  .object({
    table: tableNameSchema,
    category: tableCategorySchema,
    rows: z.array(g5d4PrivateStableRowSchema)
  })
  .strict();

const privateConsentSnapshotSchema = z
  .object({
    consentType: z.enum(G5D4_PROCESSING_CONSENTS),
    status: z.literal("active"),
    consentVersion: z.literal("2026-08-22.v1")
  })
  .strict();

const privateWriterIntentSchema = z
  .object({
    kind: z.enum(G5D4_WRITER_INTENT_KINDS),
    status: z.literal("completed")
  })
  .strict();

export const g5d4PrivateDatabaseSnapshotSchema = z
  .object({
    userId: z.string().min(1).max(256),
    tables: z.array(privateTableSnapshotSchema).length(18),
    processingConsents: z.array(privateConsentSnapshotSchema).length(2),
    writerIntents: z.array(privateWriterIntentSchema).length(5),
    request: z
      .object({
        count: z.union([z.literal(0), z.literal(1)]),
        id: z.string().min(1).max(256).nullable(),
        state: z.enum(["absent", "requested", "confirmed"]),
        conflictCount: z.literal(0),
        durableTargetState: z.enum(["absent", "sealed"]),
        providerTargetCount: z.union([z.literal(0), z.literal(1)]),
        storageTargetCount: z.union([z.literal(0), z.literal(4)])
      })
      .strict()
  })
  .strict();

export const g5d4PrivateProviderSnapshotSchema = z
  .object({
    resourceId: z.string().min(1).max(256),
    present: z.boolean(),
    state: z.enum(["ready", "unavailable", "deleted"]),
    createdAt: instantSchema,
    updatedAt: nullableInstantSchema,
    deletionRelevantStatus: z.enum(["eligible", "blocked", "absent"]),
    telemetry: z
      .object({
        requestId: z.string().max(256).nullable(),
        rateLimitRemaining: nonNegativeIntSchema.nullable(),
        readAt: instantSchema
      })
      .strict()
  })
  .strict();

export const g5d4PrivateStorageListItemSchema = z
  .object({
    bucket: z.enum(G5D4_STORAGE_BUCKETS),
    key: z.string().min(1).max(1024)
  })
  .strict();

export const g5d4PrivateStorageInfoSchema = z
  .object({
    bucket: z.enum(G5D4_STORAGE_BUCKETS),
    key: z.string().min(1).max(1024),
    present: z.boolean(),
    size: nonNegativeIntSchema,
    contentType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
    version: z.string().min(1).max(256),
    stableMetadata: z
      .object({
        createdAt: instantSchema,
        updatedAt: nullableInstantSchema,
        etag: z.string().min(1).max(256)
      })
      .strict(),
    transport: z
      .object({
        signedUrl: z.string().nullable(),
        headers: z.record(z.string()),
        readAt: instantSchema
      })
      .strict()
  })
  .strict();

export const g5d4PrivateAuthSnapshotSchema = z
  .object({
    present: z.boolean(),
    userId: z.string().min(1).max(256),
    identityBinding: z.string().min(1).max(256),
    contact: z.string().min(1).max(320),
    provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    confirmedAt: nullableInstantSchema,
    deletionStatus: z.enum(["eligible", "blocked", "absent"]),
    transport: z
      .object({
        requestId: z.string().max(256).nullable(),
        readAt: instantSchema
      })
      .strict()
  })
  .strict();

export const g5d4EnvironmentInspectionSchema = z
  .object({
    environment: z.enum(["canonical_staging", "production", "other"]),
    projectLabel: z.string().min(1).max(80),
    projectRef: z.string().regex(/^[a-z]{20}$/),
    productionGuard: z.boolean(),
    destructiveGuard: z.boolean()
  })
  .strict();

export const g5d4MigrationInspectionSchema = z
  .object({
    applied: z.array(z.string().regex(/^\d{4}$/)),
    pending: z.array(z.string().regex(/^\d{4}$/))
  })
  .strict();

export const g5d4GitInspectionSchema = z
  .object({
    commit: commitSchema,
    branch: z.string().min(1).max(256),
    trackedClean: z.boolean()
  })
  .strict();

const safeDarSchema = z
  .object({ deleted: nonNegativeIntSchema, anonymized: nonNegativeIntSchema, retained: nonNegativeIntSchema })
  .strict();

export const G5D4_EVIDENCE_SAFE_ENUMS = Object.freeze({
  evidenceStatus: ["pass", "stop"],
  presence: ["present", "absent"],
  requestState: ["requested", "confirmed"],
  targetState: ["absent", "sealed"],
  guardTransition: ["parent_off_child_on_parent_off", "not_started"],
  operatorStatus: ["succeeded", "already_satisfied", "retryable", "manual_required", "blocked", "failed"],
  childExitSemantic: ["exit_0_valid", "exit_2_valid_progress", "spawn_failed", "output_rejected", "not_spawned"]
});

const safeFixtureASchema = z
  .object({
    fixtureAlias: g5d4AliasSchema,
    observedRows: z.union([z.literal(17), z.literal(22)]),
    prospectiveObservedRows: z.literal(22),
    dar: safeDarSchema,
    processingConsentCount: z.literal(2),
    writerIntentCount: z.literal(5),
    providerCount: z.literal(1),
    storageCount: z.literal(4),
    authPresence: z.literal("present"),
    requestState: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.requestState),
    conflictCount: z.literal(0),
    durableTargetCount: z.union([z.literal(0), z.literal(5)]),
    durableTargetState: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.targetState),
    nextMicroStep: g5d4MicroStepSchema
  })
  .strict();

const safeFixtureBSchema = z
  .object({
    fixtureAlias: g5d4AliasSchema,
    observedRows: z.literal(16),
    processingConsentCount: z.literal(2),
    providerCount: z.literal(1),
    storageCount: z.literal(4),
    authPresence: z.literal("present"),
    deletionRequestCount: z.literal(0),
    fingerprint: digestSchema
  })
  .strict();

export const g5d4CollectorSafeDtoSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.collectorSafe),
    runId: runIdSchema,
    runPurpose: runPurposeSchema,
    confirmationProvenance: confirmationProvenanceSchema,
    collectorProvenance: collectorProvenanceSchema,
    phase: z.enum(["prep_stop", "sealed"]),
    commit: commitSchema,
    projectRef: z.string().regex(/^[a-z]{20}$/),
    collectedAt: instantSchema,
    collectorDigest: digestSchema,
    evidenceStatus: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.evidenceStatus),
    fixtureA: safeFixtureASchema,
    fixtureB: safeFixtureBSchema,
    target: stageTargetSchema
  })
  .strict()
  .superRefine(addProvenanceProfileIssue);

export const g5d4ProofBindingSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.proofBinding),
    authorizationDigest: digestSchema,
    collectorDigest: digestSchema,
    manifestSealDigest: digestSchema,
    bFingerprint: digestSchema,
    runId: runIdSchema,
    runPurpose: runPurposeSchema,
    confirmationProvenance: confirmationProvenanceSchema,
    collectorProvenance: collectorProvenanceSchema,
    microStep: g5d4OperatorMicroStepSchema,
    commit: commitSchema,
    projectRef: z.string().regex(/^[a-z]{20}$/),
    fixtureAlias: g5d4AliasSchema,
    targetAlias: g5d4AliasSchema,
    targetDigest: digestSchema,
    targetCount: positiveIntSchema,
    artifactDigest: digestSchema
  })
  .strict()
  .superRefine(addProvenanceProfileIssue);

export const g5d4WrapperSafeResultSchema = z
  .object({
    schemaVersion: z.literal(G5D4_SCHEMA_VERSIONS.wrapperSafe),
    status: z.enum(["stop", "not_started"]),
    authorizationId: authorizationIdSchema.nullable(),
    microStep: g5d4OperatorMicroStepSchema.nullable(),
    commit: commitSchema.nullable(),
    projectRef: z.string().regex(/^[a-z]{20}$/).nullable(),
    guardTransition: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.guardTransition),
    operatorStatus: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.operatorStatus).nullable(),
    childExitSemantic: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.childExitSemantic),
    childSpawnCount: z.union([z.literal(0), z.literal(1)]),
    retryCount: z.literal(0),
    chainingCount: z.literal(0),
    targetCount: nonNegativeIntSchema,
    bFingerprintEqual: z.boolean().nullable(),
    mandatoryStop: z.literal(true),
    collectorDigestAfter: digestSchema.nullable(),
    safeReasonCode: z
      .enum([
        "prerequisite_rejected",
        "authorization_rejected",
        "authorization_consumed",
        "spawn_failed",
        "child_output_rejected",
        "operator_progress_recorded",
        "b_fingerprint_changed",
        "post_collector_rejected"
      ])
      .nullable()
  })
  .strict();

export const G5D4_PROHIBITED_OUTPUT_KEYS = Object.freeze([
  "apiKey",
  "jwt",
  "cookie",
  "dbPassword",
  "magicLinkToken",
  "credential",
  "providerId",
  "providerVoiceId",
  "storagePath",
  "objectKey",
  "signedUrl",
  "scriptBody",
  "transcript",
  "audioBody",
  "metadata",
  "payload",
  "error",
  "stack",
  "cause",
  "raw"
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256Hex(key, domain, value) {
  return createHmac("sha256", key)
    .update(`native-minute:g5d4:${domain}\0`, "utf8")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value))
    .digest("hex");
}

export function safeDigestEqual(left, right) {
  if (!digestSchema.safeParse(left).success || !digestSchema.safeParse(right).success) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function assertNoProhibitedKeys(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProhibitedKeys(item, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    const prohibited = G5D4_PROHIBITED_OUTPUT_KEYS.some((item) => {
      const needle = item.toLowerCase();
      return (
        normalized === needle ||
        normalized.endsWith(needle) ||
        normalized.startsWith(`raw${needle}`) ||
        (needle === "raw" && normalized.startsWith("raw"))
      );
    });
    if (prohibited) throw new Error("reviewer DTO prohibited key");
    assertNoProhibitedKeys(child, [...path, key]);
  }
}

function assertNoProhibitedShapes(value) {
  const strings = [];
  const visit = (current) => {
    if (typeof current === "string") strings.push(current);
    else if (Array.isArray(current)) current.forEach(visit);
    else if (current && typeof current === "object") Object.values(current).forEach(visit);
  };
  visit(value);

  const prohibitedShapes = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    /(?:api[_-]?key|access[_-]?token|service[_-]?role|password|secret)=/i,
    /https?:\/\/[^\s/@]+:[^\s/@]+@/i,
    /https?:\/\/[^\s]+[?&](?:token|key|signature|apikey)=/i,
    /\b(?:voice_[A-Za-z0-9-]{8,}|elevenlabs_[A-Za-z0-9_-]{8,})\b/,
    /storage:\/\//i,
    /(?:recordings|script-audios|voice-samples|voice-consents)\/[A-Za-z0-9_.\/-]+/
  ];

  if (strings.some((item) => prohibitedShapes.some((pattern) => pattern.test(item)))) {
    throw new Error("reviewer DTO prohibited value shape");
  }
}

export function buildReviewerSafeDto(schema, candidate, privateRawSentinels = []) {
  const dto = schema.parse(candidate);
  const serialized = canonicalJson(dto);

  for (const sentinel of privateRawSentinels) {
    if (typeof sentinel === "string" && sentinel.length >= 4 && serialized.includes(sentinel)) {
      throw new Error("reviewer DTO contains a private raw-value sentinel");
    }
  }

  assertNoProhibitedKeys(dto);
  assertNoProhibitedShapes(dto);
  return dto;
}

export function validateExactTableContract(tables, expected) {
  const parsed = z.array(g5d4TableCountSchema).length(18).parse(tables);
  if (canonicalJson(parsed) !== canonicalJson(expected)) {
    throw new Error("exact 18-table contract mismatch");
  }
  return parsed;
}

export function validateCorrectedDar(value) {
  const parsed = fixtureDarSchema.parse(value);
  if (22 !== parsed.deleted + parsed.anonymized + parsed.retained) {
    throw new Error("corrected D/A/R equation mismatch");
  }
  return parsed;
}
