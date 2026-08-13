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
    <div className="score-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ReviewContent({ review }: { review: MobileReview }) {
  return (
    <>
      <div className="review-date">{formatReviewDate(review.reviewedAt ?? review.createdAt)}</div>
      <section className="overall-score" aria-label="総合スコア">
        <span>Overall</span>
        <strong>{review.evaluation.score}</strong>
      </section>
      <div className="score-grid">
        <Score label="Accuracy" value={review.evaluation.accuracyScore} />
        <Score label="Fluency" value={review.evaluation.fluencyScore} />
        <Score label="Rhythm" value={review.evaluation.rhythmScore} />
      </div>

      <section className="result-section">
        <p className="eyebrow">Transcript</p>
        <h2>今回の文字起こし</h2>
        <p className="transcript-copy">{review.transcriptText || "文字起こしは保存されませんでした。"}</p>
      </section>

      <section className="result-section">
        <p className="eyebrow">Evaluation</p>
        <h2>評価</h2>
        <p>{review.evaluation.summaryJa}</p>
        {review.evaluation.strengthsJa.length > 0 ? (
          <ul>
            {review.evaluation.strengthsJa.map((strength, index) => <li key={`${index}-${strength}`}>{strength}</li>)}
          </ul>
        ) : null}
      </section>

      <section className="result-section">
        <p className="eyebrow">Word feedback</p>
        <h2>改善ワード</h2>
        {review.evaluation.weakWords.length > 0 ? (
          <ul className="weak-word-list">
            {review.evaluation.weakWords.map((item, index) => (
              <li key={`${index}-${item.word}`}>
                <div><strong>{item.word}</strong><span>{item.score}</span></div>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
        ) : <p>今回、優先して直す単語はありません。</p>}
      </section>

      <section className="coach-card">
        <p className="eyebrow">Coach</p>
        <h2>{review.coach.titleJa}</h2>
        <p>{review.coach.summaryJa}</p>
        {review.coach.bulletPointsJa.length > 0 ? (
          <ul>{review.coach.bulletPointsJa.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
        ) : null}
        <strong className="next-step-label">次の一歩</strong>
        <p>{review.coach.nextStepJa}</p>
        {review.coach.focusWords.length > 0 ? (
          <div className="focus-words" aria-label="練習する単語">
            {review.coach.focusWords.map((word, index) => <span key={`${index}-${word}`}>{word}</span>)}
          </div>
        ) : null}
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
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Review" title="今回のReview" detail="保存済みの評価とコーチだけを表示しています。" />
      {visibleState.kind === "loading" ? <LoadingState label="Reviewを読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? <ReviewContent review={visibleState.review} /> : null}

      <div className="stacked-actions">
        <button type="button" disabled={visibleState.kind !== "ready"} onClick={() => onNavigate({ name: "record", scriptId })}>
          2回目のTakeを録る
        </button>
        <button type="button" className="secondary-button" onClick={() => onNavigate({ name: "progress", scriptId })}>
          Progressを見る
        </button>
      </div>
    </section>
  );
}
