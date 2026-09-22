import { useEffect, useRef, useState } from "react";
import { AudioObjectUrl } from "../audio/object-url";
import { takeShareController, type TakeShareController, type TakeShareResult } from "../audio/take-share";
import type { MobileReview, PracticeApi } from "../practice/api";

const shareCopy: Record<TakeShareResult, string> = {
  finished: "共有画面を閉じました。", cancelled: "共有をキャンセルしました。",
  unavailable: "この録音は共有できません。", busy: "共有の準備中です。少し待ってからお試しください。",
  failed: "共有できませんでした。通信を確認して再試行してください。",
  "cleanup-failed": "共有用の一時ファイルを片付けられませんでした。もう一度お試しください。"
};

export function SavedTakeAudio({ api, takeId, review, isOnline, sharing = takeShareController }: {
  api: PracticeApi; takeId: string; review?: MobileReview; isOnline: boolean; sharing?: TakeShareController;
}) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error" | "unavailable">("idle");
  const [shareBusy, setShareBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [playHint, setPlayHint] = useState<string | null>(null);
  const objectUrl = useRef(new AudioObjectUrl());
  const media = useRef<HTMLAudioElement | null>(null);
  const retainedMedia = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const online = useRef(isOnline);
  useEffect(() => { online.current = isOnline; }, [isOnline]);
  useEffect(() => api.savedTakeAudioMemory?.subscribe(() => {
    generation.current++;
    locked.current = false;
    const element = media.current;
    try { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } }
    catch { /* Release memory even if native media teardown fails. */ }
    finally { objectUrl.current.clear(); setState(current => current === "loading" ? "error" : "idle"); setShareBusy(false); setMessage(null); setPlayHint(null); }
  }), [api]);
  useEffect(() => {
    generation.current += 1;
    const urls = objectUrl.current;
    return () => {
      generation.current += 1;
      const element = media.current ?? retainedMedia.current;
      try { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } }
      catch { /* Navigation must still release the object URL if media teardown fails. */ }
      retainedMedia.current = null;
      urls.clear();
    };
  }, [api, takeId]);

  async function prepare() {
    if (locked.current || !isOnline) return;
    locked.current = true;
    const request = generation.current;
    setPlayHint(null); setMessage(null);
    try {
      const element = media.current;
      if (!element) return;
      if (state !== "ready") {
        objectUrl.current.clear(); setState("loading");
        const audio = review && api.prepareSavedTakeAudio
          ? await api.prepareSavedTakeAudio(review) : await api.downloadTakeAudio(takeId);
        if (request !== generation.current) return;
        if (audio.kind !== "success") { setState(audio.kind === "not-found" ? "unavailable" : "error"); return; }
        const source = objectUrl.current.replace(audio.audio);
        // The mounted player can start as soon as the owned audio arrives, without a second tap.
        element.src = source;
        setState("ready");
      }
      try { await element.play(); }
      catch {
        if (request === generation.current) {
          api.savedTakeAudioMemory?.invalidate();
          objectUrl.current.clear();
          setState("error");
          setPlayHint("再生を開始できませんでした。「▶ 自分の録音を再生」をもう一度押してください。");
        }
      }
    } catch { if (request === generation.current) { api.savedTakeAudioMemory?.invalidate(); objectUrl.current.clear(); setState("error"); } }
    finally { if (request === generation.current) locked.current = false; }
  }

  async function share() {
    if (locked.current || !isOnline) return;
    locked.current = true; setShareBusy(true); setMessage(null);
    media.current?.pause();
    const request = generation.current;
    try {
      // Re-fetch this exact Take on every export; do not reuse an old playable Blob.
      const result = await sharing.share(() => api.downloadTakeAudio(takeId), () => request === generation.current && online.current);
      if (request === generation.current) setMessage(shareCopy[result]);
    } finally {
      if (request === generation.current) { locked.current = false; setShareBusy(false); }
    }
  }

  return <div className="saved-take-audio" aria-busy={state === "loading" || shareBusy}>
    <div className="saved-take-actions">
      <button type="button" className="review-text-action" disabled={!isOnline || state === "loading" || shareBusy} onClick={() => void prepare()}>
        {state === "loading" ? "録音を読み込んでいます…" : state === "error" || state === "unavailable" ? "録音をもう一度読み込む" : "▶ 自分の録音を再生"}
      </button>
      <button type="button" className="review-text-action" disabled={!isOnline || !sharing.supported() || state === "loading" || shareBusy || state === "unavailable"}
        onClick={() => void share()}>{shareBusy ? "共有を準備しています…" : "共有"}</button>
    </div>
    <audio ref={element => { media.current = element; if (element) retainedMedia.current = element; }} controls hidden={state !== "ready"} preload="metadata" aria-label="保存済みの自分の録音"
      onPlay={() => setPlayHint(null)} onError={() => { api.savedTakeAudioMemory?.invalidate(); objectUrl.current.clear(); setPlayHint(null); setState("error"); }} />
    {state === "error" ? <p role="status">録音を再生できませんでした。通信を確認して再試行してください。</p> : null}
    {state === "unavailable" ? <p role="status">この保存済み録音は現在利用できません。</p> : null}
    {state === "ready" && playHint ? <p role="status">{playHint}</p> : null}
    {!sharing.supported() ? <p className="review-meta">共有はiPhoneアプリで利用できます。</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
