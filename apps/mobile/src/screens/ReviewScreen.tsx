import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  MobileReview,
  PracticeApi,
  PracticeRequestFailure
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { TakeMetadataEditor } from "./TakeMetadataEditor";
import { SavedTakeAudio } from "./SavedTakeAudio";
import { LoadingState, RequestError, formatReviewDate } from "./ScreenParts";

type ReviewState =
  | { kind: "loading" }
  | { kind: "ready"; review: MobileReview; scriptTitle: string }
  | { kind: "error"; error: PracticeRequestFailure };

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt lang="en">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReviewContent({
  review,
  onNavigate,
  metadataActions
}: {
  review: MobileReview;
  metadataActions?: ReactNode;
  onNavigate: (route: PracticeRoute) => void;
}) {
  return (
    <>
      <p className="review-date">{formatReviewDate(review.reviewedAt ?? review.createdAt)}</p>
      <section className="review-next-step" aria-labelledby="review-next-title">
        <h2 id="review-next-title">次の一歩</h2>
        {review.coach.focusWords.length > 0 ? (
          <ul className="review-focus" lang="en" aria-label="次に意識する語">
            {review.coach.focusWords.map((word, index) => (
              <li key={`${index}-${word}`}>
                {review.coach.focusWords.length === 2 && index === 1 ? (
                  <span className="review-focus-separator" aria-hidden="true">/</span>
                ) : null}
                <span className="review-focus-word">{word}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="review-advice">{review.coach.nextStepJa}</p>
        <button type="button" className="review-primary" onClick={() => onNavigate({ name: "record", scriptId: review.scriptId })}>
          <span>次のTakeを録る</span><span className="review-arrow" aria-hidden="true">→</span>
        </button>
        <div className="review-listen">
          <button type="button" className="review-text-action" onClick={() => onNavigate({ name: "listen", scriptId: review.scriptId })}>
            お手本を聞き直す
          </button>
        </div>
      </section>

      {metadataActions}
      <section className="review-results" aria-labelledby="review-result-title">
        <div className="review-result-top">
          <h2 id="review-result-title">今回の結果</h2>
          <p className="review-score" aria-label={`総合スコア ${review.evaluation.score} / 100`}>
            <span className="review-score-value">{review.evaluation.score}</span>
            <span className="review-meta">/ 100</span>
          </p>
        </div>
        <dl className="review-metrics">
          <Score label="Accuracy" value={review.evaluation.accuracyScore} />
          <Score label="Fluency" value={review.evaluation.fluencyScore} />
          <Score label="Rhythm" value={review.evaluation.rhythmScore} />
        </dl>
      </section>

      <section className="review-section review-weak" aria-labelledby="review-weak-title">
        <div className="review-result-top">
          <h2 id="review-weak-title">改善ワード</h2>
          {review.evaluation.weakWords.length > 0 ? <span className="review-meta">単語スコア</span> : null}
        </div>
        {review.evaluation.weakWords.length > 0 ? (
          <ul className="review-weak-list">
            {review.evaluation.weakWords.map((item, index) => (
              <li key={`${index}-${item.word}`}>
                <div className="review-weak-heading">
                  <strong lang="en">{item.word}</strong>
                  <span className="review-meta" aria-label={`単語スコア ${item.score}`}>{item.score}</span>
                </div>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
        ) : <p className="review-empty">今回、優先して直す単語はありません。</p>}
      </section>

      <section className="review-section review-transcript-section" aria-labelledby="review-transcript-title">
        <h2 id="review-transcript-title" lang="en">Transcript</h2>
        <p className="review-transcript" lang={review.transcriptText ? "en" : "ja"}>
          {review.transcriptText || "文字起こしは保存されませんでした。"}
        </p>
      </section>

      <section className="review-section review-feedback" aria-labelledby="review-feedback-title">
        <h2 id="review-feedback-title">詳細feedback</h2>
        <div className="review-feedback-block">
          <h3>評価</h3>
          <p>{review.evaluation.summaryJa}</p>
          {review.evaluation.strengthsJa.length > 0 ? (
            <ul>
              {review.evaluation.strengthsJa.map((strength, index) => <li key={`${index}-${strength}`}>{strength}</li>)}
            </ul>
          ) : null}
        </div>
        <div className="review-feedback-block">
          <h3>{review.coach.titleJa}</h3>
          <p>{review.coach.summaryJa}</p>
          {review.coach.bulletPointsJa.length > 0 ? (
            <ul>{review.coach.bulletPointsJa.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          ) : null}
        </div>
      </section>
    </>
  );
}

export function ReviewScreen({
  api,
  scriptId,
  takeId,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  scriptId: string;
  takeId: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
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

    void Promise.all([api.getReview(scriptId, takeId), api.getScript(scriptId)]).then(([result, script]) => {
      if (!active) return;
      setState(result.kind !== "success" ? { kind: "error", error: result }
        : script.kind !== "success" ? { kind: "error", error: script }
        : { kind: "ready", review: result.review, scriptTitle: script.script.title });
    }).catch(() => {
      if (active) setState({ kind: "error", error: { kind: "network-error" } });
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, reloadKey, scriptId, takeId]);

  const visibleState: ReviewState = isOnline
    ? state
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="review-screen" aria-live="polite">
      <p className="review-kicker">結果</p>
      {visibleState.kind === "loading" ? <LoadingState label="Reviewを読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? (
        <>
          <div className="take-identity">
            <h1 className={visibleState.review.displayName ? "take-name" : "take-script-title"}>{visibleState.review.displayName ?? visibleState.scriptTitle}</h1>
            {visibleState.review.displayName ? <p className="review-meta">台本: <span lang="en">{visibleState.scriptTitle}</span></p> : null}
          </div>
          <ReviewContent review={visibleState.review} onNavigate={onNavigate} metadataActions={<TakeMetadataEditor key={takeId} api={api} review={visibleState.review} onReload={reload}
            onSaved={metadata => setState(current => current.kind === "ready" && current.review.takeId === metadata.takeId
              ? { ...current, review: { ...current.review, ...metadata } } : current)}>
              <p className="saved-take-name">{visibleState.review.displayName ?? visibleState.scriptTitle}</p>
              {visibleState.review.displayName ? <p className="review-meta">台本: {visibleState.scriptTitle}</p> : null}
              <p className="review-meta">{formatReviewDate(visibleState.review.reviewedAt ?? visibleState.review.createdAt)} · スコア {visibleState.review.evaluation.score}</p>
              <SavedTakeAudio key={takeId} api={api} takeId={takeId} isOnline={isOnline} />
            </TakeMetadataEditor>} />
        </>
      ) : (
        <button type="button" className="review-primary" disabled>
          <span>次のTakeを録る</span><span className="review-arrow" aria-hidden="true">→</span>
        </button>
      )}
      <div className="review-progress">
        <button type="button" className="review-text-action" onClick={() => onNavigate({ name: "takes", scriptId })}>
          録音履歴を見る
        </button>
      </div>
    </section>
  );
}
