import { useEffect, useRef, useState } from "react";
import type { MobileScript, PracticeApi, PracticeRequestFailure } from "../practice/api";
import { RequestError } from "./ScreenParts";

export function ScriptManagement({ api, script, onClose }: { api: PracticeApi; script: MobileScript; onClose(): void }) {
  const [base, setBase] = useState(script);
  const [title, setTitle] = useState(script.title);
  const [content, setContent] = useState(script.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PracticeRequestFailure | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save(archived?: boolean) {
    if (!api.mutateScript || busy) return;
    setBusy(true); setError(null);
    const result = await api.mutateScript(base.id, archived === undefined
      ? { title, content, expectedRevisionId: base.currentRevisionId, expectedLockVersion: base.lockVersion }
      : { archived, expectedLockVersion: base.lockVersion });
    if (!mounted.current) return;
    setBusy(false);
    if (result.kind === "success") { onClose(); return; }
    setError(result);
  }
  async function refreshBase() {
    const result = await api.getScript(base.id);
    if (!mounted.current) return;
    if (result.kind === "success") { setBase(result.script); setError(null); }
    else setError(result);
  }
  return <section className="script-create-form" aria-label="台本の編集">
    <h2>{base.archivedAt ? "削除済みの台本" : "台本を編集"}</h2>
    <label>タイトル<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={!!base.archivedAt || busy} /></label>
    <label>英語台本<textarea value={content} onChange={event => setContent(event.target.value)} rows={8} disabled={!!base.archivedAt || busy} /></label>
    <p>本文を変更しても、以前の録音・結果は保存時の台本で残ります。</p>
    {error ? <><RequestError error={error} />{error.kind === "conflict" ? <button type="button" onClick={() => void refreshBase()}>下書きを残して最新状態を確認</button> : null}</> : null}
    {base.archivedAt ? <button type="button" disabled={busy} onClick={() => void save(false)}>復元する</button> : <>
      <button type="button" disabled={busy || !title.trim() || !content.trim()} onClick={() => void save()}>変更を保存</button>
      <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)}>台本を削除</button>
      {confirmArchive ? <div role="alert"><p>一覧から外します。録音・結果は残り、あとで復元できます。</p><button type="button" disabled={busy} onClick={() => void save(true)}>一覧から外す</button></div> : null}
    </>}
    <button type="button" disabled={busy} onClick={onClose}>閉じる</button>
  </section>;
}

export function ArchivedScripts({ api, onManage }: { api: PracticeApi; onManage(script: MobileScript): void }) {
  const [scripts, setScripts] = useState<MobileScript[] | null>(null);
  const [error, setError] = useState<PracticeRequestFailure | null>(null);
  async function load() {
    const result = await api.listArchivedScripts?.();
    if (result?.kind === "success") { setScripts(result.scripts); setError(null); }
    else if (result) setError(result);
  }
  return <section><button type="button" onClick={() => void load()}>削除済みの台本を見る</button>
    {error ? <RequestError error={error} /> : null}
    {scripts ? <ul>{scripts.map(script => <li key={script.id}><button type="button" onClick={() => onManage(script)}>{script.title} — 復元</button></li>)}</ul> : null}
    {scripts?.length === 0 ? <p>削除済みの台本はありません。</p> : null}
  </section>;
}
