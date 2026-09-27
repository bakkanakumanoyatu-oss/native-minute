import { Browser } from "@capacitor/browser";
import { useEffect, useRef, useState } from "react";
import { filterGalleryItems, gallery } from "../../../../lib/gallery/public";
import { GALLERY_SOURCE_TYPES, type PublicGallery } from "../../../../lib/gallery/schema";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { MobileGalleryPracticeRequestState } from "../lib/api";
import type { PracticeRoute } from "../practice/routes";
import { RequestError, ScreenHeading } from "./ScreenParts";

type Props = {
  api: PracticeApi;
  isOnline: boolean;
  itemId?: string;
  catalog?: PublicGallery;
  onNavigate: (route: PracticeRoute) => void;
};

export function GalleryScreen({ api, isOnline, itemId, catalog = gallery, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [theme, setTheme] = useState("");
  const [savingState, setSavingState] = useState<{ itemId: string; generation: number } | null>(null);
  const [error, setError] = useState<{ itemId: string; failure: PracticeRequestFailure } | null>(null);
  const [practiceState, setPracticeState] = useState<{ itemId: string; result: MobileGalleryPracticeRequestState } | null>(null);
  const [sourceError, setSourceError] = useState(false);
  const fetchGeneration = useRef(0);
  const createGeneration = useRef(0);
  const item = itemId ? catalog.items.find(entry => entry.id === itemId) : undefined;
  const items = filterGalleryItems({ query, sourceType: source, theme }, catalog);
  useEffect(() => {
    const generation = ++fetchGeneration.current;
    const controller = new AbortController();
    if (item?.publicationMode === "PRACTICE" && isOnline) {
      void api.getGalleryPractice(item.id, controller.signal).then(result => {
        if (generation === fetchGeneration.current && !controller.signal.aborted) setPracticeState({ itemId: item.id, result });
      }).catch(() => {
        if (generation === fetchGeneration.current && !controller.signal.aborted) setPracticeState({ itemId: item.id, result: { kind: "invalid-response" } });
      });
    }
    return () => { controller.abort(); fetchGeneration.current += 1; };
  }, [api, isOnline, itemId, item?.id, item?.publicationMode]);
  useEffect(() => () => {
    createGeneration.current += 1;
    queueMicrotask(() => setSavingState(current => current?.itemId === itemId ? null : current));
  }, [itemId]);
  const activePracticeState = !isOnline ? { kind: "offline" as const } : practiceState && practiceState.itemId === item?.id ? practiceState.result : null;
  const practicePayload = activePracticeState?.kind === "success" && activePracticeState.practice.id === item?.id ? activePracticeState.practice : null;
  const saving = Boolean(item && savingState?.itemId === item.id);

  async function practice() {
    if (!item || item.publicationMode !== "PRACTICE" || !practicePayload || saving) return;
    if (!isOnline) { setError({ itemId: item.id, failure: { kind: "offline" } }); return; }
    const generation = ++createGeneration.current;
    setSavingState({ itemId: item.id, generation });
    setError(null);
    try {
      const result = await api.createGalleryScript(item.id);
      if (generation !== createGeneration.current) return;
      if (result.kind === "success") {
        onNavigate({ name: "listen", scriptId: result.script.id });
        return;
      }
      setError({ itemId: item.id, failure: result });
    } catch {
      if (generation === createGeneration.current) setError({ itemId: item.id, failure: { kind: "invalid-response" } });
    } finally {
      setSavingState(current => current?.generation === generation ? null : current);
    }
  }

  async function openSource(url: string) {
    try {
      await Browser.open({ url });
    } catch {
      setSourceError(true);
    }
  }

  if (itemId && !item) return <section className="scripts-screen" lang="ja"><ScreenHeading title="Gallery" /><p role="status">この場面は公開されていません。</p><button type="button" onClick={() => onNavigate({ name: "gallery" })}>Galleryへ戻る</button></section>;

  if (item) return <article className="scripts-screen gallery-screen" lang="ja" aria-label="Gallery detail">
    <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery" })}>← Galleryへ戻る</button>
    <p className="scripts-intro">{item.sourceType} · {item.themes.join(" / ")}</p>
    <h1 className="gallery-title">{item.title}</h1>
    <p>{item.workTitle} · {item.speaker}</p>
    <section><h2>What was happening?</h2><p>{item.moment}</p><p>{item.contextJa}</p></section>
    <section><h2>Why this moment matters</h2><p>{item.whyItMattersJa}</p></section>
    {item.publicationMode === "PRACTICE" ? <section><h2>The words</h2>{practicePayload ? <><p lang={practicePayload.locale} className="gallery-words">{practicePayload.practiceTextEn}</p>{practicePayload.translationJa ? <p>{practicePayload.translationJa}</p> : null}</> : activePracticeState && activePracticeState.kind !== "success" ? <RequestError error={activePracticeState} /> : <p role="status">練習文を読み込んでいます…</p>}</section> : null}
    {item.speakingNotes.length ? <section><h2>Listen for</h2><ul>{item.speakingNotes.map(note => <li key={note}>{note}</li>)}</ul></section> : null}
    <section><h2>Try it yourself</h2><p>{item.publicationMode === "PRACTICE" ? "自分の台本として保存してから練習します。お手本には現在の自分の声を使います。" : "原典を探し、使える英文を自分で確認してから台本を作ります。自動取り込みは行いません。"}</p>
      {item.publicationMode === "PRACTICE" ? <button className="scripts-primary" type="button" disabled={saving || !practicePayload} onClick={() => void practice()}>{saving ? "保存中…" : "この一節で練習する"}</button> : <button className="scripts-primary" type="button" onClick={() => onNavigate({ name: "scripts", create: true })}>自分の台本を作る</button>}
      {error?.itemId === item.id ? <RequestError error={error.failure} /> : null}
    </section>
    <section><h2>Original source</h2>{item.primarySourceUrl ? <button type="button" className="scripts-text-action" onClick={() => void openSource(item.primarySourceUrl!)}>原典を開く</button> : <p>出典の場所: {item.canonicalSourceLocator}</p>}{sourceError ? <p role="alert">原典を開けませんでした。後で試してください。</p> : null}</section>
    <section><h2>Source & Credits</h2><p>{item.workTitle} · {item.speaker}{item.year ? ` · ${item.year}` : ""}</p><p>{item.sourceKind} · {item.canonicalSourceLocator}</p></section>
    {item.moreLikeThis.length ? <section><h2>More like this</h2><ul>{item.moreLikeThis.map(id => { const related = catalog.items.find(entry => entry.id === id); return related ? <li key={id}><button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", itemId: id })}>{related.title}</button></li> : null; })}</ul></section> : null}
  </article>;

  return <section className="scripts-screen gallery-screen" lang="ja" aria-label="Gallery">
    <ScreenHeading title="Gallery" />
    <p className="scripts-intro">話したい言葉を探す</p>
    <p>誰が、どんな場面で、なぜその言葉を使ったのかを知る。</p>
    <div className="gallery-filters">
      <label>検索<input value={query} onChange={event => setQuery(event.target.value)} placeholder="作品・話者・場面" /></label>
      <label>Source<select value={source} onChange={event => setSource(event.target.value)}><option value="">すべて</option>{GALLERY_SOURCE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Theme<select value={theme} onChange={event => setTheme(event.target.value)}><option value="">すべて</option>{catalog.themes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {items.length ? <ul className="gallery-list">{items.map(entry => <li key={entry.id}>
      <p className="script-meta">{entry.sourceType} · {entry.themes.join(" / ")}</p>
      <h2>{entry.title}</h2><p>{entry.workTitle} · {entry.speaker}</p><p>{entry.moment}</p>
      <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", itemId: entry.id })}>{entry.publicationMode === "PRACTICE" ? "場面を見て練習する" : "場面と原典を見る"} →</button>
    </li>)}</ul> : <p role="status">{catalog.items.length ? "条件に合う場面はありません。" : "公開できる場面を準備中です。"}</p>}
    <section className="gallery-find-own"><h2>自分で見つける / Your Story</h2><p>見つけた英文、または実際にあった自分の体験を台本にする。</p><button type="button" className="scripts-primary" onClick={() => onNavigate({ name: "scripts", create: true })}>自分の台本を作る</button></section>
  </section>;
}
