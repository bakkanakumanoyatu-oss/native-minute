import {
  G5D4_A_PREP_TABLE_CONTRACT,
  G5D4_A_SEALED_TABLE_CONTRACT,
  G5D4_B_CONTROL_TABLE_CONTRACT,
  G5D4_PROCESSING_CONSENTS,
  G5D4_PROVENANCE,
  G5D4_REQUIRED_MIGRATIONS,
  G5D4_SCHEMA_VERSIONS,
  G5D4_STORAGE_BUCKETS,
  G5D4_WRITER_INTENT_KINDS,
  buildReviewerSafeDto,
  canonicalJson,
  g5d4AFixtureContractSchema,
  g5d4BControlContractSchema,
  g5d4CollectorSafeDtoSchema,
  g5d4EnvironmentInspectionSchema,
  g5d4GitInspectionSchema,
  g5d4MigrationInspectionSchema,
  g5d4PrivateAuthSnapshotSchema,
  g5d4PrivateDatabaseSnapshotSchema,
  g5d4PrivateProviderSnapshotSchema,
  g5d4PrivateStorageInfoSchema,
  g5d4PrivateStorageListItemSchema,
  hmacSha256Hex,
  validateExactTableContract
} from "./g5d4-proof-contract.mjs";
import {
  assertCanonicalManifestAuthority,
  getPrivateRawSentinels,
  loadLatestPrivateManifest,
  readAliasKey
} from "./g5d4-proof-private-state.mjs";

const ADAPTER_SHAPES = Object.freeze({
  db: ["select"],
  storage: ["download", "info", "list", "read"],
  auth: ["get"],
  provider: ["get"],
  environment: ["inspectMigrations", "inspectProject"],
  git: ["inspect"]
});

function assertExactObjectFunctions(value, expected, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} read-only adapter missing`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} adapter exposes a non-read-only or unknown capability`);
  }
  for (const method of wanted) {
    if (typeof value[method] !== "function") throw new Error(`${label}.${method} must be callable`);
  }
}

export function assertReadOnlyCollectorAdapters(adapters) {
  if (!adapters || typeof adapters !== "object") throw new Error("collector adapters missing");
  const actualGroups = Object.keys(adapters).sort();
  const expectedGroups = Object.keys(ADAPTER_SHAPES).sort();
  if (canonicalJson(actualGroups) !== canonicalJson(expectedGroups)) {
    throw new Error("collector adapter group mismatch");
  }
  for (const [group, methods] of Object.entries(ADAPTER_SHAPES)) {
    assertExactObjectFunctions(adapters[group], methods, group);
  }
  return adapters;
}

function tableCounts(snapshot) {
  return snapshot.tables.map((item) => ({
    table: item.table,
    category: item.category,
    count: item.rows.length
  }));
}

function sumCounts(tables) {
  return tables.reduce((total, item) => total + item.count, 0);
}

function assertExactSets(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`${label} mismatch`);
}

function validateDatabaseOwnership(snapshot, rawUserId) {
  if (snapshot.userId !== rawUserId) throw new Error("database fixture authority mismatch");
  for (const table of snapshot.tables) {
    for (const row of table.rows) {
      if (row.ownerId !== rawUserId) throw new Error("database stable row ownership mismatch");
    }
  }
}

function validateStorageUniverse(list, expected) {
  const parsed = list.map((item) => g5d4PrivateStorageListItemSchema.parse(item));
  const actualProjection = parsed.map(({ bucket, key }) => `${bucket}\0${key}`).sort();
  const expectedProjection = expected.map(({ bucket, key }) => `${bucket}\0${key}`).sort();
  if (canonicalJson(actualProjection) !== canonicalJson(expectedProjection)) {
    throw new Error("storage exact owned universe mismatch");
  }
  assertExactSets(
    parsed.map((item) => item.bucket),
    G5D4_STORAGE_BUCKETS,
    "storage four-bucket contract"
  );
  return parsed;
}

function normalizeDownloadedBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && Buffer.isBuffer(value.bytes)) return value.bytes;
  if (value?.bytes instanceof Uint8Array) return Buffer.from(value.bytes);
  throw new Error("storage download did not return bytes");
}

async function collectStorage(adapters, rawUserId, expected) {
  const listed = validateStorageUniverse(
    await adapters.storage.list({ operation: "list", rawUserId }),
    expected
  );
  const objects = [];
  for (const target of listed) {
    const info = g5d4PrivateStorageInfoSchema.parse(
      await adapters.storage.info({ operation: "info", bucket: target.bucket, key: target.key })
    );
    if (!info.present || info.bucket !== target.bucket || info.key !== target.key) {
      throw new Error("storage presence or identity mismatch");
    }
    const bytes = normalizeDownloadedBytes(
      await adapters.storage.download({ operation: "download", bucket: target.bucket, key: target.key })
    );
    if (bytes.length !== info.size) throw new Error("storage size/content mismatch");
    objects.push({ info, bytes });
  }
  return objects;
}

function stableDatabaseProjection(snapshot, key) {
  return snapshot.tables.map((table) => ({
    table: table.table,
    category: table.category,
    rows: table.rows
      .map((row) => ({
        identity: hmacSha256Hex(key, `b-db-row:${table.table}`, row.id),
        owner: row.ownerId === null ? null : hmacSha256Hex(key, "b-db-owner", row.ownerId),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status,
        relations: row.relations
          .map((relation) => ({
            kind: relation.kind,
            target: hmacSha256Hex(key, `b-db-relation:${relation.kind}`, relation.targetId)
          }))
          .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
      }))
      .sort((left, right) => left.identity.localeCompare(right.identity))
  }));
}

function stableProviderProjection(snapshot, key) {
  return {
    identity: hmacSha256Hex(key, "b-provider-identity", snapshot.resourceId),
    present: snapshot.present,
    state: snapshot.state,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletionRelevantStatus: snapshot.deletionRelevantStatus
  };
}

function stableStorageProjection(objects, key) {
  return objects
    .map(({ info, bytes }) => ({
      bucketKind: info.bucket,
      key: hmacSha256Hex(key, `b-storage-key:${info.bucket}`, info.key),
      present: info.present,
      size: info.size,
      content: hmacSha256Hex(key, `b-storage-content:${info.bucket}`, bytes),
      contentType: info.contentType,
      version: info.version,
      stableMetadata: info.stableMetadata
    }))
    .sort((left, right) => `${left.bucketKind}:${left.key}`.localeCompare(`${right.bucketKind}:${right.key}`));
}

function stableAuthProjection(snapshot, key) {
  return {
    present: snapshot.present,
    identity: hmacSha256Hex(key, "b-auth-identity", snapshot.userId),
    identityBinding: hmacSha256Hex(key, "b-auth-binding", snapshot.identityBinding),
    contact: hmacSha256Hex(key, "b-auth-contact", snapshot.contact.trim().toLowerCase()),
    provider: snapshot.provider,
    confirmedAt: snapshot.confirmedAt,
    deletionStatus: snapshot.deletionStatus
  };
}

export function buildBStableFingerprint(input, key) {
  const database = g5d4PrivateDatabaseSnapshotSchema.parse(input.database);
  const provider = g5d4PrivateProviderSnapshotSchema.parse(input.provider);
  const auth = g5d4PrivateAuthSnapshotSchema.parse(input.auth);
  const storage = zStorageFingerprintInput(input.storage);
  const components = {
    database: hmacSha256Hex(key, "b-fingerprint:database", stableDatabaseProjection(database, key)),
    provider: hmacSha256Hex(key, "b-fingerprint:provider", stableProviderProjection(provider, key)),
    storage: hmacSha256Hex(key, "b-fingerprint:storage", stableStorageProjection(storage, key)),
    auth: hmacSha256Hex(key, "b-fingerprint:auth", stableAuthProjection(auth, key))
  };
  return {
    components,
    root: hmacSha256Hex(
      key,
      "b-fingerprint:root",
      [components.database, components.provider, components.storage, components.auth]
    )
  };
}

function zStorageFingerprintInput(value) {
  if (!Array.isArray(value) || value.length !== 4) throw new Error("B storage fingerprint requires 4 objects");
  return value.map((item) => {
    if (!item || typeof item !== "object" || canonicalJson(Object.keys(item).sort()) !== canonicalJson(["bytes", "info"])) {
      throw new Error("B storage fingerprint input shape mismatch");
    }
    return {
      info: g5d4PrivateStorageInfoSchema.parse(item.info),
      bytes: normalizeDownloadedBytes(item.bytes)
    };
  });
}

function fixtureContractFromPrivate(snapshot, external, phase) {
  const tables = tableCounts(snapshot);
  const processingConsents = snapshot.processingConsents.map(({ consentType, status }) => ({
    consentType,
    status
  }));
  const writerIntentKinds = snapshot.writerIntents.map(({ kind }) => kind);
  const observedRows = sumCounts(tables);

  if (external.role === "fixture_a") {
    return g5d4AFixtureContractSchema.parse({
      phase,
      observedRows,
      prospectiveObservedRows: 22,
      dar: { deleted: 15, anonymized: 1, retained: 6 },
      tables,
      processingConsents,
      writerIntentKinds,
      provider: { present: external.provider.present, count: external.provider.present ? 1 : 0 },
      storage: { required: 4, present: external.storage.length },
      auth: { present: external.auth.present },
      request: {
        count: snapshot.request.count,
        state: snapshot.request.state,
        conflictCount: snapshot.request.conflictCount
      },
      durableTargets: {
        provider: snapshot.request.providerTargetCount,
        storage: snapshot.request.storageTargetCount,
        total: snapshot.request.providerTargetCount + snapshot.request.storageTargetCount,
        state: snapshot.request.durableTargetState
      },
      nextMicroStep: phase === "prep_stop" ? "seal_targets" : "provider_cleanup"
    });
  }

  return g5d4BControlContractSchema.parse({
    observedRows,
    tables,
    processingConsents,
    writerIntentKinds,
    provider: { present: external.provider.present, count: external.provider.present ? 1 : 0 },
    storage: { required: 4, present: external.storage.length },
    auth: { present: external.auth.present },
    deletionRequestCount: snapshot.request.count
  });
}

function assertCollectorAuthority(environment, migrations, git, manifest) {
  if (
    environment.environment !== "canonical_staging" ||
    environment.projectLabel !== manifest.authority.projectLabel ||
    environment.projectRef !== manifest.authority.projectRef ||
    environment.productionGuard ||
    environment.destructiveGuard
  ) {
    throw new Error("collector environment authority mismatch");
  }
  if (
    canonicalJson(migrations.applied) !== canonicalJson(G5D4_REQUIRED_MIGRATIONS) ||
    migrations.pending.length !== 0
  ) {
    throw new Error("collector migration authority mismatch");
  }
  if (git.commit !== manifest.authority.commit || !git.trackedClean) {
    throw new Error("collector git authority mismatch");
  }
}

function assertSelfTestCollectorManifest(manifest) {
  if (
    manifest.runPurpose !== G5D4_PROVENANCE.selfTest.runPurpose ||
    manifest.confirmationProvenance !== G5D4_PROVENANCE.selfTest.confirmation ||
    manifest.collectorProvenance !== G5D4_PROVENANCE.selfTest.collector
  ) {
    throw new Error("injected collector adapters are restricted to self-test provenance");
  }
  return manifest;
}

export async function collectG5d4SelfTestReadOnlyEvidence(input) {
  const adapters = assertReadOnlyCollectorAdapters(input.adapters);
  const manifest = assertSelfTestCollectorManifest(
    assertCanonicalManifestAuthority(
      loadLatestPrivateManifest(input.runDirectory, { requireSealed: input.phase === "sealed" })
    )
  );
  const key = readAliasKey(input.runDirectory);
  const phase = input.phase;
  if (phase !== "prep_stop" && phase !== "sealed") throw new Error("collector phase mismatch");

  const [environmentRaw, migrationsRaw, gitRaw, databaseARaw, databaseBRaw] = await Promise.all([
    adapters.environment.inspectProject({ operation: "inspect_project" }),
    adapters.environment.inspectMigrations({ operation: "inspect_migrations" }),
    adapters.git.inspect({ operation: "inspect_local_git" }),
    adapters.db.select({
      operation: "select",
      fixtureRole: "fixture_a",
      rawUserId: manifest.rawAuthorities.fixtureAUserId,
      rawRequestId: manifest.rawAuthorities.deletionRequestId
    }),
    adapters.db.select({
      operation: "select",
      fixtureRole: "fixture_b",
      rawUserId: manifest.rawAuthorities.fixtureBUserId
    })
  ]);

  const environment = g5d4EnvironmentInspectionSchema.parse(environmentRaw);
  const migrations = g5d4MigrationInspectionSchema.parse(migrationsRaw);
  const git = g5d4GitInspectionSchema.parse(gitRaw);
  const databaseA = g5d4PrivateDatabaseSnapshotSchema.parse(databaseARaw);
  const databaseB = g5d4PrivateDatabaseSnapshotSchema.parse(databaseBRaw);
  assertCollectorAuthority(environment, migrations, git, manifest);
  validateDatabaseOwnership(databaseA, manifest.rawAuthorities.fixtureAUserId);
  validateDatabaseOwnership(databaseB, manifest.rawAuthorities.fixtureBUserId);

  const [providerARaw, providerBRaw, authARaw, authBRaw, storageA, storageB] = await Promise.all([
    adapters.provider.get({
      operation: "get",
      resourceId: manifest.rawAuthorities.fixtureAProviderResourceId
    }),
    adapters.provider.get({
      operation: "get",
      resourceId: manifest.rawAuthorities.fixtureBProviderResourceId
    }),
    adapters.auth.get({ operation: "get", userId: manifest.rawAuthorities.fixtureAUserId }),
    adapters.auth.get({ operation: "get", userId: manifest.rawAuthorities.fixtureBUserId }),
    collectStorage(
      adapters,
      manifest.rawAuthorities.fixtureAUserId,
      manifest.rawAuthorities.fixtureAStorageTargets
    ),
    collectStorage(
      adapters,
      manifest.rawAuthorities.fixtureBUserId,
      manifest.rawAuthorities.fixtureBStorageTargets
    )
  ]);
  const providerA = g5d4PrivateProviderSnapshotSchema.parse(providerARaw);
  const providerB = g5d4PrivateProviderSnapshotSchema.parse(providerBRaw);
  const authA = g5d4PrivateAuthSnapshotSchema.parse(authARaw);
  const authB = g5d4PrivateAuthSnapshotSchema.parse(authBRaw);
  if (
    providerA.resourceId !== manifest.rawAuthorities.fixtureAProviderResourceId ||
    providerB.resourceId !== manifest.rawAuthorities.fixtureBProviderResourceId ||
    authA.userId !== manifest.rawAuthorities.fixtureAUserId ||
    authB.userId !== manifest.rawAuthorities.fixtureBUserId
  ) {
    throw new Error("external identity binding mismatch");
  }

  const contractA = fixtureContractFromPrivate(
    databaseA,
    { role: "fixture_a", provider: providerA, storage: storageA, auth: authA },
    phase
  );
  const contractB = fixtureContractFromPrivate(
    databaseB,
    { role: "fixture_b", provider: providerB, storage: storageB, auth: authB },
    phase
  );
  validateExactTableContract(
    contractA.tables,
    phase === "prep_stop" ? G5D4_A_PREP_TABLE_CONTRACT : G5D4_A_SEALED_TABLE_CONTRACT
  );
  validateExactTableContract(contractB.tables, G5D4_B_CONTROL_TABLE_CONTRACT);
  assertExactSets(
    databaseA.processingConsents.map((item) => item.consentType),
    G5D4_PROCESSING_CONSENTS,
    "A processing consent"
  );
  assertExactSets(
    databaseA.writerIntents.map((item) => item.kind),
    G5D4_WRITER_INTENT_KINDS,
    "A writer intent"
  );

  const bFingerprint = buildBStableFingerprint(
    { database: databaseB, provider: providerB, storage: storageB, auth: authB },
    key
  );
  const target =
    phase === "sealed"
      ? manifest.stageTargets.provider_cleanup
      : {
          alias: manifest.aliases.targetSet,
          digest: hmacSha256Hex(key, "prospective-target-set", manifest.stageTargets.storage_cleanup.digest),
          count: 5
        };
  const collectedAt = input.collectedAt ?? new Date().toISOString();
  const collectorDigest = hmacSha256Hex(key, "collector-snapshot", {
    runPurpose: manifest.runPurpose,
    confirmationProvenance: manifest.confirmationProvenance,
    collectorProvenance: manifest.collectorProvenance,
    phase,
    environment,
    migrations,
    git,
    aDatabase: stableDatabaseProjection(databaseA, key),
    aProvider: stableProviderProjection(providerA, key),
    aStorage: stableStorageProjection(storageA, key),
    aAuth: stableAuthProjection(authA, key),
    bFingerprint: bFingerprint.root,
    target,
    collectedAt
  });

  const safeCandidate = {
    schemaVersion: G5D4_SCHEMA_VERSIONS.collectorSafe,
    runId: manifest.runId,
    runPurpose: manifest.runPurpose,
    confirmationProvenance: manifest.confirmationProvenance,
    collectorProvenance: manifest.collectorProvenance,
    phase,
    commit: git.commit,
    projectRef: environment.projectRef,
    collectedAt,
    collectorDigest,
    evidenceStatus: "pass",
    fixtureA: {
      fixtureAlias: manifest.aliases.fixtureA,
      observedRows: contractA.observedRows,
      prospectiveObservedRows: 22,
      dar: contractA.dar,
      processingConsentCount: contractA.processingConsents.length,
      writerIntentCount: contractA.writerIntentKinds.length,
      providerCount: contractA.provider.count,
      storageCount: contractA.storage.present,
      authPresence: "present",
      requestState: contractA.request.state,
      conflictCount: contractA.request.conflictCount,
      durableTargetCount: contractA.durableTargets.total,
      durableTargetState: contractA.durableTargets.state,
      nextMicroStep: contractA.nextMicroStep
    },
    fixtureB: {
      fixtureAlias: manifest.aliases.fixtureB,
      observedRows: contractB.observedRows,
      processingConsentCount: contractB.processingConsents.length,
      providerCount: contractB.provider.count,
      storageCount: contractB.storage.present,
      authPresence: "present",
      deletionRequestCount: contractB.deletionRequestCount,
      fingerprint: bFingerprint.root
    },
    target
  };
  const safe = buildReviewerSafeDto(
    g5d4CollectorSafeDtoSchema,
    safeCandidate,
    getPrivateRawSentinels(manifest)
  );
  return {
    safe,
    private: {
      bFingerprint,
      environment,
      migrations,
      git
    }
  };
}

export async function collectSelfTestBControlFingerprint(input) {
  const adapters = assertReadOnlyCollectorAdapters(input.adapters);
  const manifest = assertSelfTestCollectorManifest(
    assertCanonicalManifestAuthority(
      loadLatestPrivateManifest(input.runDirectory, { requireSealed: true })
    )
  );
  const key = readAliasKey(input.runDirectory);
  const [databaseRaw, providerRaw, authRaw, storage, environmentRaw, migrationsRaw, gitRaw] =
    await Promise.all([
      adapters.db.select({
        operation: "select",
        fixtureRole: "fixture_b",
        rawUserId: manifest.rawAuthorities.fixtureBUserId
      }),
      adapters.provider.get({
        operation: "get",
        resourceId: manifest.rawAuthorities.fixtureBProviderResourceId
      }),
      adapters.auth.get({ operation: "get", userId: manifest.rawAuthorities.fixtureBUserId }),
      collectStorage(
        adapters,
        manifest.rawAuthorities.fixtureBUserId,
        manifest.rawAuthorities.fixtureBStorageTargets
      ),
      adapters.environment.inspectProject({ operation: "inspect_project" }),
      adapters.environment.inspectMigrations({ operation: "inspect_migrations" }),
      adapters.git.inspect({ operation: "inspect_local_git" })
    ]);
  const database = g5d4PrivateDatabaseSnapshotSchema.parse(databaseRaw);
  const provider = g5d4PrivateProviderSnapshotSchema.parse(providerRaw);
  const auth = g5d4PrivateAuthSnapshotSchema.parse(authRaw);
  const environment = g5d4EnvironmentInspectionSchema.parse(environmentRaw);
  const migrations = g5d4MigrationInspectionSchema.parse(migrationsRaw);
  const git = g5d4GitInspectionSchema.parse(gitRaw);
  assertCollectorAuthority(environment, migrations, git, manifest);
  validateDatabaseOwnership(database, manifest.rawAuthorities.fixtureBUserId);
  if (
    provider.resourceId !== manifest.rawAuthorities.fixtureBProviderResourceId ||
    auth.userId !== manifest.rawAuthorities.fixtureBUserId
  ) {
    throw new Error("B external identity binding mismatch");
  }
  fixtureContractFromPrivate(
    database,
    { role: "fixture_b", provider, storage, auth },
    "sealed"
  );
  const fingerprint = buildBStableFingerprint({ database, provider, storage, auth }, key);
  return {
    runPurpose: manifest.runPurpose,
    confirmationProvenance: manifest.confirmationProvenance,
    collectorProvenance: manifest.collectorProvenance,
    fingerprint: fingerprint.root,
    components: fingerprint.components,
    collectorDigest: hmacSha256Hex(key, "b-control-refresh", {
      runPurpose: manifest.runPurpose,
      confirmationProvenance: manifest.confirmationProvenance,
      collectorProvenance: manifest.collectorProvenance,
      fingerprint: fingerprint.root,
      environment,
      migrations,
      git,
      collectedAt: input.collectedAt ?? new Date().toISOString()
    })
  };
}

export function compareBStableFingerprints(before, after) {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new Error("B fingerprint comparison requires digests");
  }
  if (before !== after) throw new Error("protected B state changed");
  return true;
}

export function createSelfTestReadOnlyCollector(runDirectory, adapters) {
  assertReadOnlyCollectorAdapters(adapters);
  return Object.freeze({
    collectReadiness: (options = {}) =>
      collectG5d4SelfTestReadOnlyEvidence({ runDirectory, adapters, ...options }),
    collectBControl: (options = {}) =>
      collectSelfTestBControlFingerprint({ runDirectory, adapters, ...options })
  });
}

export function createLiveReadOnlyCollector(runDirectory) {
  const manifest = assertCanonicalManifestAuthority(
    loadLatestPrivateManifest(runDirectory, { requireSealed: true })
  );
  if (
    manifest.runPurpose !== G5D4_PROVENANCE.live.runPurpose ||
    manifest.confirmationProvenance !== G5D4_PROVENANCE.live.confirmation ||
    manifest.collectorProvenance !== G5D4_PROVENANCE.live.collector
  ) {
    throw new Error("exact live collector provenance required");
  }
  throw new Error("live read-only collector factory is not armed");
}
