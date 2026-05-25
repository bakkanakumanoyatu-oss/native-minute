import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { getScriptReviewPath } from "@/lib/script-routes";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { listSavedBestTakes, listSavedModelAudios, type SavedBestTakeRow, type SavedModelAudioRow } from "@/services/audio-library";
import { getProgressOverview, type ProgressTakeSummary, type ScriptProgressItem } from "@/services/progress";
import { ProtectedAudioPlayer } from "@/components/audio/protected-audio-player";
import { BestResultExportActions } from "@/components/export/best-result-export-actions";

type ProgressAudioLibraryState = {
  savedModelAudios: SavedModelAudioRow[];
  savedBestTakes: SavedBestTakeRow[];
  loadFailed: boolean;
};

type PageProps = {
  searchParams?:
    | {
        scriptId?: string;
      }
    | Promise<{
        scriptId?: string;
      }>;
};

export default async function ProgressPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const authState = await getAuthState();

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-5">
        <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">progress</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">設定を確認してください</h1>
          <p className="mt-3 text-sm leading-6 text-ink-600">{authState.message}</p>
          <Link href={buildLoginHref("/progress", "supabase_not_configured", "/progress")} className="mt-5 inline-flex rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
            ログインへ
          </Link>
        </div>
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref("/progress", "login_required", "/progress"));
  }

  const supabase = createSupabaseServerClient();
  const overview = await getProgressOverview(supabase, authState.user.id);
  const slots = overview.scripts.slice(0, 5);
  const selectedItem = slots.find((item) => item.script.id === resolvedSearchParams?.scriptId) ?? slots[0] ?? null;
  const audioLibraryByScriptId = await getProgressAudioLibraryByScriptId(
    supabase,
    authState.user.id,
    slots.map((item) => item.script.id)
  );

  if (overview.totalScripts === 0) {
    return (
      <section className="space-y-5">
        <ProgressHeader slotCount={0} />
        <div className="rounded-[2rem] border border-dashed border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">まだ練習がありません</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">まず1本作ると、成果をここで見られます。</p>
          <Link href="/scripts/new" className="mt-5 inline-flex rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
            新しい1分を作る
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <ProgressHeader slotCount={slots.length} />
      <ProgressSlotSelector slots={slots} selectedScriptId={selectedItem?.script.id ?? null} />
      <ProgressSlotResult
        item={selectedItem}
        library={selectedItem ? audioLibraryByScriptId.get(selectedItem.script.id) ?? getEmptyProgressAudioLibraryState(false) : getEmptyProgressAudioLibraryState(false)}
      />
    </section>
  );
}

function ProgressHeader({ slotCount }: { slotCount: number }) {
  return (
    <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.92))] p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">progress</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">自分の成果</h1>
          <p className="mt-2 text-sm font-semibold text-ink-600">練習スロット {slotCount} / 5</p>
        </div>
      </div>
    </div>
  );
}

function ProgressSlotSelector({
  slots,
  selectedScriptId
}: {
  slots: ScriptProgressItem[];
  selectedScriptId: string | null;
}) {
  const slotCells = Array.from({ length: 5 }, (_, index) => slots[index] ?? null);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {slotCells.map((item, index) => {
        if (!item) {
          return (
            <div
              key={`empty-${index}`}
              className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-white/70 p-4 text-sm text-ink-500"
            >
              <span className="font-semibold">空きスロット {index + 1}</span>
              <span className="mt-2 block text-xs leading-5">Practice で追加</span>
            </div>
          );
        }

        const isSelected = item.script.id === selectedScriptId;
        const score = item.bestTake?.score ?? item.latestTake?.score ?? null;

        return (
          <Link
            key={item.script.id}
            href={`/progress?scriptId=${item.script.id}`}
            className={`rounded-[1.25rem] border p-4 text-left transition ${
              isSelected
                ? "border-[var(--accent)] bg-white shadow-soft"
                : "border-[var(--line)] bg-white/80 hover:border-[var(--accent)]"
            }`}
          >
            <span className="text-xs font-semibold text-[var(--accent-strong)]">slot {index + 1}</span>
            <span className="mt-2 line-clamp-2 block text-sm font-semibold text-ink-900">{item.script.title}</span>
            <span className="mt-3 block text-xs text-ink-600">{score === null ? "まだ結果なし" : `スコア ${score}`}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ProgressSlotResult({
  item,
  library
}: {
  item: ScriptProgressItem | null;
  library: ProgressAudioLibraryState;
}) {
  if (!item) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-[var(--accent-strong)]">選択中</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{item.script.title}</h2>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-600">{item.script.content}</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard
          label="最新結果"
          take={item.latestTake}
          scriptTitle={item.script.title}
          reviewHref={item.latestTake ? getScriptReviewPath(item.script.id, item.latestTake.id) : null}
        />
        <ResultCard
          label="ベスト結果"
          take={item.bestTake}
          scriptTitle={item.script.title}
          reviewHref={item.bestTake ? getScriptReviewPath(item.script.id, item.bestTake.id) : null}
          showExport
        />
      </div>

      <details className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">過去の記録を見る</summary>
        <div className="mt-5 space-y-5">
          <PreviousTakeBlock item={item} />
          <SavedBestTakeSummaryList scriptId={item.script.id} items={library.savedBestTakes} loadFailed={library.loadFailed} />
          <SavedModelAudioSummaryList items={library.savedModelAudios} loadFailed={library.loadFailed} />
        </div>
      </details>
    </div>
  );
}

function ResultCard({
  label,
  take,
  scriptTitle,
  reviewHref,
  showExport = false
}: {
  label: string;
  take: ProgressTakeSummary | null;
  scriptTitle: string;
  reviewHref: string | null;
  showExport?: boolean;
}) {
  return (
    <article className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-[var(--accent-strong)]">{label}</p>
      {take ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-semibold tracking-tight text-ink-900">{take.score}</p>
              <p className="mt-1 text-xs font-semibold text-ink-500">{formatReviewDate(take.reviewedAt ?? take.createdAt)}</p>
            </div>
            {reviewHref ? (
              <Link href={reviewHref} className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-ink-800">
                評価を見る
              </Link>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-ink-700">{take.coach.summaryJa}</p>
          <ProtectedAudioPlayer sourceUrl={`/api/takes/${take.id}/audio`} />
          {showExport ? (
            <BestResultExportActions
              audioHref={`/api/takes/${take.id}/audio`}
              title={scriptTitle}
              score={take.score}
              dateLabel={formatReviewDate(take.reviewedAt ?? take.createdAt)}
              comment={take.coach.summaryJa}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-800">まだ録音結果がありません</p>
          <p className="mt-2 text-sm leading-6 text-ink-600">練習を録音するとここに表示されます。</p>
        </div>
      )}
    </article>
  );
}

function PreviousTakeBlock({ item }: { item: ScriptProgressItem }) {
  if (!item.previousTake) {
    return <p className="rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-600">前回結果はまだありません。</p>;
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-ink-900">前回結果</p>
        <p className="text-sm font-semibold text-ink-700">スコア {item.previousTake.score}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">{item.previousTake.coach.summaryJa}</p>
      <div className="mt-4">
        <ProtectedAudioPlayer sourceUrl={`/api/takes/${item.previousTake.id}/audio`} />
      </div>
    </div>
  );
}

function SavedBestTakeSummaryList({
  scriptId,
  items,
  loadFailed
}: {
  scriptId: string;
  items: SavedBestTakeRow[];
  loadFailed: boolean;
}) {
  if (loadFailed) {
    return <p className="text-sm leading-6 text-amber-700">保存済み録音を読み込めませんでした。</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm leading-6 text-ink-600">保存済みベスト録音はまだありません。</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-900">保存済みベスト録音</h3>
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink-900">{item.label ?? `ベスト録音 ${item.slot}`}</p>
            <Link href={getScriptReviewPath(scriptId, item.take_id)} className="text-sm font-semibold text-[var(--accent-strong)]">
              評価を見る
            </Link>
          </div>
          <p className="mt-1 text-xs text-ink-500">{formatSavedAt(item.saved_at)}</p>
          <div className="mt-3">
            <ProtectedAudioPlayer sourceUrl={`/api/takes/${item.take_id}/audio`} />
          </div>
        </article>
      ))}
    </div>
  );
}

function SavedModelAudioSummaryList({
  items,
  loadFailed
}: {
  items: SavedModelAudioRow[];
  loadFailed: boolean;
}) {
  if (loadFailed) {
    return <p className="text-sm leading-6 text-amber-700">保存済みお手本を読み込めませんでした。</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm leading-6 text-ink-600">保存済みお手本はまだありません。</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-900">保存済みお手本</h3>
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <p className="text-sm font-semibold text-ink-900">{item.label ?? `お手本 ${item.slot}`}</p>
          <p className="mt-1 text-xs text-ink-500">{formatSavedAt(item.saved_at)}</p>
          <div className="mt-3">
            <ProtectedAudioPlayer sourceUrl={`/api/script-audio/${item.script_audio_id}`} />
          </div>
          <ModelAudioMetadata metadata={item.metadata} />
        </article>
      ))}
    </div>
  );
}

function ModelAudioMetadata({ metadata }: { metadata: Json }) {
  const targetWpm = readMetadataValue(metadata, "target_wpm");
  const targetSpeed = readMetadataValue(metadata, "target_speed");

  if (!targetWpm && !targetSpeed) {
    return null;
  }

  return (
    <p className="mt-2 text-xs leading-5 text-ink-500">
      {targetWpm ? `目安 ${targetWpm} WPM` : null}
      {targetWpm && targetSpeed ? " / " : null}
      {targetSpeed ? `速度 ${targetSpeed}` : null}
    </p>
  );
}

async function getProgressAudioLibraryByScriptId(client: AppSupabaseClient, userId: string, scriptIds: string[]) {
  const entries = await Promise.all(
    scriptIds.map(async (scriptId) => {
      try {
        const [savedModelAudios, savedBestTakes] = await Promise.all([
          listSavedModelAudios(client, userId, scriptId),
          listSavedBestTakes(client, userId, scriptId)
        ]);

        return [scriptId, { savedModelAudios, savedBestTakes, loadFailed: false }] as const;
      } catch {
        return [scriptId, getEmptyProgressAudioLibraryState(true)] as const;
      }
    })
  );

  return new Map<string, ProgressAudioLibraryState>(entries);
}

function getEmptyProgressAudioLibraryState(loadFailed: boolean): ProgressAudioLibraryState {
  return {
    savedModelAudios: [],
    savedBestTakes: [],
    loadFailed
  };
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSavedAt(value: string | null) {
  if (!value) {
    return "保存日なし";
  }

  return `保存 ${formatReviewDate(value)}`;
}

function readMetadataValue(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, Json>)[key];
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return null;
}
