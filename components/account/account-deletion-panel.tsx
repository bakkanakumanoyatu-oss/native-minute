"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  AccountDeletionInventorySummary,
  AccountDeletionJobDryRun,
  AccountDeletionRequestResult,
  AccountDeletionRequestView,
  DatabaseCleanupDryRun,
  ElevenLabsProviderCleanupDryRun,
  SupabaseAuthDeletionDryRun,
  StorageCleanupDryRun
} from "@/services/account-deletion";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; message: string };

const STATUS_COPY: Record<AccountDeletionRequestView["status"], { label: string; summary: string; tone: "steady" | "warn" | "alert" }> = {
  requested: {
    label: "確認待ち",
    summary: "削除リクエストは作成済みです。まだ削除処理は始まっていません。",
    tone: "warn"
  },
  confirmed: {
    label: "確認済み",
    summary: "確認まで完了しました。実削除 job は次フェーズで有効化します。",
    tone: "warn"
  },
  processing: {
    label: "処理中",
    summary: "削除処理中です。完了または失敗状態をこの画面で確認できます。",
    tone: "warn"
  },
  provider_cleanup_failed: {
    label: "provider cleanup failed",
    summary: "ElevenLabs 側の voice cleanup で止まっています。support fallback が必要です。",
    tone: "alert"
  },
  storage_cleanup_failed: {
    label: "storage cleanup failed",
    summary: "保存音声や録音の cleanup で止まっています。support fallback が必要です。",
    tone: "alert"
  },
  db_cleanup_failed: {
    label: "database cleanup failed",
    summary: "app database cleanup で止まっています。support fallback が必要です。",
    tone: "alert"
  },
  auth_cleanup_failed: {
    label: "auth cleanup failed",
    summary: "Supabase Auth account deletion で止まっています。support fallback が必要です。",
    tone: "alert"
  },
  completed: {
    label: "完了",
    summary: "削除処理は完了済みです。",
    tone: "steady"
  },
  cancelled: {
    label: "キャンセル",
    summary: "削除リクエストはキャンセルされています。",
    tone: "steady"
  },
  expired: {
    label: "期限切れ",
    summary: "削除リクエストの確認期限が切れています。必要なら再作成してください。",
    tone: "steady"
  }
};

function getPanelClasses(tone: "steady" | "warn" | "alert") {
  if (tone === "alert") {
    return "border-red-200 bg-red-50 text-red-950";
  }

  if (tone === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  return "border-[var(--line)] bg-ink-50 text-ink-900";
}

function formatDate(value: string | null) {
  if (!value) {
    return "未記録";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return response.json() as Promise<ApiResponse<T>>;
}

export function AccountDeletionPanel({ initialDeletionRequest }: { initialDeletionRequest: AccountDeletionRequestView | null }) {
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequestView | null>(initialDeletionRequest);
  const [inventory, setInventory] = useState<AccountDeletionInventorySummary | null>(null);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [jobDryRun, setJobDryRun] = useState<AccountDeletionJobDryRun | null>(null);
  const [jobDryRunMessage, setJobDryRunMessage] = useState<string | null>(null);
  const [providerDryRun, setProviderDryRun] = useState<ElevenLabsProviderCleanupDryRun | null>(null);
  const [providerDryRunMessage, setProviderDryRunMessage] = useState<string | null>(null);
  const [storageDryRun, setStorageDryRun] = useState<StorageCleanupDryRun | null>(null);
  const [storageDryRunMessage, setStorageDryRunMessage] = useState<string | null>(null);
  const [databaseDryRun, setDatabaseDryRun] = useState<DatabaseCleanupDryRun | null>(null);
  const [databaseDryRunMessage, setDatabaseDryRunMessage] = useState<string | null>(null);
  const [authDryRun, setAuthDryRun] = useState<SupabaseAuthDeletionDryRun | null>(null);
  const [authDryRunMessage, setAuthDryRunMessage] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const statusCopy = deletionRequest ? STATUS_COPY[deletionRequest.status] : null;
  const canConfirm = deletionRequest?.status === "requested" && confirmationText === "DELETE";
  const requestCreated = Boolean(deletionRequest);
  const deletionRequestId = deletionRequest?.id ?? null;
  const deletionRequestStatus = deletionRequest?.status ?? null;
  const statusRows = useMemo(() => {
    if (!deletionRequest) {
      return [];
    }

    return [
      ["request", formatDate(deletionRequest.requestedAt)],
      ["confirmed", formatDate(deletionRequest.confirmedAt)],
      ["provider", deletionRequest.cleanup.provider],
      ["storage", deletionRequest.cleanup.storage],
      ["database", deletionRequest.cleanup.database],
      ["auth", deletionRequest.cleanup.auth]
    ];
  }, [deletionRequest]);
  const inventoryRows = useMemo(() => {
    if (!inventory) {
      return [];
    }

    return [
      ["profile", inventory.database.profiles],
      ["scripts", inventory.database.scripts],
      ["takes", inventory.database.takes],
      ["weak words", inventory.database.weakWords],
      ["coach feedback", inventory.database.coachFeedback],
      ["saved best takes", inventory.database.savedBestTakes],
      ["saved model audios", inventory.database.savedModelAudios],
      ["script audios", inventory.database.scriptAudios],
      ["voice consents", inventory.database.voiceConsents],
      ["voices", inventory.database.voices],
      ["quota events", inventory.database.quotaEvents],
      ["ElevenLabs voice candidates", inventory.provider.elevenLabsVoiceCandidates]
    ];
  }, [inventory]);
  const storageRows = useMemo(() => {
    if (!inventory) {
      return [];
    }

    return [
      ["recordings", inventory.storage.recordings],
      ["script-audios", inventory.storage.scriptAudios],
      ["voice-samples", inventory.storage.voiceSamples],
      ["voice-consents", inventory.storage.voiceConsents]
    ] satisfies Array<[string, { count: number; status: "available" | "unavailable" }]>;
  }, [inventory]);
  const jobStageRows = useMemo(() => jobDryRun?.stages ?? [], [jobDryRun]);
  const providerCandidateRows = useMemo(() => {
    if (!providerDryRun) {
      return [];
    }

    return [
      ["all voices", providerDryRun.candidates.totalVoices],
      ["ElevenLabs voices", providerDryRun.candidates.elevenLabsVoices],
      ["cleanup required", providerDryRun.cleanup.required],
      ["missing provider reference", providerDryRun.candidates.providerReferenceMissing],
      ["invalid provider reference", providerDryRun.candidates.providerReferenceInvalid],
      ["non-ElevenLabs voices", providerDryRun.candidates.nonElevenLabsVoices]
    ];
  }, [providerDryRun]);
  const storageBucketRows = useMemo(() => storageDryRun?.buckets ?? [], [storageDryRun]);
  const databaseTableRows = useMemo(() => databaseDryRun?.tables ?? [], [databaseDryRun]);

  useEffect(() => {
    if (!deletionRequestId) {
      setInventory(null);
      setInventoryMessage(null);
      setJobDryRun(null);
      setJobDryRunMessage(null);
      setProviderDryRun(null);
      setProviderDryRunMessage(null);
      setStorageDryRun(null);
      setStorageDryRunMessage(null);
      setDatabaseDryRun(null);
      setDatabaseDryRunMessage(null);
      setAuthDryRun(null);
      setAuthDryRunMessage(null);
      return;
    }

    let cancelled = false;

    async function loadDryRunState() {
      const [inventoryResponse, jobDryRunResponse, providerDryRunResponse, storageDryRunResponse, databaseDryRunResponse, authDryRunResponse] = await Promise.all([
        fetch("/api/account/deletion-inventory", {
          method: "GET",
          credentials: "same-origin"
        }),
        fetch("/api/account/deletion-job-dry-run", {
          method: "GET",
          credentials: "same-origin"
        }),
        fetch("/api/account/deletion-provider-dry-run", {
          method: "GET",
          credentials: "same-origin"
        }),
        fetch("/api/account/deletion-storage-dry-run", {
          method: "GET",
          credentials: "same-origin"
        }),
        fetch("/api/account/deletion-database-dry-run", {
          method: "GET",
          credentials: "same-origin"
        }),
        fetch("/api/account/deletion-auth-dry-run", {
          method: "GET",
          credentials: "same-origin"
        })
      ]);
      const inventoryResult = await readJson<{ inventory: AccountDeletionInventorySummary }>(inventoryResponse);
      const jobDryRunResult = await readJson<{ dryRun: AccountDeletionJobDryRun }>(jobDryRunResponse);
      const providerDryRunResult = await readJson<{ providerCleanup: ElevenLabsProviderCleanupDryRun }>(providerDryRunResponse);
      const storageDryRunResult = await readJson<{ storageCleanup: StorageCleanupDryRun }>(storageDryRunResponse);
      const databaseDryRunResult = await readJson<{ databaseCleanup: DatabaseCleanupDryRun }>(databaseDryRunResponse);
      const authDryRunResult = await readJson<{ authDeletion: SupabaseAuthDeletionDryRun }>(authDryRunResponse);

      if (cancelled) {
        return;
      }

      if (!inventoryResult.ok) {
        setInventory(null);
        setInventoryMessage(inventoryResult.message);
      } else {
        setInventory(inventoryResult.data.inventory);
        setInventoryMessage(null);
      }

      if (!jobDryRunResult.ok) {
        setJobDryRun(null);
        setJobDryRunMessage(jobDryRunResult.message);
      } else {
        setJobDryRun(jobDryRunResult.data.dryRun);
        setJobDryRunMessage(null);
      }

      if (!providerDryRunResult.ok) {
        setProviderDryRun(null);
        setProviderDryRunMessage(providerDryRunResult.message);
      } else {
        setProviderDryRun(providerDryRunResult.data.providerCleanup);
        setProviderDryRunMessage(null);
      }

      if (!storageDryRunResult.ok) {
        setStorageDryRun(null);
        setStorageDryRunMessage(storageDryRunResult.message);
      } else {
        setStorageDryRun(storageDryRunResult.data.storageCleanup);
        setStorageDryRunMessage(null);
      }

      if (!databaseDryRunResult.ok) {
        setDatabaseDryRun(null);
        setDatabaseDryRunMessage(databaseDryRunResult.message);
      } else {
        setDatabaseDryRun(databaseDryRunResult.data.databaseCleanup);
        setDatabaseDryRunMessage(null);
      }

      if (!authDryRunResult.ok) {
        setAuthDryRun(null);
        setAuthDryRunMessage(authDryRunResult.message);
      } else {
        setAuthDryRun(authDryRunResult.data.authDeletion);
        setAuthDryRunMessage(null);
      }
    }

    loadDryRunState().catch(() => {
      if (!cancelled) {
        setInventory(null);
        setInventoryMessage("削除対象 inventory を取得できませんでした。");
        setJobDryRun(null);
        setJobDryRunMessage("削除 job dry-run を取得できませんでした。");
        setProviderDryRun(null);
        setProviderDryRunMessage("Provider cleanup dry-run を取得できませんでした。");
        setStorageDryRun(null);
        setStorageDryRunMessage("Storage cleanup dry-run を取得できませんでした。");
        setDatabaseDryRun(null);
        setDatabaseDryRunMessage("DB cleanup dry-run を取得できませんでした。");
        setAuthDryRun(null);
        setAuthDryRunMessage("Auth deletion dry-run を取得できませんでした。");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deletionRequestId, deletionRequestStatus]);

  function submitRequest() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin"
      });
      const result = await readJson<AccountDeletionRequestResult>(response);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setDeletionRequest(result.data.deletionRequest);
      setMessage(result.data.created ? "削除リクエストを作成しました。" : "既存の削除リクエストを表示しています。");
    });
  }

  function submitConfirm() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account/deletion-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationText }),
        credentials: "same-origin"
      });
      const result = await readJson<AccountDeletionRequestResult>(response);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setDeletionRequest(result.data.deletionRequest);
      setConfirmationText("");
      setMessage(result.data.confirmed ? "削除リクエストを確認しました。" : "現在の削除リクエスト状態を表示しています。");
    });
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Account deletion</p>
      <h2 className="mt-2 text-xl font-semibold text-ink-900 sm:text-2xl">アカウント削除リクエスト</h2>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        この画面では削除リクエストの作成と確認状態の記録まで行います。実際の削除 job、storage cleanup、ElevenLabs voice cleanup、Supabase Auth deletion はまだ走りません。
      </p>

      <div className="mt-4 rounded-3xl border border-[var(--line)] bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-900">削除対象になる予定のもの</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          scripts、録音、transcript、発音 score、weak words、coach feedback、保存済み audio library、voice sample / consent recording、ElevenLabs の cloned voice などです。
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-500">
          provider raw response、raw audio、script 本文、storage raw path、signed URL、secret、email は deletion request metadata に保存しません。
        </p>
      </div>

      {statusCopy && deletionRequest ? (
        <div className={`mt-4 rounded-3xl border p-4 ${getPanelClasses(statusCopy.tone)}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">状態: {statusCopy.label}</p>
            <p className="text-xs">requested: {formatDate(deletionRequest.requestedAt)}</p>
          </div>
          <p className="mt-2 text-sm leading-6">{statusCopy.summary}</p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {statusRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2">
                <dt className="font-semibold">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">削除対象 inventory を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            dry-run の件数だけを表示します。storage path、provider voice id、email、script 本文、transcript、raw audio、signed URL、secret は返しません。
          </p>
          {inventoryMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{inventoryMessage}</p>
          ) : null}
          {inventory ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Database</p>
                <dl className="mt-2 grid gap-2 text-xs">
                  {inventoryRows.map(([label, count]) => (
                    <div key={label} className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                      <dt className="font-semibold text-ink-700">{label}</dt>
                      <dd className="text-ink-900">{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Storage</p>
                <dl className="mt-2 grid gap-2 text-xs">
                  {storageRows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                      <dt className="font-semibold text-ink-700">{label}</dt>
                      <dd className="text-right text-ink-900">
                        {value.count} <span className="text-ink-500">({value.status})</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">inventory を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">削除処理の準備状況を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            将来の削除 job の順序だけを dry-run で確認します。実行ボタンはまだなく、status 更新や cleanup は行いません。
          </p>
          {jobDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{jobDryRunMessage}</p>
          ) : null}
          {jobDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">{jobDryRun.canRun ? "dry-run 実行対象です" : "まだ dry-run 実行対象ではありません"}</p>
                <p className="mt-1 text-xs leading-5">{jobDryRun.runGuard.reason}</p>
              </div>
              <dl className="grid gap-2 text-xs">
                {jobStageRows.map((stage) => (
                  <div key={stage.name} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">
                        {stage.order}. {stage.name}
                      </dt>
                      <dd className="text-ink-700">
                        {stage.status}
                        {stage.count === null ? "" : ` / count ${stage.count}`}
                      </dd>
                    </div>
                    <p className="mt-1 text-ink-500">{stage.guard}</p>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                storage path、provider voice id、email、script 本文、transcript、raw audio、signed URL、raw provider response は返しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">削除 job dry-run を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">ElevenLabs 側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Provider cleanup の dry-run です。ElevenLabs 側の cloned voice 削除候補を件数だけ確認し、provider voice id は表示しません。
          </p>
          {providerDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{providerDryRunMessage}</p>
          ) : null}
          {providerDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">provider cleanup: {providerDryRun.status}</p>
                <p className="mt-1 text-xs leading-5">
                  dry-run only: ElevenLabs delete は呼びません。missing / invalid reference がある場合は support fallback で確認します。
                </p>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                {providerCandidateRows.map(([label, count]) => (
                  <div key={label} className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                    <dt className="font-semibold text-ink-700">{label}</dt>
                    <dd className="text-ink-900">{count}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                provider voice id、raw provider response、email、storage path、script 本文、transcript、raw audio、secret は返しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Provider cleanup dry-run を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Storage 側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Storage cleanup の dry-run です。bucket ごとの候補件数だけを確認し、object key や signed URL は表示しません。
          </p>
          {storageDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{storageDryRunMessage}</p>
          ) : null}
          {storageDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">storage cleanup: {storageDryRun.status}</p>
                <p className="mt-1 text-xs leading-5">
                  dry-run only: storage delete は呼びません。bucket unavailable / missing known object がある場合は storage_cleanup_failed で止める前提です。
                </p>
              </div>
              <dl className="grid gap-2 text-xs">
                {storageBucketRows.map((bucket) => (
                  <div key={bucket.bucket} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">{bucket.bucket}</dt>
                      <dd className="text-ink-700">
                        {bucket.status} / listed {bucket.listedObjectCount} / known {bucket.knownObjectCount}
                      </dd>
                    </div>
                    <p className="mt-1 text-ink-500">
                      orphan candidates {bucket.orphanCandidateCount} / missing known {bucket.missingKnownObjectCount} / list {bucket.listStatus}
                    </p>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                storage path、object key、signed URL、email、script 本文、transcript、raw audio、provider reference、raw provider response、secret は返しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Storage cleanup dry-run を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">DB 側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            DB cleanup の dry-run です。table ごとの候補件数と分類だけを確認し、row id や本文などの raw data は表示しません。
          </p>
          {databaseDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{databaseDryRunMessage}</p>
          ) : null}
          {databaseDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">database cleanup: {databaseDryRun.status}</p>
                <p className="mt-1 text-xs leading-5">
                  dry-run only: DB delete / update / anonymize は呼びません。DB cleanup は provider / storage cleanup の後に進める前提です。
                </p>
              </div>
              <dl className="grid gap-2 text-xs">
                {databaseTableRows.map((table) => (
                  <div key={table.table} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">{table.table}</dt>
                      <dd className="text-ink-700">
                        {table.action} / {table.status} / count {table.candidateCount}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                row id、email、script 本文、transcript、raw payload、metadata raw detail、storage path、provider reference、secret は返しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">DB cleanup dry-run を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Auth アカウント削除の準備状況を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Supabase Auth cleanup の dry-run です。Auth account deletion は最後の stage で、DB cleanup が完了扱いになるまで待ちます。
          </p>
          {authDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{authDryRunMessage}</p>
          ) : null}
          {authDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">auth cleanup: {authDryRun.status}</p>
                <p className="mt-1 text-xs leading-5">
                  dry-run only: Supabase Auth user deletion は呼びません。完了 tracking は anonymized reference と cleanup status だけに寄せる前提です。
                </p>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">request runnable</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.requestRunnable ? "yes" : "no"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">service role</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.serviceRoleAvailable ? "available" : "unavailable"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">DB cleanup</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.dbCleanupSatisfied ? "satisfied" : "waiting"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">auth account</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.authUserStatus}</dd>
                </div>
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                user reference、email、session detail、credential、raw auth detail、metadata raw detail、secret は返しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Auth deletion dry-run を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {!requestCreated ? (
        <button
          type="button"
          onClick={submitRequest}
          disabled={isPending}
          className="mt-5 inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "作成中..." : "削除リクエストを作成"}
        </button>
      ) : null}

      {deletionRequest?.status === "requested" ? (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">確認ステップ</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            誤操作を避けるため、確認欄に <span className="font-mono font-semibold">DELETE</span> と入力してください。将来はこの step に re-authentication を追加します。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              className="min-h-11 flex-1 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-[var(--accent)]"
              placeholder="DELETE"
              aria-label="削除確認入力"
            />
            <button
              type="button"
              onClick={submitConfirm}
              disabled={!canConfirm || isPending}
              className="inline-flex justify-center rounded-2xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "確認中..." : "削除リクエストを確認"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-ink-700">{message}</p>
      ) : null}
    </section>
  );
}
