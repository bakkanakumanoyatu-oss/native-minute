"use client";

import { useState } from "react";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? "ログアウトできませんでした。少し待ってからもう一度お試しください。");
        return;
      }

      window.location.assign("/login?next=%2Fscripts");
    } catch {
      setMessage("通信に失敗しました。少し待ってからもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "ログアウト中..." : "ログアウト"}
      </button>
      {message ? <p className="text-sm leading-6 text-ink-600">{message}</p> : null}
    </div>
  );
}
