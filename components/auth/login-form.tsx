"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export function LoginForm({ nextPath }: { nextPath?: string | null }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmedEmail = email.trim();
  const returnPath = nextPath ?? "/scripts";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(nextPath ? `/api/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/api/auth/sign-in", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: trimmedEmail })
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage({ tone: "error", text: payload.message ?? "ログイン用メールの送信に失敗しました。" });
        return;
      }

      setMessage({
        tone: "success",
        text: `ログインリンクを送信しました。メールを確認してください。メールリンクを開くと ${returnPath} に戻ります。`
      });
    } catch {
      setMessage({ tone: "error", text: "通信に失敗しました。少し待ってからもう一度お試しください。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">メールアドレス</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      {email ? (
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setMessage(null);
          }}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          メールアドレスをクリア
        </button>
      ) : null}

      <button
        type="submit"
        disabled={loading || trimmedEmail.length === 0}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "送信中..." : "ログイン用リンクを送る"}
      </button>

      {message ? (
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          メッセージを閉じる
        </button>
      ) : null}

      {message ? (
        <p
          role="status"
          className={
            message.tone === "success"
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"
              : "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
