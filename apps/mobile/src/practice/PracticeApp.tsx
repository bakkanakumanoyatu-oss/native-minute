import { useCallback, useEffect, useState } from "react";
import { ListenScreen } from "../screens/ListenScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { RecordScreen } from "../screens/RecordScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { ScriptsScreen } from "../screens/ScriptsScreen";
import { VoiceSetupScreen } from "../screens/VoiceSetupScreen";
import type { PracticeApi } from "./api";
import { parsePracticeRoute, practiceRoutePath, type PracticeRoute } from "./routes";

export const MOBILE_ROUTE_TRANSITION_MEASURE = "mobile_route_transition";

export function recordPracticeRouteTransition(
  startedAt: number,
  endedAt = performance.now(),
  performanceSink: Pick<Performance, "clearMeasures" | "measure"> = performance
) {
  const durationMs = Math.max(0, endedAt - startedAt);
  try {
    performanceSink.clearMeasures(MOBILE_ROUTE_TRANSITION_MEASURE);
    performanceSink.measure(MOBILE_ROUTE_TRANSITION_MEASURE, {
      start: startedAt,
      duration: durationMs
    });
  } catch {
    // Performance collection must never change navigation behavior.
  }
  return durationMs;
}

export function PracticeApp({
  api,
  isOnline,
  onLogout
}: {
  api: PracticeApi;
  isOnline: boolean;
  onLogout: () => void;
}) {
  const [route, setRoute] = useState<PracticeRoute>(() => parsePracticeRoute(window.location));

  const finishRouteTransition = useCallback((startedAt: number) => {
    window.requestAnimationFrame(() => recordPracticeRouteTransition(startedAt));
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const startedAt = performance.now();
      setRoute(parsePracticeRoute(window.location));
      finishRouteTransition(startedAt);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [finishRouteTransition]);

  useEffect(() => {
    const canonicalPath = practiceRoutePath(route);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [route]);

  const navigate = useCallback((nextRoute: PracticeRoute, options: { replace?: boolean } = {}) => {
    const startedAt = performance.now();
    const path = practiceRoutePath(nextRoute);
    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: "auto" });
    finishRouteTransition(startedAt);
  }, [finishRouteTransition]);

  let screen;
  switch (route.name) {
    case "scripts":
      screen = <ScriptsScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "voice_setup":
      screen = <VoiceSetupScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "listen":
      screen = <ListenScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "record":
      screen = <RecordScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "review":
      screen = <ReviewScreen api={api} scriptId={route.scriptId} takeId={route.takeId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "progress":
      screen = <ProgressScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
  }

  return (
    <div className="practice-shell">
      {!isOnline ? <div className="offline-banner" role="status">オフラインです。接続後に再試行できます。</div> : null}
      <nav className="practice-nav" aria-label="練習メニュー">
        <button type="button" className={route.name === "scripts" ? "is-active" : ""} onClick={() => navigate({ name: "scripts" })}>
          Scripts
        </button>
        <button type="button" className={route.name === "progress" ? "is-active" : ""} onClick={() => navigate({ name: "progress" })}>
          Progress
        </button>
        <button type="button" onClick={onLogout}>ログアウト</button>
      </nav>
      <div key={practiceRoutePath(route)}>{screen}</div>
    </div>
  );
}
