import { useEffect, useId, useRef, useState } from "react";
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
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const errorRegion = useRef<HTMLDivElement>(null);
  const archiveMessageId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (confirmArchive) {
      confirmButton.current?.scrollIntoView({ block: "center" });
      confirmButton.current?.focus({ preventScroll: true });
    }
  }, [confirmArchive]);
  useEffect(() => {
    if (error) {
      errorRegion.current?.scrollIntoView({ block: "center" });
      errorRegion.current?.focus({ preventScroll: true });
    }
  }, [error]);
  async function save(archived?: boolean) {
    if (!api.mutateScript || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await api.mutateScript(base.id, archived === undefined
        ? { title, content, expectedRevisionId: base.currentRevisionId, expectedLockVersion: base.lockVersion }
        : { archived, expectedLockVersion: base.lockVersion });
      if (!mounted.current) return;
      setBusy(false);
      if (result.kind === "success") { onClose(); return; }
      setError(result);
    } catch {
      if (!mounted.current) return;
      setBusy(false);
      setError({ kind: "invalid-response" });
    }
  }
  async function refreshBase() {
    const result = await api.getScript(base.id);
    if (!mounted.current) return;
    if (result.kind === "success") { setBase(result.script); setError(null); }
    else setError(result);
  }
  const errorFeedback = error ? <div ref={errorRegion} tabIndex={-1}>
    <RequestError error={error} />
    {error.kind === "conflict" ? <button type="button" onClick={() => void refreshBase()}>下書きを残して最新状態を確認</button> : null}
  </div> : null;
  return <section className="script-create-form" aria-label={base.archivedAt ? "台本の復元" : "台本の編集・削除"}>
    <h2 ref={heading} tabIndex={-1}>{base.archivedAt ? "削除済みの台本" : "台本を編集・削除"}</h2>
    <label>タイトル<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={!!base.archivedAt || busy} /></label>
    <label>英語台本<textarea value={content} onChange={event => setContent(event.target.value)} rows={8} disabled={!!base.archivedAt || busy} /></label>
    <p>本文を変更しても、以前の録音・評価履歴は残ります。</p>
    {!confirmArchive ? errorFeedback : null}
    {base.archivedAt ? <button type="button" disabled={busy} onClick={() => void save(false)}>復元する</button> : <>
      {!confirmArchive ? <>
        <button type="button" disabled={busy || !title.trim() || !content.trim()} onClick={() => void save()}>変更を保存</button>
        <button type="button" disabled={busy} onClick={() => { setError(null); setConfirmArchive(true); }}>台本を削除</button>
      </> : <div role="group" aria-label="台本削除の確認">
        <p id={archiveMessageId}>「{base.title}」を削除しますか？練習する台本の一覧から消えます。録音・評価の履歴は残り、あとで復元できます。</p>
        {errorFeedback}
        <button ref={confirmButton} type="button" aria-describedby={archiveMessageId} disabled={busy} onClick={() => void save(true)}>{busy ? "削除中…" : "削除する"}</button>
        <button type="button" disabled={busy} onClick={() => { setError(null); setConfirmArchive(false); }}>キャンセル</button>
      </div>}
    </>}
    <button type="button" disabled={busy} onClick={onClose}>閉じる</button>
  </section>;
}

export function ArchivedScripts({ api, onManage }: { api: PracticeApi; onManage(script: MobileScript): void }) {
  const [open, setOpen] = useState(false);
  const [scripts, setScripts] = useState<MobileScript[] | null>(null);
  const [error, setError] = useState<PracticeRequestFailure | null>(null);
  const requestGeneration = useRef(0);
  const toggleButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { requestGeneration.current += 1; }, []);
  useEffect(() => {
    if (open) toggleButton.current?.scrollIntoView({ block: "start" });
  }, [open]);
  async function load(generation: number) {
    const result = await api.listArchivedScripts?.();
    if (generation !== requestGeneration.current) return;
    if (result?.kind === "success") { setScripts(result.scripts); setError(null); }
    else if (result) setError(result);
  }
  function toggle() {
    if (open) {
      requestGeneration.current += 1;
      setOpen(false);
      setScripts(null);
      setError(null);
      return;
    }
    setOpen(true);
    setScripts(null);
    setError(null);
    void load(++requestGeneration.current);
  }
  return <section aria-label="削除済みの台本"><button ref={toggleButton} type="button" aria-expanded={open} aria-controls="archived-script-list" onClick={toggle}>{open ? "削除済みの台本を閉じる" : "削除済みの台本を見る"}</button>
    {open ? <div id="archived-script-list">
      {error ? <RequestError error={error} /> : null}
      {!scripts && !error ? <p role="status">読み込み中…</p> : null}
      {scripts?.length ? <ul>{scripts.map(script => <li key={script.id}><button type="button" onClick={() => onManage(script)}>{script.title} — 復元画面を開く</button></li>)}</ul> : null}
      {scripts?.length === 0 ? <p>削除済みの台本はありません。</p> : null}
    </div> : null}
  </section>;
}
