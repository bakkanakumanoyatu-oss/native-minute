import { useCallback, useEffect, useState } from "react";
import type {
  MobileProgress,
  PracticeApi,
  PracticeRequestFailure
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { EmptyState, LoadingState, RequestError, ScreenHeading, formatReviewDate } from "./ScreenParts";

type ProgressState =
  | { kind: "loading" }
  | { kind: "ready"; progress: MobileProgress }
  | { kind: "error"; error: PracticeRequestFailure };

const TREND_COPY = {
  up: "上向き",
  down: "調整中",
  flat: "安定",
  insufficient_data: "Take待ち"
} as const;

export function ProgressContent({
  progress,
  scriptId,
  onNavigate
}: {
  progress: MobileProgress;
  scriptId?: string;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const visibleScripts = scriptId
    ? progress.scripts.filter((item) => item.script.id === scriptId)
    : progress.scripts;

  if (visibleScripts.length === 0) {
    return (
      <EmptyState title="Review済みのTakeはまだありません">
        <p>台本を選び、最初のTakeを録音するとここに反映されます。</p>
      </EmptyState>
    );
  }

  return (
    <>
      <dl className="progress-summary">
        <div><dt>Scripts</dt><dd>{progress.totalScripts}</dd></div>
        <div><dt>Reviewed takes</dt><dd>{progress.totalReviewedTakes}</dd></div>
        <div><dt>Best takes</dt><dd>{progress.bestTakeCount}</dd></div>
      </dl>

      <div className="progress-script-stack">
        {visibleScripts.map((item) => (
          <article className="progress-script-card" key={item.script.id}>
            <div className="progress-title-row">
              <div>
                <p className="eyebrow">{TREND_COPY[item.improvementTrend]}</p>
                <h2>{item.script.title}</h2>
              </div>
              <span>{item.takeCount} Takes</span>
            </div>

            <div className="latest-best-grid">
              <div>
                <span>Latest</span>
                <strong>{item.latestTake?.score ?? "—"}</strong>
              </div>
              <div>
                <span>Best</span>
                <strong>{item.bestTake?.score ?? "—"}</strong>
              </div>
            </div>

            <h3>Take history</h3>
            {item.takeHistory.length > 0 ? (
              <ol className="take-history-list">
                {item.takeHistory.map((take) => (
                  <li key={take.id}>
                    <button type="button" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>
                      <span>{formatReviewDate(take.reviewedAt ?? take.createdAt)}</span>
                      <strong>{take.score}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p>保存済みTakeはありません。</p>}

            <div className="button-row">
              <button type="button" onClick={() => onNavigate({ name: "record", scriptId: item.script.id })}>次のTake</button>
              <button type="button" className="secondary-button" onClick={() => onNavigate({ name: "listen", scriptId: item.script.id })}>お手本</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function ProgressScreen({
  api,
  scriptId,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  scriptId?: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [state, setState] = useState<ProgressState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
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

    void api.getProgress().then((result) => {
      if (!active) {
        return;
      }
      setState(
        result.kind === "success"
          ? { kind: "ready", progress: result.progress }
          : { kind: "error", error: result }
      );
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, reloadKey]);

  const visibleState: ProgressState = isOnline
    ? state
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Progress" title="練習の記録" detail="Latest・Best・履歴は保存済みのサーバー順位をそのまま表示します。" />
      {visibleState.kind === "loading" ? <LoadingState label="Progressを読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? <ProgressContent progress={visibleState.progress} scriptId={scriptId} onNavigate={onNavigate} /> : null}
    </section>
  );
}
