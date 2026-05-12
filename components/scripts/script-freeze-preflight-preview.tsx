"use client";

import { useMemo } from "react";
import { analyzeScriptDraft, getScriptFreezeReadiness } from "@/lib/script-studio";

type ScriptFreezePreflightPreviewProps = {
  title: string;
  content: string;
  targetSeconds: number;
};

export function ScriptFreezePreflightPreview({ title, content, targetSeconds }: ScriptFreezePreflightPreviewProps) {
  const trimmedContent = content.trim();
  const preflight = useMemo(() => {
    const draft = analyzeScriptDraft(trimmedContent, { targetLengthSeconds: targetSeconds }, { title });

    return {
      draft,
      freezeReadiness: getScriptFreezeReadiness(draft)
    };
  }, [targetSeconds, title, trimmedContent]);
  const { draft, freezeReadiness } = preflight;
  const visibleBlockingReasons = getUniqueGuidanceItems(freezeReadiness.blockingReasons).slice(0, 4);
  const visibleWarnings = getUniqueGuidanceItems(freezeReadiness.warnings)
    .filter((warning) => !visibleBlockingReasons.some((reason) => isSimilarGuidance(warning, reason)))
    .slice(0, 4);
  const showNextAction = ![...visibleBlockingReasons, ...visibleWarnings].some((item) => isSimilarGuidance(item, freezeReadiness.nextAction));

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">保存前チェックの目安</p>
          <p className="mt-2 font-semibold text-ink-900">
            {trimmedContent.length === 0
              ? "台本を入れると、保存前の目安を確認できます。"
              : freezeReadiness.canFreeze
                ? "保存して listen に進めそうです。"
                : "保存前に先に直すとよい点があります。"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">
          表示のみ
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-ink-500">
        これは表示のみです。保存、freeze、音声生成、quota 消費は行いません。
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="words" value={`${draft.wordCount}`} />
        <Metric label="practice" value={`${draft.estimatedSpeakingTime.practiceSeconds}秒`} />
        <Metric label="chunks" value={`${draft.chunks.length}`} />
        <Metric label="focus" value={`${draft.focusWords.length}/3`} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ListBlock title="先に確認すること" emptyLabel="blocking reason はありません。">
          {visibleBlockingReasons.map((reason) => (
            <li key={reason}>・{reason}</li>
          ))}
        </ListBlock>
        <ListBlock title="直すと安定する点" emptyLabel="大きな warning はありません。">
          {visibleWarnings.map((warning) => (
            <li key={warning}>・{warning}</li>
          ))}
        </ListBlock>
      </div>

      {showNextAction ? (
        <p className="mt-3 text-xs leading-5 text-ink-500">
          Next action: {freezeReadiness.nextAction}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function ListBlock({ title, emptyLabel, children }: { title: string; emptyLabel: string; children: React.ReactNode }) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{title}</p>
      {childCount > 0 ? <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">{children}</ul> : <p className="mt-2 text-sm text-ink-500">{emptyLabel}</p>}
    </div>
  );
}

function getUniqueGuidanceItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function isSimilarGuidance(a: string, b: string) {
  const normalizedA = normalizeGuidance(a);
  const normalizedB = normalizeGuidance(b);

  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (normalizedA.includes("focuswords") && normalizedB.includes("focuswords")) {
    return true;
  }

  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}

function normalizeGuidance(value: string) {
  return value
    .toLowerCase()
    .replace(/freeze 前に/g, "")
    .replace(/[・。、,.\s]/g, "");
}
