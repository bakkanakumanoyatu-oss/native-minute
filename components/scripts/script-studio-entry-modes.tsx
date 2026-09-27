"use client";

import Link from "next/link";

export type ScriptStudioEntryMode = "freewriting" | "ai";

type Props = {
  activeMode: ScriptStudioEntryMode | null;
  onModeChange: (mode: ScriptStudioEntryMode) => void;
  aiScriptGenerationEnabled: boolean;
};

export function ScriptStudioEntryModes({ activeMode, onModeChange, aiScriptGenerationEnabled }: Props) {
  return <section className="rounded-[1.75rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] px-4 py-5 shadow-[var(--shadow-studio-soft)]">
    <p className="text-xs font-semibold text-[var(--studio-accent-strong)]">用意する方法</p>
    <h2 className="mt-2 text-xl font-semibold text-ink-900">話したい言葉を選ぶ</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Link href="/gallery" className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-4 text-left text-sm text-ink-800 hover:bg-[var(--surface-inset-strong)]">
        <span className="block font-semibold text-ink-900">Galleryで探す</span>
        <span className="mt-2 block text-xs leading-5 text-ink-600">誰が、どんな場面で語ったかを知る</span>
      </Link>
      <button type="button" onClick={() => onModeChange("freewriting")} aria-pressed={activeMode === "freewriting"} className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-4 text-left text-sm text-ink-800 hover:bg-[var(--surface-inset-strong)]">
        <span className="block font-semibold text-ink-900">自分で書く</span>
        <span className="mt-2 block text-xs leading-5 text-ink-600">見つけた英文や自分の体験を台本にする</span>
      </button>
      {aiScriptGenerationEnabled ? <button type="button" onClick={() => onModeChange("ai")} aria-pressed={activeMode === "ai"} className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-4 text-left text-sm text-ink-800 hover:bg-[var(--surface-inset-strong)]">AI下書き</button> : null}
    </div>
  </section>;
}
