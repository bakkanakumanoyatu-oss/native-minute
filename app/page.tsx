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
      className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${
        primary
          ? "border-[var(--studio-ink)] bg-[var(--studio-ink)] text-white"
          : "border-[var(--studio-line)] bg-[linear-gradient(135deg,var(--studio-panel),var(--studio-surface))] text-ink-900"
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
      <div className="relative overflow-hidden rounded-[2rem] border border-[rgba(45,38,31,0.18)] bg-[linear-gradient(135deg,#181722,#2b2d44_62%,#3b4058)] p-6 shadow-soft sm:p-8 lg:p-10">
        <div className="absolute bottom-6 right-6 hidden w-44 rounded-[1.5rem] border border-white/20 bg-[rgba(255,250,243,0.84)] p-4 shadow-sm sm:block">
          <div aria-hidden="true" className="flex h-10 items-end gap-1.5 text-[var(--studio-accent)]">
            {[18, 28, 14, 34, 22, 30].map((height, index) => (
              <span key={index} className="w-2 rounded-full bg-current" style={{ height }} />
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-[var(--studio-muted)]">1 minute voice studio</p>
        </div>
        <p className="text-sm font-semibold text-white/80">Native Minute</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          1分英語を、お手本で聞いて、自分で録って、成果を見る。
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HomeActionCard
          href={user ? "/scripts" : "/login"}
          title={user ? "今日の1分スタジオへ" : "ログインして始める"}
          summary={user ? "5本までの1分ストックから、今日の Take を録る1本を選びます。" : "ログインすると今日の1分を作れます。"}
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
        <div className="rounded-[2rem] border border-[var(--studio-line)] bg-[var(--studio-panel)] px-5 py-4 shadow-sm">
          <Link href="/setup/voice" className="text-sm font-semibold text-[var(--studio-accent-strong)]">
            声の設定
          </Link>
          <p className="mt-1 text-sm leading-6 text-ink-600">お手本ボイスを作る時だけ使います。</p>
        </div>
      ) : null}
    </section>
  );
}
