import { useEffect } from "react";
import type {
  MobileProgress,
  PracticeApi
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { EmptyState, LoadingState, RequestError, ScreenHeading, formatReviewDate } from "./ScreenParts";

import { useSavedProgress } from "../practice/use-saved-progress";

function ProgressResult({ label, take }: {
  label: string;
  take: MobileProgress["scripts"][number]["latestTake"];
}) {
  const date = take ? take.reviewedAt ?? take.createdAt : null;

  return (
    <div>
      <dt>{label}<span className="progress-score-label">総合スコア</span></dt>
      <dd className="progress-score">
        <span>{take?.score ?? "—"}</span>
        {take ? <span className="progress-meta">/ 100</span> : null}
      </dd>
      {take ? <dd className="progress-meta"><time dateTime={date ?? undefined}>{formatReviewDate(date)}</time></dd> : null}
    </div>
  );
}

export function ProgressDetails({
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
            onClick={() => onNavigate({ name: "listen", scriptId: item.script.id })}
          >
            <span>{item.latestTake ? <><span className="progress-phrase">もう一度</span><span className="progress-phrase">練習する</span></> : "練習する"}</span>
            <span className="progress-arrow" aria-hidden="true">→</span>
          </button>

          {item.latestTake ? (
            <>
              <section className="progress-comparison" aria-label="最新とベストの結果">
                <dl className="progress-score-pair">
                  <ProgressResult label="最新の結果" take={item.latestTake} />
                  <ProgressResult label="ベスト結果" take={item.bestTake} />
                </dl>
                {item.latestTake.id === item.bestTake?.id ? <p className="progress-meta progress-same-take">最新とベストは同じTake（録音）です。</p> : null}
              </section>

              <section className="progress-history" aria-labelledby={`progress-history-${item.script.id}`}>
                <h3 id={`progress-history-${item.script.id}`}>これまでの練習</h3>
                <p className="progress-meta">保存したTake（録音）の履歴</p>
                {item.takeHistory.length > 0 ? (
                  <ol className="progress-take-list">
                    {item.takeHistory.map((take) => (
                      <li key={take.id}>
                        <button className="progress-take-row" type="button" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>
                          <span className="progress-take-identity">
                            <time dateTime={take.reviewedAt ?? take.createdAt}>{formatReviewDate(take.reviewedAt ?? take.createdAt)}</time>
                            {take.id === item.latestTake?.id || take.id === item.bestTake?.id ? <span className="progress-take-status">
                              {take.id === item.latestTake?.id ? <span>最新</span> : null}
                              {take.id === item.bestTake?.id ? <span>ベスト</span> : null}
                            </span> : null}
                          </span>
                          <span className="progress-take-score" aria-label={`総合スコア ${take.score} / 100`}><span className="progress-score-label">総合スコア</span>{take.score}<span className="progress-score-unit"> / 100</span></span>
                          <span className="progress-review-action">結果を見る <span aria-hidden="true">→</span></span>
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

// Selection is explicit route state; all detail data stays server-selected.
export function ProgressContent({ progress, scriptId, onNavigate }: {
  progress: MobileProgress; scriptId?: string; onNavigate: (route: PracticeRoute) => void;
}) {
  useEffect(() => {
    if (!scriptId) return;
    const frame = requestAnimationFrame(() => {
      const detail = document.getElementById("progress-selected-detail");
      detail?.scrollIntoView({ block: "start" });
      detail?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [scriptId]);
  const practiced = new Set(progress.scripts.filter(item => item.takeCount > 0).map(item => item.script.id)).size;
  return <>
    <section className="progress-overview-summary" aria-labelledby="growth-title">
      <p className="section-kicker">これまでの積み重ね</p>
      <h2 id="growth-title">あなたの1分が、残っています。</h2>
      <dl><div><dt>練習した台本</dt><dd>{practiced}<span>本</span></dd></div><div><dt>録音・評価済み</dt><dd>{progress.totalReviewedTakes}<span>件</span></dd></div></dl>
      <p>保存した練習の記録です。</p>
    </section>
    <section className="progress-script-picker" aria-labelledby="select-script-title">
      <h2 id="select-script-title">台本ごとに振り返る</h2>
      <p>保存済みの台本 {progress.totalScripts}本</p>
      <ul>{progress.scripts.map(item => <li key={item.script.id}><button type="button" aria-current={scriptId === item.script.id ? "true" : undefined} onClick={() => onNavigate({ name: "progress", scriptId: item.script.id })}>
        <span><strong lang={item.script.locale}>{item.script.title}</strong><small>{item.takeCount ? `録音・評価済み ${item.takeCount}件` : "まだ練習記録がありません"}</small></span><span className="progress-selected">{scriptId === item.script.id ? "表示中" : "見る →"}</span>
      </button></li>)}</ul>
    </section>
    {scriptId ? <section id="progress-selected-detail" tabIndex={-1} className="progress-detail" aria-label="選んだ台本の記録"><p className="section-kicker">この台本の記録</p><ProgressDetails progress={progress} scriptId={scriptId} onNavigate={onNavigate} /></section> : <p className="progress-selection-note">台本を選ぶと、次の練習・最新とベスト・履歴を確認できます。</p>}
    {!progress.scripts.length ? <EmptyState title="練習記録はまだありません"><p>台本を作って、最初の1分を始めましょう。</p></EmptyState> : null}
  </>;
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
  const { state: visibleState, retry: reload } = useSavedProgress(api, isOnline);

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
      {visibleState.kind === "ready" && visibleState.refreshing ? <p role="status" className="space-meta">前回取得した記録を表示しています。最新情報を確認中…</p> : null}
      {visibleState.kind === "ready" ? <ProgressContent progress={visibleState.progress} scriptId={scriptId} onNavigate={onNavigate} /> : null}
      <div className="progress-secondary">
        <button type="button" className="progress-text-action" onClick={() => onNavigate({ name: "scripts" })}>台本一覧へ戻る</button>
      </div>
    </section>
  );
}
