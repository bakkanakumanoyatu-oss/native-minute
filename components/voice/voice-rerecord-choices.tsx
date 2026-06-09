"use client";

import Link from "next/link";
import { useState } from "react";
import type { VoiceProviderRequirements } from "@/providers/voice";
import { CreateVoiceForm } from "./create-voice-form";

type RerecordChoice = "record" | "file" | null;

type VoiceRerecordChoicesProps = {
  nextPath: string;
  consentId: string;
  requirements: VoiceProviderRequirements;
};

function choiceButtonClass(isActive: boolean) {
  return [
    "rounded-2xl border px-4 py-4 text-left transition",
    isActive
      ? "border-[var(--accent-strong)] bg-[var(--surface-paper)] shadow-soft"
      : "border-[var(--line)] bg-white hover:bg-ink-50"
  ].join(" ");
}

export function VoiceRerecordChoices({ nextPath, consentId, requirements }: VoiceRerecordChoicesProps) {
  const [choice, setChoice] = useState<RerecordChoice>(null);

  return (
    <div data-testid="voice-rerecord-choices" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          data-testid="voice-use-current-link"
          href={nextPath}
          className="rounded-2xl border border-[var(--ink)] bg-[var(--ink)] px-4 py-4 text-left text-white shadow-soft transition hover:opacity-90"
        >
          <span className="block text-sm font-semibold">今のお手本ボイスを使う</span>
          <span className="mt-2 block text-xs leading-5 text-white/80">このまま練習へ進みます。</span>
        </Link>
        <button
          data-testid="voice-rerecord-record-button"
          type="button"
          aria-expanded={choice === "record"}
          aria-controls="voice-rerecord-record-panel"
          onClick={() => setChoice("record")}
          className={choiceButtonClass(choice === "record")}
        >
          <span className="block text-sm font-semibold text-ink-900">新しく録音して作り直す</span>
          <span className="mt-2 block text-xs leading-5 text-ink-600">録り方を変えて、もう一度作れます。</span>
        </button>
        <button
          data-testid="voice-rerecord-file-button"
          type="button"
          aria-expanded={choice === "file"}
          aria-controls="voice-rerecord-file-panel"
          onClick={() => setChoice("file")}
          className={choiceButtonClass(choice === "file")}
        >
          <span className="block text-sm font-semibold text-ink-900">録音済みファイルから作り直す</span>
          <span className="mt-2 block text-xs leading-5 text-ink-600">別で録った音声を使えます。</span>
        </button>
      </div>

      {choice ? null : (
        <p data-testid="voice-rerecord-choice-hint" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-600">
          今の声がしっくりこない場合は、録り直しや録音済みファイルから新しいお手本ボイスを作れます。
        </p>
      )}

      {choice === "record" ? (
        <section
          id="voice-rerecord-record-panel"
          data-testid="voice-rerecord-section"
          className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm"
        >
          <h3 className="text-base font-semibold text-ink-900">新しく録音して作り直す</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            古い声はここでは削除せず、新しく作った声が次のお手本に使われます。
          </p>
          <div className="mt-5">
            <CreateVoiceForm consentId={consentId} requirements={requirements} mode="rerecord" inputMode="record" />
          </div>
        </section>
      ) : null}

      {choice === "file" ? (
        <section
          id="voice-rerecord-file-panel"
          data-testid="voice-rerecord-file-section"
          className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm"
        >
          <h3 className="text-base font-semibold text-ink-900">録音済みファイルから作り直す</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            古い声はここでは削除せず、新しく作った声が次のお手本に使われます。
          </p>
          <div className="mt-5">
            <CreateVoiceForm consentId={consentId} requirements={requirements} mode="rerecord" inputMode="file" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
