import { useCallback, useEffect, useState } from "react";
import type {
  MobileReview,
  PracticeApi,
  PracticeRequestFailure
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading, formatReviewDate } from "./ScreenParts";

type ReviewState =
  | { kind: "loading" }
  | { kind: "ready"; review: MobileReview }
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
  onNavigate
}: {
  review: MobileReview;
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

    void api.getReview(scriptId, takeId).then((result) => {
      if (!active) {
        return;
      }
      setState(
        result.kind === "success"
          ? { kind: "ready", review: result.review }
          : { kind: "error", error: result }
      );
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
      <ScreenHeading title="Review" />
      {visibleState.kind === "loading" ? <LoadingState label="Reviewを読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? (
        <ReviewContent review={visibleState.review} onNavigate={onNavigate} />
      ) : (
        <button type="button" className="review-primary" disabled>
          <span>次のTakeを録る</span><span className="review-arrow" aria-hidden="true">→</span>
        </button>
      )}
      <div className="review-progress">
        <button type="button" className="review-text-action" onClick={() => onNavigate({ name: "progress", scriptId })}>
          成長を見る
        </button>
      </div>
    </section>
  );
}
