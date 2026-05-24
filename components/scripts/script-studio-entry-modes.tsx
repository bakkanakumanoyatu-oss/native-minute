"use client";

import { useState } from "react";
import type { ScriptStudioTemplate } from "@/lib/script-studio/templates";
import { SCRIPT_STUDIO_TEMPLATES } from "@/lib/script-studio/templates";

export type ScriptStudioEntryMode = "template" | "freewriting" | "ai";

type ScriptStudioEntryModesProps = {
  activeMode: ScriptStudioEntryMode | null;
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
    title: "テンプレートから選ぶ",
    label: "すぐ作る",
    summary: "型を選んで、自分用に直します。"
  },
  {
    id: "freewriting",
    title: "自分で書く",
    label: "自由入力",
    summary: "英文を直接入れて保存します。"
  },
  {
    id: "ai",
    title: "AIに作ってもらう",
    label: "下書き",
    summary: "短いメモから英文を作ります。"
  }
];

export function ScriptStudioEntryModes({ activeMode, onModeChange, onUseTemplate }: ScriptStudioEntryModesProps) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white px-4 py-5">
      <div>
        <p className="text-xs font-semibold text-[var(--accent-strong)]">3択</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">練習の作り方を選ぶ</h2>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
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

      {activeMode ? (
      <div className="mt-5">
        {activeMode === "template" ? <TemplateEntry onUseTemplate={onUseTemplate} /> : null}
        {activeMode === "freewriting" ? <FreewritingEntry /> : null}
        {activeMode === "ai" ? (
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="font-semibold text-ink-900">AIに1分スクリプトを書かせる</p>
          </div>
        ) : null}
      </div>
      ) : null}
    </section>
  );
}

function TemplateEntry({ onUseTemplate }: { onUseTemplate: (template: ScriptStudioTemplate) => void }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {SCRIPT_STUDIO_TEMPLATES.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          const firstLine = getTemplateFirstLine(template.content);
          const firstTranslationLine = getTemplateFirstLine(template.translationJa, 82);

          return (
          <article key={template.id} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{template.categoryLabelJa}</p>
                <h3 className="mt-2 text-base font-semibold text-ink-900">{template.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{firstLine}</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">{firstTranslationLine}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  onUseTemplate(template);
                }}
                className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
              >
                使ってみる
              </button>
            </div>
            {isSelected ? (
              <details open className="mt-3 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-700">選んだテンプレの中身</summary>
                <div className="mt-3 grid gap-3">
                  <div>
                    <p className="text-xs font-semibold text-ink-500">英文</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{template.content}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-500">日本語訳</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{template.translationJa}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-ink-500">
                  {template.situationLabelJa} / {template.targetSeconds}秒
                </p>
              </details>
            ) : null}
          </article>
          );
        })}
      </div>
    </div>
  );
}

function FreewritingEntry() {
  return null;
}

function getTemplateFirstLine(content: string, maxLength = 110) {
  const compact = content.replace(/\s+/g, " ").trim();
  const sentenceEnd = compact.search(/[.!?。！？]/);
  const firstLine = sentenceEnd >= 0 ? compact.slice(0, sentenceEnd + 1) : compact;

  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength)}...` : firstLine;
}
