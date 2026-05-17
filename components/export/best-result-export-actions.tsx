"use client";

import { useMemo, useState } from "react";

type BestResultExportActionsProps = {
  audioHref: string | null;
  title: string;
  score: number;
  dateLabel: string;
  comment: string;
};

export function BestResultExportActions({
  audioHref,
  title,
  score,
  dateLabel,
  comment
}: BestResultExportActionsProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
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
    <section className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
      <p className="text-sm font-semibold text-ink-900">ベスト録音を残す</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        {audioHref ? (
          <a href={audioHref} download className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white">
            ベスト録音をダウンロード
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800"
        >
          結果をコピー
        </button>
      </div>
      {copyMessage ? <p className="mt-2 text-xs leading-5 text-ink-600">{copyMessage}</p> : null}
      <details className="mt-3 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">
        <summary className="cursor-pointer font-semibold text-ink-800">この録音でブラッシュアップ（準備中）</summary>
        <p className="mt-2">
          この録音をもとに専用のお手本ボイスを作るには、音声の選び方と保存先の仕様が必要です。今は誤って使えるボタンにせず、次実装の入口だけ示します。
        </p>
      </details>
    </section>
  );
}
