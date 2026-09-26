import { useEffect, useRef, useState } from "react";
import { AudioObjectUrl } from "../audio/object-url";
import type { MobileBrushUpView, MobileReview } from "../lib/api";
import type { PracticeApi } from "../practice/api";

function BrushUpAudioPlayer({ api, audioId, label, isOnline }: {
  api: PracticeApi; audioId: string; label: string; isOnline: boolean;
}) {
  const objectUrl = useRef(new AudioObjectUrl());
  const media = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const urls = objectUrl.current;
    const audioElement = media.current;
    generation.current += 1;
    return () => {
      generation.current += 1;
      audioElement?.pause();
      urls.clear();
    };
  }, [audioId]);

  async function play() {
    if (!isOnline || loading) return;
    const request = generation.current;
    setError(false);
    if (!ready) {
      setLoading(true);
      const result = await api.downloadAudio(audioId);
      if (request !== generation.current) return;
      setLoading(false);
      if (result.kind !== "success") { setError(true); return; }
      const source = objectUrl.current.replace(result.audio);
      if (media.current) media.current.src = source;
      setReady(true);
    }
    try { await media.current?.play(); }
    catch { if (request === generation.current) setError(true); }
  }

  return <div className="brush-up-audio">
    <p className="review-meta">{label}</p>
    <button type="button" className="review-text-action" disabled={!isOnline || loading} onClick={() => void play()}>
      {loading ? "読み込んでいます…" : `▶ ${label}を再生`}
    </button>
    <audio ref={media} controls hidden={!ready} preload="none" aria-label={label} />
    {error ? <p role="alert">音声を再生できませんでした。もう一度お試しください。</p> : null}
  </div>;
}

export function BrushUpControl({ api, review, isOnline }: { api: PracticeApi; review: MobileReview; isOnline: boolean }) {
  const [view, setView] = useState<MobileBrushUpView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisionId = review.scriptSnapshot?.revisionId;

  async function refresh() {
    const result = await api.getBrushUpView?.(review.scriptId, review.takeId);
    if (result?.kind === "success") { setView(result.view); return true; }
    setError("候補の状態を確認できませんでした。通信を確認して再試行してください。");
    return false;
  }

  useEffect(() => {
    let active = true;
    void api.getBrushUpView?.(review.scriptId, review.takeId).then(result => {
      if (!active) return;
      if (result.kind === "success") setView(result.view);
      else setError("候補の状態を確認できませんでした。通信を確認して再試行してください。");
      setLoading(false);
    });
    return () => { active = false; };
  }, [api, review.scriptId, review.takeId]);

  async function create() {
    if (!revisionId || !consented || busy || !isOnline) return;
    setBusy(true); setError(null);
    try {
      const consent = await api.acceptBrushUpConsent?.({ scriptId: review.scriptId, takeId: review.takeId, revisionId });
      if (consent?.kind !== "success") { setError("専用同意を保存できませんでした。もう一度お試しください。"); return; }
      const result = await api.generateBrushUpCandidate?.({
        scriptId: review.scriptId, takeId: review.takeId, revisionId,
        consentId: consent.consentId, operationId: crypto.randomUUID()
      });
      if (result?.kind !== "success") setError("候補を作れませんでした。状態を確認してから再試行してください。");
      await refresh();
    } finally { setBusy(false); }
  }

  async function decide(decision: "adopt" | "reject" | "rollback" | "retry_cleanup") {
    if (!view || busy || !isOnline) return;
    setBusy(true); setError(null);
    try {
      const result = await api.decideBrushUpCandidate?.(view.candidateId, decision);
      if (result?.kind !== "success") setError("候補を変更できませんでした。もう一度お試しください。");
      await refresh();
    } finally { setBusy(false); }
  }

  const canCreate = review.brushUpCurrentRevision && (!view || (["rejected", "rolled_back", "failed"].includes(view.status) && !view.cleanupPending));
  return <section className="review-section brush-up-control" aria-label="台本専用のお手本候補">
    <h2>このTakeから台本専用のお手本候補を作る</h2>
    <p>選んだTakeを元に、同じ版の台本だけで使う別のお手本候補を作ります。聞き比べてから自分で選べます。</p>
    {!review.brushUpCurrentRevision ? <p>これは以前の台本の版です。新しい候補は現在の版のTakeから作れます。</p> : null}
    {loading ? <p>候補を確認しています…</p> : null}
    {canCreate && !loading ? <>
      <label><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} /> この保存済みTakeの録音を外部音声サービスへ送り、一時的なvoiceと同じ台本のお手本候補を作ることに同意します。</label>
      <button type="button" className="review-primary" disabled={!isOnline || !consented || busy} onClick={() => void create()}>
        <span>{busy ? "候補を準備しています…" : "同意して候補を作る"}</span>
      </button>
    </> : null}
    {view?.status === "preparing" || view?.status === "audio_staged" ? <p>候補を準備しています。少し待ってから表示を更新してください。</p> : null}
    {view?.cleanupPending ? <p>一時音声または候補音声の片付けを確認中です。</p> : null}
    {view?.manualCleanupRequired ? <p role="alert">一時voiceの作成結果を確認できません。運営による確認が必要です。</p> : null}
    {view?.cleanupPending && !view.manualCleanupRequired ? <button type="button" className="review-text-action" disabled={!isOnline || busy} onClick={() => void decide("retry_cleanup")}>片付けを再確認</button> : null}
    {(view?.status === "ready" || view?.status === "adopted") && view.baselineAudioId && view.candidateAudioId ? <div className="brush-up-comparison">
      <BrushUpAudioPlayer api={api} audioId={view.baselineAudioId} label="元のお手本" isOnline={isOnline} />
      <BrushUpAudioPlayer api={api} audioId={view.candidateAudioId} label="候補のお手本" isOnline={isOnline} />
    </div> : null}
    {view?.status === "ready" ? <div className="saved-take-actions">
      {review.brushUpCurrentRevision ? <button type="button" className="review-text-action" disabled={!isOnline || busy} onClick={() => void decide("adopt")}>この台本の版に採用</button> : null}
      <button type="button" className="review-text-action" disabled={!isOnline || busy} onClick={() => void decide("reject")}>却下</button>
    </div> : null}
    {view?.status === "adopted" ? <button type="button" className="review-text-action" disabled={!isOnline || busy} onClick={() => void decide("rollback")}>元のお手本に戻す</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
