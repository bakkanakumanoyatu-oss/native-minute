"use client";

import { useRef, useState } from "react";

export function LoginForm({ nextPath }: { nextPath?: string | null }) {
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const [hasEmail, setHasEmail] = useState(false);
  const returnPath = nextPath ?? "/scripts";
  const signInAction = nextPath ? `/api/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/api/auth/sign-in";

  function syncHasEmail(value: string) {
    const nextHasEmail = value.trim().length > 0;
    setHasEmail((current) => (current === nextHasEmail ? current : nextHasEmail));
  }

  return (
    <form action={signInAction} method="post" encType="application/x-www-form-urlencoded" className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">メールアドレス</span>
        <input
          ref={emailInputRef}
          onInput={(event) => syncHasEmail(event.currentTarget.value)}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          name="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      {hasEmail ? (
        <button
          type="button"
          onClick={() => {
            if (emailInputRef.current) {
              emailInputRef.current.value = "";
              emailInputRef.current.focus();
            }
            setHasEmail(false);
          }}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          メールアドレスをクリア
        </button>
      ) : null}

      <button
        type="submit"
        formAction={signInAction}
        formMethod="post"
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
      >
        ログイン用リンクを送る
      </button>

      <p className="text-xs leading-5 text-ink-500">メールリンクを開くと {returnPath} に戻ります。</p>
    </form>
  );
}
