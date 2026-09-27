import Link from "next/link";
import { filterGalleryItems, gallery } from "@/lib/gallery/public";
import { GALLERY_SOURCE_TYPES } from "@/lib/gallery/schema";

export default function GalleryPage({ searchParams }: { searchParams?: { q?: string; source?: string; theme?: string } }) {
  const query = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 120) : "";
  const source = typeof searchParams?.source === "string" && GALLERY_SOURCE_TYPES.some(value => value === searchParams.source) ? searchParams.source : "";
  const theme = typeof searchParams?.theme === "string" && gallery.themes.includes(searchParams.theme) ? searchParams.theme : "";
  const items = filterGalleryItems({ query, sourceType: source, theme });
  return <section className="space-y-6" lang="ja">
    <header className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8">
      <p className="text-sm font-semibold text-[var(--studio-accent-strong)]">Gallery</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink-900">話したい言葉を探す</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-700">誰が、どこで、なぜその言葉を使ったのか。気になる場面から、自分の1分を見つけます。</p>
    </header>
    <form className="grid gap-3 rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4 sm:grid-cols-3" action="/gallery">
      <label className="text-sm text-ink-700">検索<input name="q" defaultValue={query} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3" placeholder="作品・話者・場面" /></label>
      <label className="text-sm text-ink-700">Source<select name="source" defaultValue={source} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3"><option value="">すべて</option>{GALLERY_SOURCE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm text-ink-700">Theme<select name="theme" defaultValue={theme} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3"><option value="">すべて</option>{gallery.themes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="rounded-xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)] sm:col-span-3" type="submit">探す</button>
    </form>
    {items.length ? <ul className="grid gap-4 sm:grid-cols-2">{items.map(item => <li key={item.id} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5">
      <p className="text-xs font-semibold text-ink-600">{item.sourceType} · {item.themes.join(" / ")}</p>
      <h2 className="mt-2 break-words text-xl font-semibold text-ink-900">{item.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{item.workTitle} · {item.speaker}</p>
      <p className="mt-3 text-sm leading-6 text-ink-700">{item.moment}</p>
      <Link className="mt-4 inline-flex rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold text-ink-800" href={`/gallery/${item.id}`}>{item.publicationMode === "PRACTICE" ? "場面を見て練習する" : "場面と原典を見る"}</Link>
    </li>)}</ul> : <p role="status" className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5 text-sm text-ink-700">{gallery.items.length ? "条件に合う場面はありません。" : "公開できる場面を準備中です。"}</p>}
    <section className="rounded-2xl border border-[var(--line-inset)] bg-[var(--coach-note)] p-5">
      <h2 className="text-lg font-semibold text-ink-900">自分で見つける / Your Story</h2>
      <p className="mt-2 text-sm leading-6 text-ink-700">話したい言葉を自分で探す。あるいは、実際にあった自分の体験を英文にしてみる。</p>
      <Link className="mt-4 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href="/scripts/new">見つけた英文で台本を作る</Link>
    </section>
  </section>;
}
