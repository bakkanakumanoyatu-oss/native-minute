import Link from "next/link";
import { notFound } from "next/navigation";
import { gallery, getGalleryItem } from "@/lib/gallery/public";

export function generateStaticParams() { return gallery.items.map(item => ({ id: item.id })); }

export default function GalleryDetailPage({ params }: { params: { id: string } }) {
  const item = getGalleryItem(params.id);
  if (!item) notFound();
  return <article lang="ja" className="mx-auto max-w-3xl space-y-6 rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8">
    <Link href="/gallery" className="text-sm font-semibold text-ink-700">← Galleryへ</Link>
    <header><p className="text-sm text-ink-600">{item.sourceType} · {item.themes.join(" / ")}</p><h1 className="mt-2 break-words text-3xl font-semibold text-ink-900">{item.title}</h1><p className="mt-2 text-sm text-ink-600">{item.workTitle} · {item.speaker}</p></header>
    <section><h2 className="text-xl font-semibold">What was happening?</h2><p className="mt-2 text-sm leading-7">{item.moment}</p><p className="mt-2 text-sm leading-7">{item.contextJa}</p></section>
    <section><h2 className="text-xl font-semibold">Why this moment matters</h2><p className="mt-2 text-sm leading-7">{item.whyItMattersJa}</p></section>
    {item.publicationMode === "PRACTICE" ? <section><h2 className="text-xl font-semibold">The words</h2><p lang={item.locale} className="mt-3 whitespace-pre-wrap rounded-2xl bg-[var(--script-paper)] p-4 text-base leading-8">{item.practiceTextEn}</p>{item.translationJa ? <p className="mt-3 text-sm leading-7">{item.translationJa}</p> : null}</section> : null}
    <section><h2 className="text-xl font-semibold">Listen for</h2><ul className="mt-2 list-inside list-disc text-sm leading-7">{item.speakingNotes.map(note => <li key={note}>{note}</li>)}</ul></section>
    <section><h2 className="text-xl font-semibold">Try it yourself</h2><p className="mt-2 text-sm leading-7">{item.publicationMode === "PRACTICE" ? "この一節を自分の台本として保存してから練習します。現在の自分のお手本の声を使います。" : "原典を探し、使用できる英文を自分で確かめてから台本にしてください。自動取り込みは行いません。"}</p><Link className="mt-4 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href={item.publicationMode === "PRACTICE" ? `/scripts/new?gallery=${encodeURIComponent(item.id)}` : "/scripts/new"}>{item.publicationMode === "PRACTICE" ? "この一節で練習する" : "自分の台本を作る"}</Link></section>
    <section><h2 className="text-xl font-semibold">Original source</h2>{item.primarySourceUrl ? <a className="mt-2 inline-block break-all text-sm underline" href={item.primarySourceUrl} target="_blank" rel="noopener noreferrer">原典を開く</a> : <p className="mt-2 text-sm">出典の場所: {item.canonicalSourceLocator}</p>}</section>
    <section><h2 className="text-xl font-semibold">Source & Credits</h2><p className="mt-2 text-sm leading-7">{item.workTitle} · {item.speaker}{item.year ? ` · ${item.year}` : ""}</p><p className="text-sm leading-7">{item.sourceKind} · {item.canonicalSourceLocator}</p></section>
    {item.moreLikeThis.length ? <section><h2 className="text-xl font-semibold">More like this</h2><ul className="mt-2 space-y-2">{item.moreLikeThis.map(id => { const related = getGalleryItem(id); return related ? <li key={id}><Link className="text-sm underline" href={`/gallery/${id}`}>{related.title}</Link></li> : null; })}</ul></section> : null}
  </article>;
}
