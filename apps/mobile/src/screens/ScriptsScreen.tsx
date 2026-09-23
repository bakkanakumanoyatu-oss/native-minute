import { ScriptManagement, ArchivedScripts } from "./ScriptManagement";
import { scriptsDisplayMemory } from "../practice/display-loaders";
import { MetadataRefresh } from "./MetadataRefresh";
import { useDisplayMemory } from "../practice/use-display-memory";
import { MAX_PRACTICE_SLOTS } from "../../../../lib/practice-limits";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PracticeRoute } from "../practice/routes";
import {
  type MobileScript,
  type PracticeApi,
  type PracticeRequestFailure
} from "../practice/api";
import { EmptyState, LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

// Display-only excerpt. The server-owned content remains intact for practice.
export function getScriptExcerpt(content: string) {
  const text = content.trim().replace(/\s+/g, " ");
  const firstSentence = text.match(/^.*?[.!?]["'”’]?(?=\s|$)/u)?.[0] ?? text;
  const excerpt = firstSentence.split(" ").slice(0, 24).join(" ");
  return excerpt.length < text.length
    ? `${excerpt.replace(/[.,;:!?…\s]+$/u, "")}\u2060…`
    : excerpt;
}

export function ScriptsList({
  scripts,
  onNavigate,
  onManage
}: {
  onManage?: (script: MobileScript) => void;
  scripts: MobileScript[];
  onNavigate: (route: PracticeRoute) => void;
}) {
  return (
    <ul className="script-list practice-script-list" aria-label="保存済みの台本">
      {scripts.map((script) => (
        <li key={script.id}>
          <h2 lang={script.locale}>{script.title}</h2>
          <div className="script-meta">
            <span>目標 {script.targetSeconds}秒</span>
            <span aria-hidden="true">·</span>
            <span lang={script.locale}>{script.locale}</span>
          </div>
          <p className="script-excerpt" lang={script.locale}>{getScriptExcerpt(script.content)}</p>
          <div className="scripts-row-actions">
            <button
              type="button"
              className="scripts-text-action scripts-practice-action"
              aria-label={`${script.title}のお手本を聴いて練習する`}
              onClick={() => onNavigate({ name: "listen", scriptId: script.id })}
            >
              <span>練習する</span><span aria-hidden="true">→</span>
            </button>
            {onManage ? <button type="button" className="scripts-text-action" onClick={() => onManage(script)}>編集・削除</button> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ScriptsScreen({
  api,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const memory = useMemo(() => api.scriptsMemory ?? scriptsDisplayMemory(api), [api]);
  const { state, retry: reload } = useDisplayMemory(memory, "scripts", isOnline);
  const [editing, setEditing] = useState<MobileScript | null>(null);
  const [managementKey, setManagementKey] = useState(0);
  const [archiveKey, setArchiveKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [createState, setCreateState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; error: PracticeRequestFailure }
  >({ kind: "idle" });
  const createGeneration = useRef(0);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreate) {
      titleInput.current?.focus();
    }
  }, [showCreate]);

  useEffect(() => () => {
    createGeneration.current += 1;
  }, []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOnline) {
      setCreateState({ kind: "error", error: { kind: "offline" } });
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      setCreateState({
        kind: "error",
        error: { kind: "invalid-request", reasonCode: "script_required" }
      });
      return;
    }

    setCreateState({ kind: "submitting" });
    const generation = ++createGeneration.current;
    const result = await api.createScript({
      title: trimmedTitle,
      content: trimmedContent,
      targetSeconds: 60,
      locale: "en-US"
    });

    if (generation !== createGeneration.current) {
      return;
    }

    if (result.kind !== "success") {
      setCreateState({ kind: "error", error: result });
      return;
    }

    setCreateState({ kind: "idle" });
    setTitle("");
    setContent("");
    onNavigate({ name: "listen", scriptId: result.script.id });
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const visibleState: typeof state = isOnline || state.kind === "ready"
    ? state
    : { kind: "error", error: { kind: "offline" } };
  const isEmpty = visibleState.kind === "ready" && visibleState.data.length === 0;

  function openManagement(script: MobileScript) {
    setEditing(script);
    setManagementKey(value => value + 1);
  }

  return (
    <section className="scripts-screen" lang="ja" aria-label="Scripts">
      <div className="scripts-heading">
        <ScreenHeading title="Scripts" />
        {!isEmpty || showCreate ? (
          <button
            type="button"
            className="scripts-text-action scripts-create-action"
            aria-expanded={showCreate}
            aria-controls="script-create-form"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "フォームを閉じる" : "台本を作る"}
          </button>
        ) : null}
      </div>
      <p className="scripts-intro">練習する1分を選ぶ</p>
      {visibleState.kind === "ready" ? <p className="scripts-capacity">保存済み {visibleState.data.length}件 <span>/ 上限{MAX_PRACTICE_SLOTS}件</span></p> : null}

      {showCreate ? (
        <form id="script-create-form" className="script-create-form" onSubmit={(event) => void submitCreate(event)}>
          <label htmlFor="script-title">タイトル</label>
          <input
            id="script-title"
            ref={titleInput}
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Morning update"
            required
          />
          <label htmlFor="script-content">英語台本</label>
          <textarea
            id="script-content"
            lang="en-US"
            aria-describedby="script-length-note"
            value={content}
            maxLength={4_000}
            rows={8}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write the English script you want to practice."
            required
          />
          <p id="script-length-note" className={wordCount > 150 ? "length-note length-warning" : "length-note"}>
            {wordCount} words · 目標60秒{wordCount > 150 ? "（長めの可能性があります）" : ""}
          </p>
          {createState.kind === "error" ? (
            createState.error.kind === "conflict" && createState.error.reasonCode === "script_limit_reached" ? (
              <div className="auth-error" role="alert">
                <p>台本の保存上限に達しています。</p>
                <p>保存済みの台本から練習を続けられます。</p>
              </div>
            ) : <RequestError error={createState.error} />
          ) : null}
          <button className="scripts-primary" type="submit" disabled={createState.kind === "submitting"}>
            {createState.kind === "submitting" ? "保存中…" : "台本を保存して聴く"}
          </button>
        </form>
      ) : null}

      {visibleState.kind === "ready" ? <MetadataRefresh refreshing={visibleState.refreshing} reason={visibleState.refreshReason} error={visibleState.updateError} isOnline={isOnline} onRefresh={reload} /> : null}
      {visibleState.kind === "loading" ? (
        <div className="scripts-state">
          <LoadingState label="台本を読み込んでいます…" />
          <div className="scripts-placeholder" aria-hidden="true"><span /><span /><span /></div>
        </div>
      ) : null}
      {visibleState.kind === "error" ? (
        <div className="scripts-state scripts-error">
          <h2>台本一覧を読み込めませんでした</h2>
          <RequestError error={visibleState.error} onRetry={reload} />
        </div>
      ) : null}
      {isEmpty && !showCreate ? (
        <EmptyState title="まだ台本がありません">
          <p>まず、練習する約1分の台本を作りましょう。</p>
          <button
            type="button"
            className="scripts-text-action scripts-practice-action"
            aria-expanded={showCreate}
            aria-controls="script-create-form"
            onClick={() => setShowCreate(true)}
          >
            <span>台本を作る</span><span aria-hidden="true">→</span>
          </button>
        </EmptyState>
      ) : null}
      {visibleState.kind === "ready" && !isEmpty ? <ScriptsList scripts={visibleState.data} onNavigate={onNavigate} onManage={api.mutateScript ? openManagement : undefined} /> : null}
      {editing ? <ScriptManagement key={managementKey} api={api} script={editing} onClose={() => { setEditing(null); setArchiveKey(value => value + 1); }} /> : null}
      {api.listArchivedScripts ? <ArchivedScripts key={archiveKey} api={api} onManage={openManagement} /> : null}
    </section>
  );
}
