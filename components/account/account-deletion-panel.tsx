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
    summary: "削除リクエストの確認まで完了しました。現時点では実際の削除はまだ始まりません。削除対象の件数確認と安全な証跡だけを表示します。",
    tone: "warn"
  },
  processing: {
    label: "処理中",
    summary: "削除処理中です。完了または失敗状態をこの画面で確認できます。",
    tone: "warn"
  },
  provider_cleanup_failed: {
    label: "音声プロバイダー確認で停止",
    summary: "外部音声サービス側の削除確認で停止しています。サポートによる確認が必要です。",
    tone: "alert"
  },
  storage_cleanup_failed: {
    label: "保存音声の確認で停止",
    summary: "録音やお手本音声など、保存ファイル側の削除確認で停止しています。サポートによる確認が必要です。",
    tone: "alert"
  },
  db_cleanup_failed: {
    label: "アプリデータの確認で停止",
    summary: "台本や練習結果など、アプリ内データの削除確認で停止しています。サポートによる確認が必要です。",
    tone: "alert"
  },
  auth_cleanup_failed: {
    label: "ログインアカウント確認で停止",
    summary: "ログインアカウントの削除確認で停止しています。サポートによる確認が必要です。",
    tone: "alert"
  },
  completed: {
    label: "完了",
    summary: "削除処理の完了状態として記録されている場合の表示です。この画面では新たな実削除や完了更新は行わず、外部サービス、保存ファイル、アプリデータ、ログインアカウントの安全な完了確認を別途行います。",
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

const V1_DELETION_SCOPE_GROUPS = [
  {
    title: "アカウント",
    items: ["ログインアカウント", "プロフィール / アカウント情報"]
  },
  {
    title: "練習データ",
    items: ["台本", "録音", "take", "弱点語", "コーチングフィードバック"]
  },
  {
    title: "音声とボイス設定",
    items: ["お手本音声", "音声サンプル", "同意録音", "ボイス設定", "通常のお手本ボイス関連情報"]
  },
  {
    title: "管理用メタデータ",
    items: ["保存済みベスト録音", "保存済みお手本音声", "処理状況 / 利用量メモ", "削除リクエストの管理記録"]
  }
] as const;

const DELETION_PHASES = [
  "削除リクエストを作成",
  "誤操作防止の確認",
  "削除対象の件数確認",
  "使い捨てアカウントで安全確認",
  "実削除の実装確認",
  "外部サービス / 保存ファイル / アプリデータ / ログインアカウントの順に削除",
  "削除後の確認",
  "Store 提出前 QA"
] as const;

const GATE4D_NOT_IMPLEMENTED = [
  "実際のアカウント削除",
  "ログインアカウントの削除",
  "保存ファイルの削除",
  "アプリデータの削除 / 匿名化",
  "外部サービス側の削除実行",
  "追加のお手本生成データの削除"
] as const;

const STAGE_LABELS: Record<string, string> = {
  provider_cleanup: "外部音声サービスの確認",
  storage_cleanup: "保存ファイルの確認",
  db_cleanup: "アプリデータの確認",
  auth_cleanup: "ログインアカウントの確認",
  completion: "完了状態の確認"
};

const STATUS_LABELS: Record<string, string> = {
  ready: "準備できています",
  waiting_for_prior_stage: "前の確認待ち",
  already_satisfied: "確認済み",
  blocked: "確認が必要です",
  required: "対象あり",
  not_needed: "対象なし",
  succeeded: "完了",
  failed: "失敗",
  manual_required: "手動確認が必要",
  pending: "未処理",
  available: "確認できます",
  unavailable: "確認できません",
  retained: "管理用に最小保持",
  waiting_for_db_cleanup: "アプリデータ確認待ち",
  covered: "確認対象",
  deferred: "後回し",
  actual_deletion_not_run: "実削除は未実行"
};

const GUARD_COPY: Record<string, string> = {
  "Provider cleanup must run before storage, DB, and Auth cleanup.": "保存ファイル、アプリデータ、ログインアカウントより先に外部音声サービス側を確認します。",
  "Storage cleanup can run only after provider cleanup is succeeded or not_needed.": "外部音声サービス側の確認が終わってから、保存ファイルを確認します。",
  "DB cleanup can run only after storage cleanup is succeeded or not_needed.": "保存ファイルの確認が終わってから、アプリデータを確認します。",
  "Supabase Auth deletion can run only after DB cleanup is succeeded or not_needed.": "アプリデータの確認が終わってから、ログインアカウントを確認します。",
  "Completion can be recorded only after Auth cleanup is succeeded or not_needed.": "ログインアカウントの確認が終わってから、完了状態を記録します。"
};

function formatLabel(value: string) {
  return STAGE_LABELS[value] ?? STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatStatus(value: string) {
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatGuard(value: string) {
  return GUARD_COPY[value] ?? value;
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
      ["リクエスト作成", formatDate(deletionRequest.requestedAt)],
      ["確認", formatDate(deletionRequest.confirmedAt)],
      ["外部サービス", formatStatus(deletionRequest.cleanup.provider)],
      ["保存ファイル", formatStatus(deletionRequest.cleanup.storage)],
      ["アプリデータ", formatStatus(deletionRequest.cleanup.database)],
      ["ログインアカウント", formatStatus(deletionRequest.cleanup.auth)]
    ];
  }, [deletionRequest]);
  const inventoryRows = useMemo(() => {
    if (!inventory) {
      return [];
    }

    return [
      ["プロフィール", inventory.database.profiles],
      ["台本", inventory.database.scripts],
      ["録音結果", inventory.database.takes],
      ["弱点語", inventory.database.weakWords],
      ["コーチングメモ", inventory.database.coachFeedback],
      ["保存済みベスト録音", inventory.database.savedBestTakes],
      ["保存済みお手本音声", inventory.database.savedModelAudios],
      ["台本用お手本音声", inventory.database.scriptAudios],
      ["ボイス同意", inventory.database.voiceConsents],
      ["ボイス設定", inventory.database.voices],
      ["利用量メモ", inventory.database.quotaEvents],
      ["ElevenLabs 側の候補", inventory.provider.elevenLabsVoiceCandidates]
    ];
  }, [inventory]);
  const storageRows = useMemo(() => {
    if (!inventory) {
      return [];
    }

    return [
      ["録音", inventory.storage.recordings],
      ["台本用お手本音声", inventory.storage.scriptAudios],
      ["音声サンプル", inventory.storage.voiceSamples],
      ["同意録音", inventory.storage.voiceConsents]
    ] satisfies Array<[string, { count: number; status: "available" | "unavailable" }]>;
  }, [inventory]);
  const jobStageRows = useMemo(() => jobDryRun?.stages ?? [], [jobDryRun]);
  const jobSummary = jobDryRun?.summary ?? null;
  const coverageRows = useMemo(() => jobSummary?.coverage ?? [], [jobSummary]);
  const operatorChecklistRows = useMemo(() => jobSummary?.operatorChecklist ?? [], [jobSummary]);
  const providerCandidateRows = useMemo(() => {
    if (!providerDryRun) {
      return [];
    }

    return [
      ["すべてのボイス設定", providerDryRun.candidates.totalVoices],
      ["ElevenLabs ボイス", providerDryRun.candidates.elevenLabsVoices],
      ["削除確認が必要", providerDryRun.cleanup.required],
      ["外部サービス参照なし", providerDryRun.candidates.providerReferenceMissing],
      ["外部サービス参照の不整合", providerDryRun.candidates.providerReferenceInvalid],
      ["ElevenLabs 以外のボイス", providerDryRun.candidates.nonElevenLabsVoices]
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
        setJobDryRunMessage("削除対象の件数確認を取得できませんでした。");
        setProviderDryRun(null);
        setProviderDryRunMessage("外部音声サービス側の確認を取得できませんでした。");
        setStorageDryRun(null);
        setStorageDryRunMessage("保存ファイル側の確認を取得できませんでした。");
        setDatabaseDryRun(null);
        setDatabaseDryRunMessage("アプリデータ側の確認を取得できませんでした。");
        setAuthDryRun(null);
        setAuthDryRunMessage("ログインアカウント側の確認を取得できませんでした。");
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
        この画面では、削除リクエストの作成、誤操作防止の確認、削除対象の件数確認までを行います。現時点では実際の削除はここから実行されません。
      </p>

      <div className="mt-4 rounded-3xl border border-[var(--line)] bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-900">削除対象として確認するもの</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          ここでは削除対象の件数と状態だけを表示します。本文、録音そのもの、保存先のパス、ログイン情報、外部サービスの生データは表示しません。
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {V1_DELETION_SCOPE_GROUPS.map((group) => (
            <div key={group.title} className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{group.title}</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-700">
                {group.items.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          保存済みベスト録音を使った追加のお手本生成データは、現在の機能では対象に含めません。
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-500">
          外部サービスの詳細な応答本文、録音そのもの、台本文、保存先パス、署名付きURL、機密情報、メールアドレスは削除リクエストの表示用メタデータに保存しません。
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--line)] bg-white p-4">
          <p className="text-sm font-semibold text-ink-900">削除までの確認ステップ</p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
            {DELETION_PHASES.map((phase, index) => (
              <li key={phase}>
                {index + 1}. {phase}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">この画面ではまだ実行しないこと</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
            {GATE4D_NOT_IMPLEMENTED.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
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
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">削除対象の件数を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            削除対象の件数だけを表示します。保存先パス、外部ボイスID、メールアドレス、台本文、文字起こし、録音そのもの、署名付きURL、機密情報は表示しません。
          </p>
          {inventoryMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{inventoryMessage}</p>
          ) : null}
          {inventory ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">アプリデータ</p>
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">保存ファイル</p>
                <dl className="mt-2 grid gap-2 text-xs">
                  {storageRows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                      <dt className="font-semibold text-ink-700">{label}</dt>
                      <dd className="text-right text-ink-900">
                        {value.count} <span className="text-ink-500">({formatStatus(value.status)})</span>
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
            将来の削除処理で確認する順番を、件数確認として表示します。ここには実行ボタンはなく、状態更新や削除処理は行いません。
          </p>
          {jobDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{jobDryRunMessage}</p>
          ) : null}
          {jobDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">{jobDryRun.canRun ? "件数確認を表示できます" : "件数確認の前提を確認中です"}</p>
                <p className="mt-1 text-xs leading-5">{formatGuard(jobDryRun.runGuard.reason)}</p>
              </div>
              <dl className="grid gap-2 text-xs">
                {jobStageRows.map((stage) => (
                  <div key={stage.name} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">
                        {stage.order}. {formatLabel(stage.name)}
                      </dt>
                      <dd className="text-ink-700">
                        {formatStatus(stage.status)}
                        {stage.count === null ? "" : ` / 件数 ${stage.count}`}
                      </dd>
                    </div>
                    <p className="mt-1 text-ink-500">{formatGuard(stage.guard)}</p>
                  </div>
                ))}
              </dl>
              {jobSummary ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">安全な件数確認</p>
                      <p className="text-xs font-semibold text-ink-700">{formatStatus(jobSummary.stopPoint)}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink-600">
                      実際の削除処理は未実行 / 未確認項目: {jobSummary.missingCoverage.length}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-2xl bg-ink-50 px-3 py-2">
                        <p className="font-semibold text-ink-800">人の確認が必要なこと</p>
                        <p className="mt-1 break-words text-ink-600">{jobSummary.humanRequired.length ? jobSummary.humanRequired.join(", ") : "なし"}</p>
                      </div>
                      <div className="rounded-2xl bg-ink-50 px-3 py-2">
                        <p className="font-semibold text-ink-800">止まっている理由</p>
                        <p className="mt-1 break-words text-ink-600">{jobSummary.blockers.length ? jobSummary.blockers.join(", ") : "なし"}</p>
                      </div>
                      <div className="rounded-2xl bg-ink-50 px-3 py-2">
                        <p className="font-semibold text-ink-800">後回しにするもの</p>
                        <p className="mt-1 break-words text-ink-600">{jobSummary.deferred.length ? jobSummary.deferred.join(", ") : "なし"}</p>
                      </div>
                      <div className="rounded-2xl bg-ink-50 px-3 py-2">
                        <p className="font-semibold text-ink-800">今回実行しない削除処理</p>
                        <p className="mt-1 break-words text-ink-600">{jobSummary.skipped.join(", ")}</p>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">対象カテゴリの確認</summary>
                    <dl className="mt-3 grid gap-2 text-xs">
                      {coverageRows.map((item) => (
                        <div key={item.category} className="rounded-2xl bg-ink-50 px-3 py-2">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <dt className="font-semibold text-ink-800">{formatLabel(item.category)}</dt>
                            <dd className="text-ink-700">
                              {formatStatus(item.status)} / {formatLabel(item.source)}
                              {item.count === null ? "" : ` / 件数 ${item.count}`}
                            </dd>
                          </div>
                        </div>
                      ))}
                    </dl>
                  </details>

                  <details className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">確認チェックリスト</summary>
                    <dl className="mt-3 grid gap-2 text-xs">
                      {operatorChecklistRows.map((item) => (
                        <div key={item.item} className="rounded-2xl bg-ink-50 px-3 py-2">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <dt className="font-semibold text-ink-800">{formatLabel(item.item)}</dt>
                            <dd className="text-ink-700">
                              {formatStatus(item.status)} / {formatLabel(item.evidenceSource)}
                            </dd>
                          </div>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              ) : null}
              <p className="text-xs leading-5 text-ink-500">
                保存先パス、外部ボイスID、メールアドレス、台本文、文字起こし、録音そのもの、署名付きURL、外部サービスの詳細な応答本文は表示しません。これは安全な件数確認で、実際の削除は実行しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">削除対象の件数確認を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">外部音声サービス側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            外部音声サービス側の削除候補を、件数だけ確認します。外部ボイスIDや生レスポンスは表示しません。
          </p>
          {providerDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{providerDryRunMessage}</p>
          ) : null}
          {providerDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">外部音声サービス: {formatStatus(providerDryRun.status)}</p>
                <p className="mt-1 text-xs leading-5">
                  件数確認のみです。ElevenLabs の削除 API は呼びません。参照不足や不整合がある場合はサポート確認に回します。
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
                外部ボイスID、外部サービスの詳細な応答本文、メールアドレス、保存先パス、台本文、文字起こし、録音そのもの、機密情報は表示しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">外部音声サービス側の確認を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">保存ファイル側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            保存ファイル側の削除候補を、保存場所ごとの件数だけ確認します。保存ファイルの詳細名や署名付きURLは表示しません。
          </p>
          {storageDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{storageDryRunMessage}</p>
          ) : null}
          {storageDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">保存ファイル: {formatStatus(storageDryRun.status)}</p>
                <p className="mt-1 text-xs leading-5">
                  件数確認のみです。保存ファイルの削除は呼びません。保存場所が確認できない場合は、削除処理に進まずサポート確認に回します。
                </p>
              </div>
              <dl className="grid gap-2 text-xs">
                {storageBucketRows.map((bucket) => (
                  <div key={bucket.bucket} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">{bucket.bucket}</dt>
                      <dd className="text-ink-700">
                        {formatStatus(bucket.status)} / 表示件数 {bucket.listedObjectCount} / 既知件数 {bucket.knownObjectCount}
                      </dd>
                    </div>
                    <p className="mt-1 text-ink-500">
                      追加確認候補 {bucket.orphanCandidateCount} / 見つからない既知ファイル {bucket.missingKnownObjectCount} / 一覧取得 {formatStatus(bucket.listStatus)}
                    </p>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                保存先パス、保存ファイルの詳細名、署名付きURL、メールアドレス、台本文、文字起こし、録音そのもの、外部サービス参照、詳細な応答本文、機密情報は表示しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">保存ファイル側の確認を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">アプリデータ側の削除候補を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            アプリデータ側の削除候補を、分類ごとの件数だけ確認します。行IDや本文などの詳細データは表示しません。
          </p>
          {databaseDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{databaseDryRunMessage}</p>
          ) : null}
          {databaseDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">アプリデータ: {formatStatus(databaseDryRun.status)}</p>
                <p className="mt-1 text-xs leading-5">
                  件数確認のみです。アプリデータの削除や匿名化は呼びません。アプリデータの削除は、外部サービスと保存ファイルの確認後に進める前提です。
                </p>
              </div>
              <dl className="grid gap-2 text-xs">
                {databaseTableRows.map((table) => (
                  <div key={table.table} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="font-semibold text-ink-800">{table.table}</dt>
                      <dd className="text-ink-700">
                        {formatStatus(table.action)} / {formatStatus(table.status)} / 件数 {table.candidateCount}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                行ID、メールアドレス、台本文、文字起こし、詳細データ、メタデータの詳細、保存先パス、外部サービス参照、機密情報は表示しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">アプリデータ側の確認を読み込み中です。</p>
          )}
        </details>
      ) : null}

      {deletionRequest ? (
        <details className="mt-4 rounded-3xl border border-[var(--line)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">ログインアカウント削除の準備状況を見る</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            ログインアカウント削除の準備状況を確認します。ログインアカウントの削除は最後に行うため、アプリデータ側の確認が終わるまで待ちます。
          </p>
          {authDryRunMessage ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{authDryRunMessage}</p>
          ) : null}
          {authDryRun ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
                <p className="font-semibold text-ink-900">ログインアカウント: {formatStatus(authDryRun.status)}</p>
                <p className="mt-1 text-xs leading-5">
                  件数確認のみです。ログインアカウントの削除は呼びません。完了後の管理記録は、匿名化した参照と削除状況だけに寄せる前提です。
                </p>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">リクエスト確認</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.requestRunnable ? "はい" : "いいえ"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">サーバー側確認</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.serviceRoleAvailable ? "確認できます" : "確認できません"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">アプリデータ確認</dt>
                  <dd className="text-ink-900">{authDryRun.preflight.dbCleanupSatisfied ? "確認済み" : "アプリデータ確認待ち"}</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2">
                  <dt className="font-semibold text-ink-700">ログインアカウント</dt>
                  <dd className="text-ink-900">{formatStatus(authDryRun.preflight.authUserStatus)}</dd>
                </div>
              </dl>
              <p className="text-xs leading-5 text-ink-500">
                ユーザー参照、メールアドレス、セッション詳細、認証情報、ログインアカウントの詳細、メタデータの詳細、機密情報は表示しません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">ログインアカウント側の確認を読み込み中です。</p>
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
            誤操作を避けるため、確認欄に <span className="font-mono font-semibold">DELETE</span> と入力してください。この確認をしても、この画面から実際の削除は始まりません。
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
