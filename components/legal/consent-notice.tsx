"use client";

import Link from "next/link";

type ConsentNoticeKind = "record" | "listen" | "voice" | "review";

type NoticeCopy = {
  eyebrow: string;
  title: string;
  summary: string;
  bullets: string[];
};

const NOTICE_COPY: Record<ConsentNoticeKind, NoticeCopy> = {
  record: {
    eyebrow: "Recording notice",
    title: "録音と評価の扱い",
    summary: "録音は評価、復習、進捗表示のために保存します。OpenAI transcription と Azure pronunciation evaluation を使う場合があります。",
    bullets: [
      "録音は app-owned Storage に保存し、server-side route から評価に渡します。",
      "AI coaching / feedback は学習補助で、完全な能力判定ではありません。",
      "通常録音を、別機能の音声素材として自動利用することはありません。"
    ]
  },
  listen: {
    eyebrow: "Model audio notice",
    title: "お手本ボイスの扱い",
    summary: "お手本ボイスは normal model audio として生成または再利用し、app-owned replay から再生します。",
    bullets: [
      "voice setup の同意と sample recording が必要な場合があります。",
      "生成音声は provider 直 URL に依存せず、保存済み audio を protected route で再生します。",
      "この画面では、保存済みの声を使った追加のお手本生成は行いません。"
    ]
  },
  voice: {
    eyebrow: "Voice setup notice",
    title: "voice sample と同意録音の扱い",
    summary: "音声サンプルは、クローンボイス作成のため ElevenLabs で処理されます。通常のお手本ボイス作成のために voice sample や同意録音を扱います。",
    bullets: [
      "client から provider へ直接送らず、app-owned Storage に保存してから server-side route 経由で処理します。",
      "ElevenLabs で個人用のお手本ボイスを作成するために使います。",
      "通常録音の同意とは別に扱い、保存済みベスト録音を自動的に音声素材として使うことはありません。"
    ]
  },
  review: {
    eyebrow: "Review notice",
    title: "結果とコーチメモの扱い",
    summary: "文字起こし、発音評価、AI feedback は練習の目安です。公式な能力判定ではありません。",
    bullets: [
      "録音、transcript、score、weak words、coach feedback は復習と進捗表示に使います。",
      "OpenAI transcription、Azure pronunciation evaluation、AI coaching / feedback を使う場合があります。",
      "保存済みベスト録音は復習用で、別機能の音声素材として自動利用することはありません。"
    ]
  }
};

export function ConsentNotice({ kind, className = "" }: { kind: ConsentNoticeKind; className?: string }) {
  const copy = NOTICE_COPY[kind];

  return (
    <section className={`rounded-[1.5rem] border border-[var(--line-subtle)] bg-[var(--surface-notice)] p-4 text-sm leading-6 text-ink-700 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">{copy.eyebrow}</p>
          <h2 className="mt-1 text-base font-semibold text-ink-900">{copy.title}</h2>
          <p className="mt-2">{copy.summary}</p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-semibold text-ink-600">
          内容を確認
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-ink-600">詳しく見る</summary>
        <ul className="mt-3 space-y-2">
          {copy.bullets.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/privacy" className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2 text-ink-700">
            Privacy
          </Link>
          <Link href="/terms" className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2 text-ink-700">
            Terms
          </Link>
          <Link href="/support" className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2 text-ink-700">
            Support
          </Link>
          <Link href="/support/account-deletion" className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2 text-ink-700">
            Account deletion
          </Link>
        </div>
      </details>
    </section>
  );
}
