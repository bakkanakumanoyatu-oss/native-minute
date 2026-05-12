import Link from "next/link";
import type { ReactNode } from "react";

export function BetaDraftNotice() {
  return (
    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">Web beta draft</p>
      <p className="mt-1">
        このページは Native Minute v1 Web beta / small cohort 用のドラフトです。正式公開、App Store / Google Play 提出、法務レビュー前に最終確認が必要です。
      </p>
    </div>
  );
}

export function LegalPageShell({
  eyebrow,
  title,
  summary,
  children
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <section className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">{summary}</p>
      </section>

      <BetaDraftNotice />

      {children}

      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Related links</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/privacy" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-800">
            Privacy
          </Link>
          <Link href="/terms" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-800">
            Terms
          </Link>
          <Link href="/support" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-800">
            Support
          </Link>
          <Link href="/support/account-deletion" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-800">
            Account deletion
          </Link>
        </div>
      </section>
    </section>
  );
}

export function LegalSection({
  title,
  summary,
  items
}: {
  title: string;
  summary?: string;
  items?: string[];
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-2xl font-semibold text-ink-950">{title}</h2>
      {summary ? <p className="mt-3 text-sm leading-6 text-ink-600">{summary}</p> : null}
      {items ? (
        <ul className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
