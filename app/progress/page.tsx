import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { timeAsync } from "@/lib/performance/timing";
import { getScriptReviewPath } from "@/lib/script-routes";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { listSavedBestTakes, listSavedModelAudios, type SavedBestTakeRow, type SavedModelAudioRow } from "@/services/audio-library";
import { getProgressOverview, type ProgressTakeSummary, type ScriptProgressItem } from "@/services/progress";
import { ProtectedAudioPlayer } from "@/components/audio/protected-audio-player";
import { BestResultExportActions } from "@/components/export/best-result-export-actions";
import { getPronunciationProviderName } from "@/services/pronunciation";

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
  const authState = await timeAsync("progress.page.auth", () => getAuthState());

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-5">
        <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 shadow-[var(--shadow-studio-soft)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8c5f37]">声のログ</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">設定を確認してください</h1>
          <p className="mt-3 text-sm leading-6 text-ink-600">{authState.message}</p>
          <Link href={buildLoginHref("/progress", "supabase_not_configured", "/progress")} className="mt-5 inline-flex rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
            ログインへ
          </Link>
        </div>
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref("/progress", "login_required", "/progress"));
  }

  const user = authState.user;
  const supabase = createSupabaseServerClient();
  const overview = await timeAsync("progress.page.overview", () => getProgressOverview(supabase, user.id));
  const isPracticeEstimate = getPronunciationProviderName() === "mock";
  const slots = getVisibleProgressSlots(overview.scripts, resolvedSearchParams?.scriptId);
  const selectedItem = slots.find((item) => item.script.id === resolvedSearchParams?.scriptId) ?? slots[0] ?? null;
  const selectedSlotNumber = selectedItem ? slots.findIndex((item) => item.script.id === selectedItem.script.id) + 1 : null;
  const selectedAudioLibrary = await timeAsync("progress.page.audioLibrary", () =>
    selectedItem
      ? getProgressAudioLibraryForScript(supabase, user.id, selectedItem.script.id)
      : Promise.resolve(getEmptyProgressAudioLibraryState(false))
  );

  if (overview.totalScripts === 0) {
    return (
      <section className="space-y-5">
        <ProgressHeader slotCount={0} />
        <div className="rounded-[2rem] border border-dashed border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 shadow-[var(--shadow-studio-soft)]">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">まだ声のログがありません</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">まず1本作ると、最新 Take とベストテイクをここに残せます。</p>
          <Link href="/scripts/new" className="mt-5 inline-flex rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
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
        slotNumber={selectedSlotNumber}
        isPracticeEstimate={isPracticeEstimate}
        library={selectedAudioLibrary}
      />
    </section>
  );
}

function ProgressHeader({ slotCount }: { slotCount: number }) {
  return (
    <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[linear-gradient(135deg,var(--surface-log-shelf),var(--surface-primary))] p-6 shadow-[var(--shadow-studio-soft)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8c5f37]">声のログ</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">声のログ棚</h1>
          <p className="mt-2 text-sm font-semibold text-ink-600">1分ストック {slotCount} / 5</p>
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="progress-script-list">
      {slotCells.map((item, index) => {
        if (!item) {
          return (
            <div
              key={`empty-${index}`}
              className="rounded-[1.25rem] border border-dashed border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4 text-sm text-ink-500"
            >
              <span className="font-semibold">空きスロット {index + 1}</span>
              <span className="mt-2 block text-xs leading-5">新しい1分を追加</span>
            </div>
          );
        }

        const isSelected = item.script.id === selectedScriptId;
        const score = item.bestTake?.score ?? item.latestTake?.score ?? null;

        return (
          <Link
            key={item.script.id}
            href={`/progress?scriptId=${item.script.id}`}
            data-testid={`progress-script-card-${item.script.id}`}
            className={`rounded-[1.25rem] border p-4 text-left transition ${
              isSelected
                ? "border-[#6f5236] bg-[var(--surface-paper)] shadow-[var(--shadow-studio-soft)] ring-1 ring-[#6f5236]/15"
                : "border-[var(--line-subtle)] bg-[var(--surface-secondary)] hover:border-[var(--line-inset)]"
            }`}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#8c5f37]">
              <span>slot {index + 1}</span>
              {isSelected ? <span className="rounded-full bg-[rgba(111,82,54,0.12)] px-2 py-1 text-[11px] text-[#5f432b]">選択中</span> : null}
            </span>
            <span className="mt-2 line-clamp-2 block text-sm font-semibold text-ink-900">{item.script.title}</span>
            <span className="mt-3 block text-xs text-ink-600">{score === null ? "まだ録っていない" : `目安 ${score}`}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ProgressSlotResult({
  item,
  slotNumber,
  isPracticeEstimate,
  library
}: {
  item: ScriptProgressItem | null;
  slotNumber: number | null;
  isPracticeEstimate: boolean;
  library: ProgressAudioLibraryState;
}) {
  if (!item) {
    return null;
  }

  const latestTake = getTakeForScript(item.latestTake, item.script.id);
  const bestTake = getTakeForScript(item.bestTake, item.script.id);
  const selectedLibrary = getLibraryForScript(library, item.script.id);

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-paper)] p-6 shadow-[var(--shadow-studio-soft)]">
        <div>
          <p className="text-sm font-semibold text-[#8c5f37]">{slotNumber ? `slot ${slotNumber} を表示中` : "選択中の1分"}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{item.script.title}</h2>
          <div data-testid="progress-selected-script-paper" className="mt-4 rounded-[1.5rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c5f37]">この1分の台本</p>
            <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-ink-800">{item.script.content}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard
          label="最新テイク"
          take={latestTake}
          scriptTitle={item.script.title}
          reviewHref={latestTake ? getScriptReviewPath(item.script.id, latestTake.id) : null}
          isPracticeEstimate={isPracticeEstimate}
        />
        <ResultCard
          label="ベストテイク"
          take={bestTake}
          scriptTitle={item.script.title}
          reviewHref={bestTake ? getScriptReviewPath(item.script.id, bestTake.id) : null}
          showExport
          isPracticeEstimate={isPracticeEstimate}
        />
      </div>

      <details className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-log-shelf)] p-6 shadow-[var(--shadow-studio-soft)]">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">声のログを開く</summary>
        <div className="mt-5 space-y-5">
          <PreviousTakeBlock item={item} />
          <SavedBestTakeSummaryList scriptId={item.script.id} items={selectedLibrary.savedBestTakes} loadFailed={selectedLibrary.loadFailed} />
          <SavedModelAudioSummaryList items={selectedLibrary.savedModelAudios} loadFailed={selectedLibrary.loadFailed} />
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
  showExport = false,
  isPracticeEstimate
}: {
  label: string;
  take: ProgressTakeSummary | null;
  scriptTitle: string;
  reviewHref: string | null;
  showExport?: boolean;
  isPracticeEstimate: boolean;
}) {
  return (
    <article className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-6 shadow-[var(--shadow-studio-soft)]">
      <p className="text-sm font-semibold text-[#8c5f37]">{label}</p>
      {take ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">参考スコア</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">{take.score}</p>
              <p className="mt-1 text-xs font-semibold text-ink-500">{formatReviewDate(take.reviewedAt ?? take.createdAt)}</p>
            </div>
            {reviewHref ? (
              <Link href={reviewHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                Take メモを見る
              </Link>
            ) : null}
          </div>
          {isPracticeEstimate ? (
            <p className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-xs leading-5 text-ink-600">
              この環境では練習用の簡易評価です。次の1点と Focus words を優先して見ます。
            </p>
          ) : null}
          <p className="text-sm leading-6 text-ink-700">{take.coach.summaryJa}</p>
          <ProtectedAudioPlayer sourceUrl={`/api/takes/${take.id}/audio`} variant="studio" lazy revealLabel="この Take を聞く" />
          {showExport ? (
            <BestResultExportActions
              audioHref={`/api/takes/${take.id}/audio`}
              title={scriptTitle}
              score={take.score}
              dateLabel={formatReviewDate(take.reviewedAt ?? take.createdAt)}
              comment={take.coach.summaryJa}
              variant="studio"
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--line-inset)] bg-[var(--surface-inset)] p-4">
          <p className="text-sm font-semibold text-ink-800">まだこの1分には Take がありません</p>
          <p className="mt-2 text-sm leading-6 text-ink-600">この台本で Take を録ると、この紙に残ります。</p>
        </div>
      )}
    </article>
  );
}

function PreviousTakeBlock({ item }: { item: ScriptProgressItem }) {
  const previousTake = getTakeForScript(item.previousTake, item.script.id);

  if (!previousTake) {
    return <p className="rounded-2xl bg-[var(--surface-inset)] p-4 text-sm leading-6 text-ink-600">前回の Take はまだありません。</p>;
  }

  return (
    <div className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-ink-900">前回の Take</p>
        <p className="text-sm font-semibold text-ink-700">参考スコア {previousTake.score}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">{previousTake.coach.summaryJa}</p>
      <div className="mt-4">
        <ProtectedAudioPlayer sourceUrl={`/api/takes/${previousTake.id}/audio`} variant="studio" lazy revealLabel="前回の Take を聞く" />
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
    return <p className="text-sm leading-6 text-ink-600">保存したベストテイクはまだありません。</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-900">保存したベストテイク</h3>
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink-900">{item.label ?? `ベストテイク ${item.slot}`}</p>
            <Link href={getScriptReviewPath(scriptId, item.take_id)} className="text-sm font-semibold text-[#8c5f37]">
              Take メモを見る
            </Link>
          </div>
          <p className="mt-1 text-xs text-ink-500">{formatSavedAt(item.saved_at)}</p>
          <div className="mt-3">
            <ProtectedAudioPlayer sourceUrl={`/api/takes/${item.take_id}/audio`} variant="studio" lazy revealLabel="保存した Take を聞く" />
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
        <article key={item.id} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4">
          <p className="text-sm font-semibold text-ink-900">{item.label ?? `お手本 ${item.slot}`}</p>
          <p className="mt-1 text-xs text-ink-500">{formatSavedAt(item.saved_at)}</p>
          <div className="mt-3">
            <ProtectedAudioPlayer sourceUrl={`/api/script-audio/${item.script_audio_id}`} variant="studio" lazy revealLabel="保存済みお手本を聞く" />
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

async function getProgressAudioLibraryForScript(client: AppSupabaseClient, userId: string, scriptId: string) {
  return timeAsync("progress.audioLibrarySelectedScript", async () => {
    try {
      const [savedModelAudios, savedBestTakes] = await Promise.all([
        listSavedModelAudios(client, userId, scriptId),
        listSavedBestTakes(client, userId, scriptId)
      ]);

      return { savedModelAudios, savedBestTakes, loadFailed: false };
    } catch {
      return getEmptyProgressAudioLibraryState(true);
    }
  });
}

function getEmptyProgressAudioLibraryState(loadFailed: boolean): ProgressAudioLibraryState {
  return {
    savedModelAudios: [],
    savedBestTakes: [],
    loadFailed
  };
}

function getVisibleProgressSlots(items: ScriptProgressItem[], selectedScriptId: string | undefined) {
  const firstSlots = items.slice(0, 5);

  if (!selectedScriptId || firstSlots.some((item) => item.script.id === selectedScriptId)) {
    return firstSlots;
  }

  const selectedItem = items.find((item) => item.script.id === selectedScriptId);

  if (!selectedItem) {
    return firstSlots;
  }

  return [selectedItem, ...firstSlots.filter((item) => item.script.id !== selectedScriptId)].slice(0, 5);
}

function getTakeForScript(take: ProgressTakeSummary | null, scriptId: string) {
  if (!take || take.scriptId !== scriptId) {
    return null;
  }

  return take;
}

function getLibraryForScript(library: ProgressAudioLibraryState, scriptId: string): ProgressAudioLibraryState {
  return {
    savedModelAudios: library.savedModelAudios.filter((item) => item.script_id === scriptId),
    savedBestTakes: library.savedBestTakes.filter((item) => item.script_id === scriptId),
    loadFailed: library.loadFailed
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
