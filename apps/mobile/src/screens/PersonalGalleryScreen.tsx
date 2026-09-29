import { Browser } from "@capacitor/browser";
import { useEffect, useRef, useState } from "react";
import { gallery } from "../../../../lib/gallery/public";
import { getScriptLength } from "../../../../lib/script-length";
import { selectedStoredExcerpt } from "../../../../lib/gallery/range-selection";
import type { PersonalGalleryItem, PersonalGalleryList } from "../../../../lib/gallery/personal-types";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { RequestError, ScreenHeading } from "./ScreenParts";

export type GalleryViewState = {
  query: string; source: string; theme: string; sort: "recent" | "work"; offset: number;
  exampleQuery: string; exampleSource: string; exampleTheme: string;
};
export const initialGalleryViewState = (): GalleryViewState => ({
  query: "", source: "", theme: "", sort: "recent", offset: 0,
  exampleQuery: "", exampleSource: "", exampleTheme: ""
});
type Props = { api: PracticeApi; isOnline: boolean; personalId?: string; view?: "examples" | "new" | "personal" | "edit";
  viewState: GalleryViewState; onViewStateChange: (patch: Partial<GalleryViewState>) => void; onNavigate: (route: PracticeRoute) => void };
type Form = { sceneTitle: string; workTitle: string; sourceType: string; speaker: string; context: string;
  sourceUrl: string; personalNote: string; excerptText: string };
const emptyForm = (): Form => ({ sceneTitle: "", workTitle: "", sourceType: "", speaker: "", context: "",
  sourceUrl: "", personalNote: "", excerptText: "" });
function formFrom(item: PersonalGalleryItem): Form {
  return { sceneTitle: item.sceneTitle, workTitle: item.workTitle ?? "", sourceType: item.sourceType ?? "",
    speaker: item.speaker ?? "", context: item.context ?? "", sourceUrl: item.sourceUrl ?? "",
    personalNote: item.personalNote ?? "", excerptText: item.excerptText ?? "" };
}

export function PersonalGalleryScreen({ api, isOnline, personalId, view, viewState, onViewStateChange, onNavigate }: Props) {
  const { query, source, theme, sort, offset } = viewState;
  const [list, setList] = useState<PersonalGalleryList | null>(null);
  const [item, setItem] = useState<PersonalGalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PracticeRequestFailure | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [expanded, setExpanded] = useState(view === "edit");
  const [busy, setBusy] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [scriptTitle, setScriptTitle] = useState("");
  const fetchGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const selectionRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const detail = view === "personal" || view === "edit";

  useEffect(() => {
    const generation = ++fetchGeneration.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!isOnline) { setError({ kind: "offline" }); setLoading(false); return; }
      setLoading(true); setError(null);
      if (detail && personalId && api.getPersonalGalleryItem) {
        void api.getPersonalGalleryItem(personalId, controller.signal).then(result => {
          if (generation !== fetchGeneration.current || controller.signal.aborted) return;
          if (result.kind === "success") {
            setItem(result.value); setScriptTitle(result.value.sceneTitle.length <= 120 ? result.value.sceneTitle : "");
            if (view === "edit") setForm(formFrom(result.value));
          } else setError(result);
          setLoading(false);
        });
      } else if (!detail && view !== "new" && api.listPersonalGallery) {
        void api.listPersonalGallery({ query, sourceType: source, theme, sort, offset, limit: 30 }, controller.signal).then(result => {
          if (generation !== fetchGeneration.current || controller.signal.aborted) return;
          if (result.kind === "success") setList(result.value); else setError(result);
          setLoading(false);
        });
      } else setLoading(false);
    }, detail ? 0 : 220);
    return () => { clearTimeout(timer); controller.abort(); fetchGeneration.current += 1; };
  }, [api, isOnline, personalId, view, detail, query, source, theme, sort, offset]);
  useEffect(() => () => { mutationGeneration.current += 1; }, []);

  function changeForm(key: keyof Form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  async function saveForm() {
    if (busy || !form.sceneTitle.trim()) return;
    if (view === "edit" && !item) return;
    const generation = ++mutationGeneration.current;
    setBusy(true); setError(null);
    const payload = { ...form, workTitle: form.workTitle || null, sourceType: form.sourceType || null,
      speaker: form.speaker || null, context: form.context || null, sourceUrl: form.sourceUrl || null,
      personalNote: form.personalNote || null, excerptText: form.excerptText || null };
    try {
      const result = view === "edit" && item && api.updatePersonalGalleryItem
        ? await api.updatePersonalGalleryItem(item.id, { ...payload, expectedLockVersion: item.lockVersion })
        : api.createPersonalGalleryItem ? await api.createPersonalGalleryItem(payload) : { kind: "invalid-response" as const };
      if (generation !== mutationGeneration.current) return;
      if (result.kind === "success") onNavigate({ name: "gallery", view: "personal", personalId: result.value.id });
      else setError(result);
    } catch { if (generation === mutationGeneration.current) setError({ kind: "invalid-response" }); }
    finally { if (generation === mutationGeneration.current) setBusy(false); }
  }
  async function remove() {
    if (!item || !api.deletePersonalGalleryItem || busy || !window.confirm("この場面を削除しますか？ 作成した台本は残ります。")) return;
    const generation = ++mutationGeneration.current;
    setBusy(true); setError(null);
    const result = await api.deletePersonalGalleryItem(item.id, item.lockVersion);
    if (generation !== mutationGeneration.current) return;
    if (result.kind === "success") onNavigate({ name: "gallery" }); else setError(result);
    setBusy(false);
  }
  async function createScript() {
    if (!item || !api.createPersonalGalleryScript || busy) return;
    if (!scriptTitle.trim()) { setRangeOpen(true); titleRef.current?.focus(); return; }
    const excerpt = item.excerptText ?? "";
    const long = getScriptLength(excerpt).exceedsLimit;
    if (long && !selected) { setRangeOpen(true); return; }
    const generation = ++mutationGeneration.current;
    setBusy(true); setError(null);
    const result = await api.createPersonalGalleryScript(item.id, { expectedLockVersion: item.lockVersion,
      scriptTitle, selectedText: long ? selected : null });
    if (generation !== mutationGeneration.current) return;
    if (result.kind === "success") onNavigate({ name: "listen", scriptId: result.script.id }); else setError(result);
    setBusy(false);
  }
  async function openSource(url: string) { try { await Browser.open({ url }); } catch { setError({ kind: "invalid-response" }); } }

  if (view === "new" || view === "edit") return <section className="scripts-screen gallery-screen gallery-personal-form" lang="ja">
    <button className="scripts-text-action" type="button" onClick={() => onNavigate(view === "edit" && personalId ? { name: "gallery", view: "personal", personalId } : { name: "gallery" })}>← Galleryへ</button>
    <ScreenHeading title={view === "edit" ? "場面を編集" : "話したい場面を追加"} />
    <p>場面の名前だけで保存できます。英文は後からでも大丈夫です。</p>
    {loading && view === "edit" ? <p role="status">読み込み中…</p> : view === "edit" && !item ? error ? <RequestError error={error} /> : <p>場面が見つかりません。</p> : <>
      <label>場面の名前 *<input autoFocus required maxLength={240} value={form.sceneTitle} onChange={event => changeForm("sceneTitle", event.target.value)} placeholder="どんな場面・言葉を残したい？" /></label>
      <label>作品名（任意）<input maxLength={240} value={form.workTitle} onChange={event => changeForm("workTitle", event.target.value)} /></label>
      <button type="button" className="scripts-text-action" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "追加項目を閉じる" : "英文・URL・メモを追加"}</button>
      {expanded ? <div className="gallery-personal-fields">
        <label>種類<input maxLength={80} value={form.sourceType} onChange={event => changeForm("sourceType", event.target.value)} /></label>
        <label>話し手<input maxLength={160} value={form.speaker} onChange={event => changeForm("speaker", event.target.value)} /></label>
        <label>この場面<textarea maxLength={4000} rows={3} value={form.context} onChange={event => changeForm("context", event.target.value)} /></label>
        <label>出典 URL<input type="url" maxLength={2048} value={form.sourceUrl} onChange={event => changeForm("sourceUrl", event.target.value)} /></label>
        <label>自分のメモ<textarea maxLength={4000} rows={3} value={form.personalNote} onChange={event => changeForm("personalNote", event.target.value)} /></label>
        <label>利用できる英文<textarea maxLength={20000} rows={8} value={form.excerptText} onChange={event => changeForm("excerptText", event.target.value)} /></label>
        <p className="script-meta">自分が利用できる英文を追加してください。保存した英文は自分のコレクションに保存されます。</p>
      </div> : null}
      {error ? <RequestError error={error} /> : null}
      <button type="button" className="scripts-primary" disabled={busy || !form.sceneTitle.trim()} onClick={() => void saveForm()}>{busy ? "保存中…" : "コレクションに保存"}</button>
    </>}
  </section>;

  if (detail) {
    if (loading) return <section className="scripts-screen"><p role="status">場面を読み込んでいます…</p></section>;
    if (!item) return <section className="scripts-screen"><button className="scripts-text-action" onClick={() => onNavigate({ name: "gallery" })}>← 自分のコレクション</button>{error ? <RequestError error={error} /> : <p>場面が見つかりません。</p>}</section>;
    const excerpt = item.excerptText ?? "";
    const long = getScriptLength(excerpt).exceedsLimit;
    return <article className="scripts-screen gallery-screen" lang="ja">
      <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery" })}>← 自分のコレクション</button>
      <p className="script-meta">{item.workTitle || item.sourceType || "自分の場面"}</p>
      <h1 className="gallery-title">{item.sceneTitle}</h1>{item.speaker ? <p>{item.speaker}</p> : null}
      <section className="gallery-personal-actions">
        {item.linkedScriptId ? <>{item.linkedScriptArchivedAt ? <p>作成した台本は一覧から外されています。復元はWebの「削除済み台本」から行えます。</p> : null}<button className="scripts-primary" type="button" onClick={() => onNavigate(item.linkedScriptArchivedAt ? { name: "scripts" } : { name: "listen", scriptId: item.linkedScriptId! })}>{item.linkedScriptArchivedAt ? "台本一覧へ" : "作成した台本を開く"}</button></>
          : !excerpt ? <button className="scripts-primary" type="button" onClick={() => onNavigate({ name: "gallery", view: "edit", personalId: item.id })}>英文を追加する</button>
            : long ? <button className="scripts-primary" type="button" onClick={() => setRangeOpen(true)}>練習する範囲を選ぶ</button>
              : <button className="scripts-primary" type="button" disabled={busy} onClick={() => void createScript()}>{busy ? "作成中…" : scriptTitle.trim() ? "練習台本にする" : "台本名を入力する"}</button>}
        {!item.linkedScriptId && (rangeOpen || item.sceneTitle.length > 120) ? <div className="gallery-range">
          <label>台本名（120文字以内）<input ref={titleRef} maxLength={120} value={scriptTitle} onChange={event => setScriptTitle(event.target.value)} /></label>
          {long ? <><p>保存した英文の連続する一節を選択してください。200語・2,000文字以内で台本にできます。</p><textarea ref={selectionRef} readOnly rows={9} value={excerpt} aria-label="保存した英文から練習範囲を選択" onSelect={() => { const el = selectionRef.current; if (el) setSelected(selectedStoredExcerpt(excerpt, el.selectionStart, el.selectionEnd)); }} /><p className="script-meta">選択範囲: {selected ? `${getScriptLength(selected).wordCount}語・${getScriptLength(selected).characterCount}文字` : "未選択"}</p></> : null}
          <button className="scripts-primary" type="button" disabled={busy || !scriptTitle.trim() || (long && (!selected || getScriptLength(selected).exceedsLimit))} onClick={() => void createScript()}>{long ? "選んだ範囲で台本を作る" : "台本を作る"}</button>
        </div> : null}
        <div className="gallery-personal-links"><button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", view: "edit", personalId: item.id })}>編集</button><button type="button" className="scripts-text-action" disabled={busy} onClick={() => void remove()}>削除</button></div>
        {error ? <RequestError error={error} /> : null}
      </section>
      {item.context ? <section><h2>この場面</h2><p className="gallery-personal-copy">{item.context}</p></section> : null}
      {item.personalNote ? <section><h2>自分のメモ</h2><p className="gallery-personal-copy">{item.personalNote}</p></section> : null}
      {excerpt ? <section><h2>保存した英文</h2><p lang={item.locale} className="gallery-words gallery-personal-copy">{excerpt}</p></section> : <p>英文はまだありません。場面はこのまま保存されています。</p>}
      {item.sourceUrl ? <button type="button" className="scripts-text-action" onClick={() => void openSource(item.sourceUrl!)}>出典を開く</button> : item.sourceLocator ? <p>出典: {item.sourceLocator}</p> : null}
    </article>;
  }

  return <section className="scripts-screen gallery-screen" lang="ja" aria-label="自分のコレクション">
    <ScreenHeading title="Gallery" />
    <p className="scripts-intro">自分のコレクション</p><p>話してみたい場面を集める場所。英文は後から追加できます。</p>
    <div className="gallery-personal-links"><button type="button" className="scripts-primary" onClick={() => onNavigate({ name: "gallery", view: "new" })}>＋ 場面を追加</button><button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", view: "examples" })}>集め方の見本</button></div>
    <div className="gallery-filters">
      <label>自分のコレクションを検索<input value={query} onChange={event => onViewStateChange({ query: event.target.value, offset: 0 })} placeholder="作品・場面・人物・言葉" /></label>
      <label>Source<input value={source} onChange={event => onViewStateChange({ source: event.target.value, offset: 0 })} placeholder="種類" /></label>
      <label>Theme<input value={theme} onChange={event => onViewStateChange({ theme: event.target.value, offset: 0 })} placeholder="テーマ" /></label>
      <label>並び順<select value={sort} onChange={event => onViewStateChange({ sort: event.target.value === "work" ? "work" : "recent", offset: 0 })}><option value="recent">最近保存した順</option><option value="work">作品名順</option></select></label>
    </div>
    {loading ? <p role="status">読み込み中…</p> : error ? <RequestError error={error} /> : list?.items.length ? <>
      <ul className="gallery-list">{list.items.map(entry => <li key={entry.id}>
        <p className="script-meta">{entry.workTitle || entry.sourceType || "自分の場面"}</p>
        <h2>{entry.sceneTitle}</h2>{entry.speaker ? <p>{entry.speaker}</p> : null}
        {entry.shortNote ? <p className="gallery-personal-card-note">{entry.shortNote}</p> : null}
        <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", view: "personal", personalId: entry.id })}>場面を開く →</button>
      </li>)}</ul>
      <div className="gallery-personal-links">
        {offset > 0 ? <button type="button" className="scripts-text-action" onClick={() => onViewStateChange({ offset: Math.max(0, offset - 30) })}>前へ</button> : null}
        {list.nextOffset !== null ? <button type="button" className="scripts-text-action" onClick={() => onViewStateChange({ offset: list.nextOffset! })}>次へ</button> : null}
      </div>
    </> : !query && !source && !theme && offset === 0 ? <section className="gallery-find-own">
      <h2>最初の場面を集めましょう</h2><p>場面の名前だけで保存できます。</p>
      <button className="scripts-primary" type="button" onClick={() => onNavigate({ name: "gallery", view: "new" })}>＋ 場面を追加</button>
      <h3>集め方の見本</h3><ul className="gallery-list">{gallery.items.slice(0, 3).map(example => <li key={example.id}>
        <p>{example.workTitle}</p><h2>{example.title}</h2>
        <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", view: "examples", itemId: example.id })}>見本を見る</button>
      </li>)}</ul>
      <button type="button" className="scripts-text-action" onClick={() => onNavigate({ name: "gallery", view: "examples" })}>見本を全部見る</button>
    </section> : <p role="status">条件に合う場面はありません。同じ言葉で見本も探せます。</p>}
  </section>;
}
