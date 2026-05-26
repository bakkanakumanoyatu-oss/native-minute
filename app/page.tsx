import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/auth";

function HomeActionCard({
  href,
  title,
  summary,
  primary = false,
  motif = "studio"
}: {
  href: string;
  title: string;
  summary: string;
  primary?: boolean;
  motif?: "studio" | "log";
}) {
  return (
    <Link
      href={href}
      className={`relative overflow-hidden rounded-[2rem] border p-6 transition hover:-translate-y-0.5 ${
        primary
          ? "border-[var(--line-dark)] bg-[linear-gradient(135deg,var(--studio-ink),var(--studio-ink-soft))] text-white shadow-[var(--shadow-studio-soft)] hover:shadow-[var(--shadow-studio-lift)]"
          : "border-[var(--line-inset)] bg-[linear-gradient(135deg,var(--surface-primary),var(--surface-secondary))] text-ink-900 hover:shadow-[0_18px_44px_rgba(45,38,31,0.1)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mb-5 flex h-8 items-end gap-1.5 ${motif === "log" ? "text-[var(--saved-accent)]" : "text-[var(--studio-accent)]"}`}
      >
        {[14, 24, 18, 30, 12].map((height, index) => (
          <span key={index} className="w-1.5 rounded-full bg-current opacity-80" style={{ height }} />
        ))}
      </span>
      <span className={`text-2xl font-semibold tracking-tight ${primary ? "text-white" : "text-ink-900"}`}>{title}</span>
      <span className={`mt-3 block text-sm leading-6 ${primary ? "text-white/80" : "text-ink-600"}`}>{summary}</span>
    </Link>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-[var(--line-dark)] bg-[radial-gradient(circle_at_20%_10%,rgba(200,121,63,0.22),transparent_34%),linear-gradient(135deg,#181722,#272a3d_62%,#34384d)] p-6 shadow-[var(--shadow-studio-soft)] sm:p-8 lg:p-10">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-white/80">Native Minute</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              今日の1分スタジオに入る。
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">
              お手本のリズムを耳に入れて、まず1テイクを残します。
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[var(--line-dark)] bg-[rgba(255,241,221,0.1)] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.16)] backdrop-blur">
            <div className="rounded-[1.25rem] border border-[rgba(255,241,221,0.18)] bg-[rgba(255,241,221,0.12)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">today</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-white">台本を選ぶ</p>
              <p className="mt-2 text-xs leading-5 text-white/70">5本までの1分ストックから、今日録る1本へ。</p>
            </div>
            <div aria-hidden="true" className="mt-4 flex h-10 items-end gap-1.5 text-[var(--studio-accent)]">
              {[18, 28, 14, 34, 22, 30].map((height, index) => (
                <span key={index} className="w-2 rounded-full bg-current" style={{ height }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HomeActionCard
          href={user ? "/scripts" : "/login"}
          title={user ? "1分を始める" : "ログインして始める"}
          summary={user ? "今日録る1本を選んで、リズムを聞いてから Take へ進みます。" : "ログインすると今日の1分を作れます。"}
          primary
        />
        <HomeActionCard
          href={user ? "/progress" : "/login"}
          title="声のログを見る"
          summary="ベストテイク、最新テイク、これまでの成果を確認します。"
          motif="log"
        />
      </div>

      {user ? (
        <div className="rounded-[2rem] border border-[var(--line-subtle)] bg-[var(--surface-secondary)] px-5 py-4 shadow-[0_14px_34px_rgba(45,38,31,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c5f37]">settings</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-ink-600">お手本ボイスを作る時だけ使います。</p>
            <Link href="/setup/voice" className="text-sm font-semibold text-[var(--studio-accent-strong)]">
              声の設定
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
