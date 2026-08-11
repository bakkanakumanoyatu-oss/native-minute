import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Native Minute",
  description: "Native Minute mobile sign-in recovery guidance",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default function MobileAuthRecoveryPage() {
  return (
    <section className="mx-auto max-w-2xl rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-studio-soft)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">
        Native Minute sign-in
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-950">
        アプリで新しいログインリンクを開いてください
      </h1>
      <p className="mt-4 text-sm leading-7 text-ink-700">
        このブラウザ画面ではログインを完了せず、セッションも作成しません。
      </p>

      <ol className="mt-6 space-y-3 rounded-[1.5rem] border border-[var(--line-subtle)] bg-ink-50 p-5 text-sm leading-7 text-ink-800">
        <li>1. Native Minute をインストールして、アプリを開きます。</li>
        <li>2. アプリのログイン画面から、新しい Magic Link を送信します。</li>
        <li>3. 新しく届いたリンクを1回だけタップします。</li>
      </ol>

      <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
        いまブラウザで開いたリンクは再利用しないでください。
      </p>
    </section>
  );
}
