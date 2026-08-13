import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { PracticeRoute } from "../practice/routes";
import {
  type MobileScript,
  type PracticeApi,
  type PracticeRequestFailure
} from "../practice/api";
import { EmptyState, LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

type ScriptsLoadState =
  | { kind: "loading" }
  | { kind: "ready"; scripts: MobileScript[] }
  | { kind: "error"; error: PracticeRequestFailure };

export function ScriptsList({
  scripts,
  onNavigate
}: {
  scripts: MobileScript[];
  onNavigate: (route: PracticeRoute) => void;
}) {
  if (scripts.length === 0) {
    return (
      <EmptyState title="保存済みの台本はまだありません">
        <p>下のフォームで、今日練習する約1分の英語台本を作成してください。</p>
      </EmptyState>
    );
  }

  return (
    <ul className="script-list practice-script-list">
      {scripts.map((script) => (
        <li key={script.id}>
          <div className="script-meta">
            <span>{script.locale}</span>
            <span>{script.targetSeconds}秒</span>
          </div>
          <h2>{script.title}</h2>
          <p>{script.content}</p>
          <div className="button-row">
            <button type="button" onClick={() => onNavigate({ name: "listen", scriptId: script.id })}>
              お手本を聴く
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onNavigate({ name: "record", scriptId: script.id })}
            >
              録音する
            </button>
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
  const [state, setState] = useState<ScriptsLoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [createState, setCreateState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; error: PracticeRequestFailure }
  >({ kind: "idle" });
  const createGeneration = useRef(0);

  useEffect(() => () => {
    createGeneration.current += 1;
  }, []);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    if (!isOnline) {
      return () => {
        active = false;
      };
    }

    void api.listScripts().then((result) => {
      if (!active) {
        return;
      }
      setState(
        result.kind === "success"
          ? { kind: "ready", scripts: result.scripts }
          : { kind: "error", error: result }
      );
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, reloadKey]);

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
  const visibleState: ScriptsLoadState = isOnline
    ? state
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading
        eyebrow="Scripts"
        title="自分の1分台本"
        detail="台本を選び、お手本を聴いてから今日のTakeを録ります。"
      />

      <button type="button" className="secondary-button compact-button" onClick={() => setShowCreate((value) => !value)}>
        {showCreate ? "作成フォームを閉じる" : "新しい台本を作る"}
      </button>

      {showCreate ? (
        <form className="script-create-form" onSubmit={(event) => void submitCreate(event)}>
          <label htmlFor="script-title">タイトル</label>
          <input
            id="script-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Morning update"
            required
          />
          <label htmlFor="script-content">英語台本</label>
          <textarea
            id="script-content"
            value={content}
            maxLength={4_000}
            rows={8}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write the English script you want to practice."
            required
          />
          <p className={wordCount > 150 ? "length-note length-warning" : "length-note"}>
            {wordCount} words · 目標60秒{wordCount > 150 ? "（長めの可能性があります）" : ""}
          </p>
          {createState.kind === "error" ? <RequestError error={createState.error} /> : null}
          <button type="submit" disabled={createState.kind === "submitting"}>
            {createState.kind === "submitting" ? "保存中…" : "台本を保存して聴く"}
          </button>
        </form>
      ) : null}

      {visibleState.kind === "loading" ? <LoadingState label="台本を読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? <ScriptsList scripts={visibleState.scripts} onNavigate={onNavigate} /> : null}
    </section>
  );
}
