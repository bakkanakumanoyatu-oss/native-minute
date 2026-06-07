"use client";

import { useMemo, useState } from "react";

type BestResultExportActionsProps = {
  audioHref: string | null;
  title: string;
  score: number;
  dateLabel: string;
  comment: string;
  variant?: "default" | "studio";
};

export function BestResultExportActions({
  audioHref,
  title,
  score,
  dateLabel,
  comment,
  variant = "default"
}: BestResultExportActionsProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const isStudio = variant === "studio";
  const summaryText = useMemo(
    () => [`タイトル: ${title}`, `スコア: ${score}`, `日付: ${dateLabel}`, `コメント: ${comment}`].join("\n"),
    [comment, dateLabel, score, title]
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyMessage("コピーしました。");
    } catch {
      setCopyMessage("コピーできませんでした。");
    }
  }

  return (
    <section className={`mt-4 rounded-2xl border p-4 ${isStudio ? "border-[var(--line-inset)] bg-[var(--surface-take-paper)]" : "border-[var(--line)] bg-white"}`}>
      <p className="text-sm font-semibold text-ink-900">ベスト録音を残す</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        {audioHref ? (
          <a href={audioHref} download className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-[var(--cta-primary-text)]">
            ベスト録音をダウンロード
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          className={`rounded-2xl border px-4 py-3 text-ink-800 ${isStudio ? "border-[var(--line-inset)] bg-[var(--surface-paper)]" : "border-[var(--line)] bg-white"}`}
        >
          結果をコピー
        </button>
      </div>
      {copyMessage ? <p className="mt-2 text-xs leading-5 text-ink-600">{copyMessage}</p> : null}
      <details className={`mt-3 rounded-2xl border px-4 py-3 text-xs leading-5 text-ink-600 ${isStudio ? "border-[var(--line-subtle)] bg-[var(--surface-inset)]" : "border-[var(--line)] bg-ink-50"}`}>
        <summary className="cursor-pointer font-semibold text-ink-800">保存済みベスト録音の扱い</summary>
        <p className="mt-2">
          この録音を、専用のお手本ボイス素材として外部サービスへ自動送信することはありません。追加の音声活用機能を提供する場合は、別の同意と削除導線を用意します。
        </p>
      </details>
    </section>
  );
}
