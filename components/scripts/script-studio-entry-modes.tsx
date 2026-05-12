"use client";

import type { ScriptStudioTemplate } from "@/lib/script-studio/templates";
import { SCRIPT_STUDIO_TEMPLATES } from "@/lib/script-studio/templates";

export type ScriptStudioEntryMode = "template" | "freewriting" | "ai" | "guide";

type ScriptStudioEntryModesProps = {
  activeMode: ScriptStudioEntryMode;
  onModeChange: (mode: ScriptStudioEntryMode) => void;
  onUseTemplate: (template: ScriptStudioTemplate) => void;
};

const ENTRY_MODES: Array<{
  id: ScriptStudioEntryMode;
  title: string;
  label: string;
  summary: string;
}> = [
  {
    id: "template",
    title: "テンプレから選ぶ",
    label: "Template",
    summary: "短い自作テンプレをコピーし、自分用に直して保存します。"
  },
  {
    id: "freewriting",
    title: "フリーライティング",
    label: "Paste",
    summary: "自分の英文や原稿を貼り、1分で話しやすい形に整えます。"
  },
  {
    id: "ai",
    title: "AI自動生成",
    label: "AI draft",
    summary: "言いたいことから編集前提の候補を作ります。完成品ではありません。"
  },
  {
    id: "guide",
    title: "文章ガイド",
    label: "Guide",
    summary: "Native Minute に向く、1分で話しやすい文章の条件を確認します。"
  }
];

export function ScriptStudioEntryModes({ activeMode, onModeChange, onUseTemplate }: ScriptStudioEntryModesProps) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white px-4 py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">Add practice</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">練習の作り方を選ぶ</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">まず入口を選びます。どの入口でも、最後は下のフォームで自分の言葉に直して保存します。</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {ENTRY_MODES.map((mode) => {
          const isActive = activeMode === mode.id;

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange(mode.id)}
              className={`rounded-2xl border px-4 py-4 text-left text-sm transition ${
                isActive
                  ? "border-[var(--accent)] bg-ink-50 shadow-sm"
                  : "border-[var(--line)] bg-white hover:bg-ink-50"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">{mode.label}</span>
              <span className="mt-2 block font-semibold text-ink-900">{mode.title}</span>
              <span className="mt-2 block text-xs leading-5 text-ink-600">{mode.summary}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {activeMode === "template" ? <TemplateEntry onUseTemplate={onUseTemplate} /> : null}
        {activeMode === "freewriting" ? <FreewritingEntry /> : null}
        {activeMode === "guide" ? <WritingGuideEntry /> : null}
        {activeMode === "ai" ? (
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="font-semibold text-ink-900">下の AI draft を使います（編集前提）。</p>
            <p className="mt-1">
              候補をフォームへコピーし、短い文に区切ったり自分が言いそうな表現へ直してから保存します。映画のセリフや有名スピーチ本文は内蔵しません。
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TemplateEntry({ onUseTemplate }: { onUseTemplate: (template: ScriptStudioTemplate) => void }) {
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
        <p className="font-semibold text-ink-900">安全な自作テンプレだけを入れています。</p>
        <p className="mt-1">映画のセリフや近年の有名スピーチ本文は入れず、下のフォームで自由に編集します。</p>
      </div>
      <div className="grid gap-3">
        {SCRIPT_STUDIO_TEMPLATES.map((template) => (
          <article key={template.id} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{template.categoryLabelJa}</p>
                <h3 className="mt-2 text-base font-semibold text-ink-900">{template.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{template.summaryJa}</p>
              </div>
              <button
                type="button"
                onClick={() => onUseTemplate(template)}
                className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
              >
                フォームへコピー
              </button>
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-700">{template.content}</p>
            <p className="mt-3 text-xs leading-5 text-ink-500">
              {template.situationLabelJa} / {template.targetSeconds}秒 / focus: {template.focusWords.join(", ")}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function FreewritingEntry() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
      <p className="font-semibold text-ink-900">下のフォームに直接書く、または貼り付けます。</p>
      <p className="mt-1">
        すでに原稿がある場合は、まず貼ってから word count / chunk / 長い文を見ます。長い1文は comma や period で分けます。
      </p>
    </div>
  );
}

function WritingGuideEntry() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
      <p className="font-semibold text-ink-900">Native Minute 向きの文章</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-600">
        <li>1分で言える長さにし、1文を詰め込みすぎない。</li>
        <li>意味の塊ごとに息継ぎできる punctuation を入れる。</li>
        <li>focus words は 1〜3 個に絞る。</li>
        <li>速さより、語尾まで言い切れる文にする。</li>
        <li>引用文をそのまま使うより、自分の状況に置き換える。</li>
      </ul>
    </div>
  );
}
