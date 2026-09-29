import Link from "next/link";
import { filterGalleryItems, gallery, getGalleryFilterOptions } from "@/lib/gallery/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { listPersonalGallery } from "@/services/gallery/personal-gallery.service";
import type { PersonalGallerySummary } from "@/lib/gallery/personal-types";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
type Params = { scope?: string; q?: string; source?: string; theme?: string; sort?: string; offset?: string };
function galleryHref(params: Params, patch: Params = {}) {
  const merged = { ...params, ...patch }; const query = new URLSearchParams();
  for (const key of ["scope", "q", "source", "theme", "sort", "offset"] as const) if (merged[key]) query.set(key, merged[key]!);
  return `/gallery${query.size ? `?${query}` : ""}`;
}

export default async function GalleryPage({ searchParams = {} }: { searchParams?: Params }) {
  const user = await getCurrentUser();
  const personalReady = personalGalleryEnabled();
  const scope = searchParams.scope === "examples" || !user || !personalReady ? "examples" : "mine";
  const q = typeof searchParams.q === "string" ? searchParams.q.slice(0, 120) : "";
  const source = typeof searchParams.source === "string" ? searchParams.source.slice(0, 80) : "";
  const theme = typeof searchParams.theme === "string" ? searchParams.theme.slice(0, 240) : "";
  const sort = searchParams.sort === "work" ? "work" : "recent";
  const offset = Math.max(0, Math.min(10000, Number.parseInt(searchParams.offset ?? "0", 10) || 0));
  const current = { scope, q, source, theme, sort, offset: String(offset) };
  const filters = getGalleryFilterOptions();
  const examples = filterGalleryItems({ query: q, sourceType: source, theme });
  let personal: { items: PersonalGallerySummary[]; nextOffset: number | null } | null = null;
  let personalError = false;
  if (user && scope === "mine") {
    try { personal = await listPersonalGallery(createSupabaseServerClient(), user.id, { query: q, sourceType: source, theme, sort, offset, limit: 30 }); }
    catch { personalError = true; }
  }
  const empty = scope === "mine" && !q && !source && !theme && offset === 0 && personal?.items.length === 0;
  return <section className="space-y-6" lang="ja">
    <header className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8">
      <p className="text-sm font-semibold text-[var(--studio-accent-strong)]">Gallery</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink-900">{personalReady ? "話してみたい場面・言葉を集める" : "話したい言葉を探す"}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-700">{personalReady ? "気になる場面を保存して、英文は後から追加できます。" : "誰が、どこで、なぜその言葉を使ったのか。気になる場面から、自分の1分を見つけます。"}</p>
      {user && personalReady ? <Link className="mt-5 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href="/gallery/new">＋ 場面を追加</Link> : null}
    </header>
    <nav aria-label="Gallery の範囲" className="flex flex-wrap gap-2">
      {personalReady ? user ? <Link aria-current={scope === "mine" ? "page" : undefined} className="rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" href={galleryHref(current, { scope: "mine", offset: "0" })}>自分のコレクション</Link> : <Link className="rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" href="/login?next=%2Fgallery">自分のコレクションにログイン</Link> : null}
      <Link aria-current={scope === "examples" ? "page" : undefined} className="rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" href={galleryHref(current, { scope: "examples", offset: "0" })}>集め方の見本</Link>
    </nav>
    <form className="grid gap-3 rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4 sm:grid-cols-4" action="/gallery">
      <input type="hidden" name="scope" value={scope} />
      <label className="text-sm text-ink-700 sm:col-span-4">{scope === "mine" ? "自分のコレクションを検索" : "集め方の見本を検索"}<input name="q" defaultValue={q} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3" placeholder="作品・場面・人物・言葉" /></label>
      <label className="text-sm text-ink-700">Source{scope === "mine" ? <input name="source" defaultValue={source} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3" placeholder="種類" /> : <select name="source" defaultValue={source} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3"><option value="">すべて</option>{filters.sources.map(value => <option key={value}>{value}</option>)}</select>}</label>
      <label className="text-sm text-ink-700">Theme{scope === "mine" ? <input name="theme" defaultValue={theme} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3" placeholder="テーマ" /> : <select name="theme" defaultValue={theme} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3"><option value="">すべて</option>{filters.themes.map(value => <option key={value}>{value}</option>)}</select>}</label>
      {scope === "mine" ? <label className="text-sm text-ink-700">並び順<select name="sort" defaultValue={sort} className="mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3"><option value="recent">最近保存した順</option><option value="work">作品名順</option></select></label> : null}
      <button className="rounded-xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" type="submit">探す</button>
    </form>
    {scope === "mine" ? personalError ? <p role="alert">コレクションを読み込めませんでした。もう一度開いてください。</p> : empty ? <section className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6"><h2 className="text-xl font-semibold">最初の場面を集めましょう</h2><p className="mt-2 text-sm">英文なしでも保存できます。</p><Link className="mt-4 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href="/gallery/new">＋ 場面を追加</Link><h3 className="mt-8 font-semibold">集め方の見本</h3><ul className="mt-3 grid gap-3 sm:grid-cols-3">{gallery.items.slice(0, 3).map(item => <li key={item.id}><Link className="block rounded-xl border border-[var(--line-inset)] p-4" href={`/gallery/${item.id}`}>{item.workTitle}<strong className="mt-1 block">{item.title}</strong></Link></li>)}</ul><Link className="mt-4 inline-flex text-sm underline" href="/gallery?scope=examples">見本を全部見る</Link></section> : personal?.items.length ? <><ul className="grid gap-4 sm:grid-cols-2">{personal.items.map(item => <li key={item.id} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5"><p className="break-words text-sm text-ink-600">{item.workTitle || item.sourceType || "自分の場面"}</p><h2 className="mt-2 break-words text-xl font-semibold">{item.sceneTitle}</h2>{item.speaker ? <p className="mt-1 text-sm">{item.speaker}</p> : null}{item.shortNote ? <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6">{item.shortNote}</p> : null}<Link className="mt-4 inline-flex rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" href={`/gallery/mine/${item.id}?return=${encodeURIComponent(galleryHref(current))}`}>場面を開く</Link></li>)}</ul><nav className="flex gap-3">{offset > 0 ? <Link className="rounded-xl border px-4 py-3" href={galleryHref(current, { offset: String(Math.max(0, offset - 30)) })}>前へ</Link> : null}{personal.nextOffset !== null ? <Link className="rounded-xl border px-4 py-3" href={galleryHref(current, { offset: String(personal.nextOffset) })}>次へ</Link> : null}</nav></> : <p role="status" className="rounded-2xl border p-5">条件に合う場面はありません。検索条件を変えるか、集め方の見本も探せます。</p> : examples.length ? <ul className="grid gap-4 sm:grid-cols-2">{examples.map(item => <li key={item.id} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5"><p className="text-xs font-semibold text-ink-600">{item.sourceType} · {item.themes.join(" / ")}</p><h2 className="mt-2 break-words text-xl font-semibold text-ink-900">{item.title}</h2><p className="mt-1 text-sm text-ink-600">{item.workTitle} · {item.speaker}</p><p className="mt-3 text-sm leading-6 text-ink-700">{item.moment}</p><Link className="mt-4 inline-flex rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" href={`/gallery/${item.id}?return=${encodeURIComponent(galleryHref(current))}`}>場面を見る</Link></li>)}</ul> : <p role="status">条件に合う見本はありません。</p>}
  </section>;
}
