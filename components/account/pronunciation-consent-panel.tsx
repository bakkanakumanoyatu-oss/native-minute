"use client";

import { useState } from "react";

type PronunciationConsentStatus = "accepted" | "required" | "withdrawn";

export function PronunciationConsentPanel({ initialStatus }: { initialStatus: PronunciationConsentStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function withdraw() {
    setIsWithdrawing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/consents/pronunciation_processing", {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: { consent?: { status?: string } };
      } | null;
      const nextStatus = payload?.data?.consent?.status;

      if (!response.ok || !payload?.ok || nextStatus !== "withdrawn") {
        setMessage(payload?.message ?? "同意を撤回できませんでした。少し待ってから再試行してください。");
        return;
      }

      setStatus("withdrawn");
      setMessage("同意を撤回しました。以後の新しい録音アップロード、文字起こし、発音評価は停止します。");
    } catch {
      setMessage("通信に失敗しました。少し待ってから再試行してください。");
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Recording consent</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-950">録音と発音評価への同意</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
        同意を撤回すると、新しい録音アップロード、OpenAI による文字起こし、Azure による発音評価を停止します。保存済みの Take、結果、進捗は削除されません。
      </p>
      <p className="mt-3 text-sm font-semibold text-ink-800">現在の状態: {status === "accepted" ? "同意済み" : status === "withdrawn" ? "撤回済み" : "未同意"}</p>
      {status === "accepted" ? (
        <button
          type="button"
          onClick={() => void withdraw()}
          disabled={isWithdrawing}
          className="mt-5 inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWithdrawing ? "撤回中..." : "録音と発音評価への同意を撤回する"}
        </button>
      ) : (
        <p className="mt-5 text-sm leading-6 text-ink-600">録音を再開する場合は、Record 画面で改めて同意できます。</p>
      )}
      {message ? <p role="status" className="mt-4 text-sm leading-6 text-ink-700">{message}</p> : null}
    </section>
  );
}
