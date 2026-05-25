import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/auth";

function HomeActionCard({
  href,
  title,
  summary,
  primary = false
}: {
  href: string;
  title: string;
  summary: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[2rem] border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${
        primary
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-white text-ink-900"
      }`}
    >
      <span className={`text-2xl font-semibold tracking-tight ${primary ? "text-white" : "text-ink-900"}`}>{title}</span>
      <span className={`mt-3 block text-sm leading-6 ${primary ? "text-white/85" : "text-ink-600"}`}>{summary}</span>
    </Link>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.16),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,248,246,0.92))] p-6 shadow-soft sm:p-8 lg:p-10">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">Native Minute</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          1分英語を、お手本で聞いて、自分で録って、成果を見る。
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HomeActionCard
          href={user ? "/scripts" : "/login"}
          title={user ? "Practice へ進む" : "ログインして始める"}
          summary={user ? "5本までの練習ストックから、今日やる1本を選びます。" : "ログインすると練習ストックを作れます。"}
          primary
        />
        <HomeActionCard
          href={user ? "/progress" : "/login"}
          title="Progress を見る"
          summary="ベスト録音、最新結果、保存済みの成果を確認します。"
        />
      </div>

      {user ? (
        <div className="rounded-[2rem] border border-[var(--line)] bg-white px-5 py-4 shadow-sm">
          <Link href="/setup/voice" className="text-sm font-semibold text-[var(--accent-strong)]">
            声の設定
          </Link>
          <p className="mt-1 text-sm leading-6 text-ink-600">お手本ボイスを作る時だけ使います。</p>
        </div>
      ) : null}
    </section>
  );
}
