"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteScriptButton({ scriptId, scriptTitle }: { scriptId: string; scriptTitle: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/scripts/${scriptId}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "削除に失敗しました。");
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。少し待ってから再試行してください。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setMessage(null);
          }}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-[var(--surface-inset-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          削除
        </button>
      ) : (
        <div className="space-y-2 rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-notice)] p-3">
          <p className="text-xs leading-5 text-amber-900">
            「{scriptTitle}」を削除すると、関連する保存済み結果とお手本ボイスもまとめて消えます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--record-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--record-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "削除中..." : "削除を確定"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setMessage(null);
              }}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-[var(--surface-inset-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
      {message ? <p className="text-xs text-ink-600">{message}</p> : null}
    </div>
  );
}
