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

function ProgressResult({ label, take }: {
  label: string;
  take: MobileProgress["scripts"][number]["latestTake"];
}) {
  const date = take ? take.reviewedAt ?? take.createdAt : null;

  return (
    <div>
      <dt lang="en">{label}</dt>
      <dd className="progress-score">
        <span>{take?.score ?? "—"}</span>
        {take ? <span className="progress-meta">/ 100</span> : null}
      </dd>
      {take ? <dd className="progress-meta"><time dateTime={date ?? undefined}>{formatReviewDate(date)}</time></dd> : null}
    </div>
  );
}

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
      <EmptyState title={scriptId ? "この台本の記録を表示できません" : "練習記録はまだありません"}>
        <p>台本一覧から練習する台本を選んでください。</p>
      </EmptyState>
    );
  }

  return (
    <div className="progress-script-stack">
      {visibleScripts.map((item) => (
        <article className="progress-script" key={item.script.id} aria-labelledby={`progress-script-${item.script.id}`}>
          <h2 className="progress-script-title" id={`progress-script-${item.script.id}`}>{item.script.title}</h2>

          {item.latestTake ? (
            <section className="progress-next-step" aria-labelledby={`progress-next-${item.script.id}`}>
              <h3 id={`progress-next-${item.script.id}`}>次の練習では</h3>
              <p className="progress-advice">{item.latestTake.coach.nextStepJa}</p>
              {item.latestTake.coach.focusWords.length > 0 ? (
                <ul className="progress-focus" lang="en" aria-label="次に意識する語">
                  {item.latestTake.coach.focusWords.slice(0, 3).map((word, index) => <li key={`${index}-${word}`}>{word}</li>)}
                </ul>
              ) : null}
            </section>
          ) : (
            <EmptyState title="この台本の練習記録はまだありません">
              <p>最初の録音を評価すると、ここで振り返れます。</p>
            </EmptyState>
          )}

          {/* An overview keeps every script equal, without repeating filled Primary actions. */}
          <button
            type="button"
            className={visibleScripts.length === 1 ? "progress-primary" : "progress-text-action progress-resume"}
            onClick={() => onNavigate({ name: "record", scriptId: item.script.id })}
          >
            <span>{item.latestTake ? <><span className="progress-phrase">もう一度</span><span className="progress-phrase">練習する</span></> : "練習する"}</span>
            <span className="progress-arrow" aria-hidden="true">→</span>
          </button>

          {item.latestTake ? (
            <>
              <section className="progress-comparison" aria-label="最新とベストの結果">
                <dl className="progress-score-pair">
                  <ProgressResult label="Latest" take={item.latestTake} />
                  <ProgressResult label="Best" take={item.bestTake} />
                </dl>
                {item.latestTake.id === item.bestTake?.id ? <p className="progress-meta progress-same-take">LatestとBestは同じTakeです。</p> : null}
              </section>

              <section className="progress-history" aria-labelledby={`progress-history-${item.script.id}`}>
                <h3 id={`progress-history-${item.script.id}`} lang="en">Take history</h3>
                {item.takeHistory.length > 0 ? (
                  <ol className="progress-take-list">
                    {item.takeHistory.map((take) => (
                      <li key={take.id}>
                        <button className="progress-take-row" type="button" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>
                          <time dateTime={take.reviewedAt ?? take.createdAt}>{formatReviewDate(take.reviewedAt ?? take.createdAt)}</time>
                          <span className="progress-take-score" aria-label={`スコア ${take.score}`}>{take.score}</span>
                          <span className="progress-review-action" lang="en">Review <span aria-hidden="true">→</span></span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : <p className="progress-meta">保存済みTakeはありません。</p>}
              </section>
            </>
          ) : null}
        </article>
      ))}
    </div>
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
    <section className="progress-screen" aria-live="polite">
      <ScreenHeading title="Progress" />
      {visibleState.kind === "loading" ? <LoadingState label="記録を読み込み中…" /> : null}
      {visibleState.kind === "error" ? (
        <div className="progress-error">
          <h2>記録を読み込めませんでした</h2>
          <RequestError error={visibleState.error} onRetry={reload} />
        </div>
      ) : null}
      {visibleState.kind === "ready" ? <ProgressContent progress={visibleState.progress} scriptId={scriptId} onNavigate={onNavigate} /> : null}
      <div className="progress-secondary">
        <button type="button" className="progress-text-action" onClick={() => onNavigate({ name: "scripts" })}>台本一覧へ戻る</button>
      </div>
    </section>
  );
}
