import { useCallback, useEffect, useRef, useState } from "react";
import { HomeScreen } from "../screens/HomeScreen";
import { TakesScreen } from "../screens/TakesScreen";
import { ListenScreen } from "../screens/ListenScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { RecordScreen } from "../screens/RecordScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { ScriptsScreen } from "../screens/ScriptsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { VoiceSetupScreen } from "../screens/VoiceSetupScreen";
import { AccountDeletionScreen } from "../screens/AccountDeletionScreen";
import { VoiceDeletionScreen } from "../screens/VoiceDeletionScreen";
import brandMark from "../assets/native-minutes-mark-icon.png";
import type { PracticeApi } from "./api";
import { isFocusedPractice, safePracticeOrigin, practiceBackRoute, parsePracticeRoute, practiceRoutePath, type PracticeRoute, type ReviewReturnOrigin } from "./routes";

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

  const routeRef = useRef(route);
  const origin = useRef<PracticeRoute>({ name: "home" });
  const recordOrigin = useRef<PracticeRoute | null>(null);
  const listenOrigin = useRef<PracticeRoute | null>(null);
  const reviewOrigin = useRef<ReviewReturnOrigin | null>(null);
  const takesBack = useRef<PracticeRoute>({ name: "home" });
  const positions = useRef(new Map<string, number>());
  const progressSelection = useRef<PracticeRoute>({ name: "progress" });
  const leaveGuard = useRef<(() => boolean) | null>(null);
  const registerLeaveGuard = useCallback((guard: (() => boolean) | null) => { leaveGuard.current = guard; }, []);

  const finishRouteTransition = useCallback((startedAt: number) => {
    window.requestAnimationFrame(() => recordPracticeRouteTransition(startedAt));
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const startedAt = performance.now();
      const next = parsePracticeRoute(window.location);
      if (leaveGuard.current && !leaveGuard.current()) {
        window.history.replaceState(null, "", practiceRoutePath(routeRef.current));
        return;
      }
      if (["home", "scripts", "progress", "takes", "review"].includes(routeRef.current.name)) {
        const path = practiceRoutePath(routeRef.current);
        positions.current.delete(path); positions.current.set(path, window.scrollY);
        if (positions.current.size > 24) positions.current.delete(positions.current.keys().next().value!);
      }
      if (!isFocusedPractice(routeRef.current) || !isFocusedPractice(next)) origin.current = { name: "home" };
      // Browser history and deep links do not supply trusted return context.
      recordOrigin.current = null;
      listenOrigin.current = null;
      reviewOrigin.current = null;
      routeRef.current = next;
      setRoute(next);
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

  useEffect(() => {
    if (route.name === "progress") progressSelection.current = route;
    const path = practiceRoutePath(route);
    const top = positions.current.get(path) ?? 0;
    const frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
    return () => cancelAnimationFrame(frame);
  }, [route]);

  const navigate = useCallback((nextRoute: PracticeRoute, options: { replace?: boolean } = {}) => {
    if (practiceRoutePath(nextRoute) === practiceRoutePath(routeRef.current)) return;
    if (leaveGuard.current && !leaveGuard.current()) return;
    if (["home", "scripts", "progress", "takes", "review"].includes(routeRef.current.name)) {
      const currentPath = practiceRoutePath(routeRef.current);
      positions.current.delete(currentPath);
      positions.current.set(currentPath, window.scrollY);
      if (positions.current.size > 24) positions.current.delete(positions.current.keys().next().value!);
    }
    if (nextRoute.name === "takes" && routeRef.current.name !== "takes" && !(routeRef.current.name === "review"
      && reviewOrigin.current?.origin.name === "takes"
      && practiceRoutePath(nextRoute) === practiceRoutePath(reviewOrigin.current.origin))) {
      // Returning from a saved Review must not replace My Takes' own parent with that Review.
      takesBack.current = routeRef.current;
    }
    if (nextRoute.name === "review" && (routeRef.current.name === "home"
      || routeRef.current.name === "takes" || routeRef.current.name === "progress")) {
      reviewOrigin.current = { review: nextRoute, origin: routeRef.current };
    } else if (reviewOrigin.current && (!isFocusedPractice(nextRoute)
      || !("scriptId" in nextRoute) || nextRoute.scriptId !== reviewOrigin.current.review.scriptId
      || (nextRoute.name === "review" && nextRoute.takeId !== reviewOrigin.current.review.takeId))) {
      // Retain the entry through same-script Listen/Record detours, not a new Take or session.
      reviewOrigin.current = null;
    }
    if (nextRoute.name === "listen" && routeRef.current.name === "review") {
      listenOrigin.current = routeRef.current;
    } else if (!((nextRoute.name === "listen" || nextRoute.name === "record")
      && (routeRef.current.name === "listen" || routeRef.current.name === "record")
      && nextRoute.scriptId === routeRef.current.scriptId)) {
      // Keep Review context through Listen → Record → Back, but never across other sessions.
      listenOrigin.current = null;
    }
    recordOrigin.current = nextRoute.name === "record" ? routeRef.current : null;
    if (isFocusedPractice(nextRoute) && !isFocusedPractice(routeRef.current) && routeRef.current.name !== "voice_setup") {
      origin.current = safePracticeOrigin(routeRef.current);
    }
    routeRef.current = nextRoute;
    const startedAt = performance.now();
    const path = practiceRoutePath(nextRoute);
    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
    finishRouteTransition(startedAt);
  }, [finishRouteTransition]);

  let screen;
  switch (route.name) {
    case "home":
      screen = <HomeScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "takes":
      screen = <TakesScreen favorites={route.favorites} api={api} isOnline={isOnline} scriptId={route.scriptId} onNavigate={navigate} onBack={() => navigate(takesBack.current)} />;
      break;
    case "scripts":
      screen = <ScriptsScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "settings":
      screen = <SettingsScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "account_deletion":
      screen = <AccountDeletionScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "voice_deletion":
      screen = <VoiceDeletionScreen api={api} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "voice_setup":
      screen = <VoiceSetupScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "listen":
      screen = <ListenScreen api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
      break;
    case "record":
      screen = <RecordScreen registerLeaveGuard={registerLeaveGuard} api={api} scriptId={route.scriptId} isOnline={isOnline} onNavigate={navigate} />;
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
      {isFocusedPractice(route) ? (
        <header className="practice-focus-header" aria-label="練習の移動">
          <button type="button" onClick={() => navigate(practiceBackRoute(route, origin.current, recordOrigin.current, listenOrigin.current, reviewOrigin.current))}>← 戻る</button>
          <span aria-label="練習のステップ">{route.name === "listen" ? "1 / 3" : route.name === "record" ? "2 / 3" : "3 / 3"}</span>
          <button type="button" onClick={() => navigate({ name: "home" })}>練習を終了（Home）</button>
        </header>
      ) : <header className="space-header"><div><img className="brand-mark" src={brandMark} alt="Native Minutes" /><span>YOUR QUIET SPEAKING SPACE</span></div><button type="button" onClick={() => navigate({ name: "settings" })}>設定</button></header>}
      <div key={practiceRoutePath(route)}>{screen}</div>
      {route.name === "settings" ? <button type="button" className="space-logout" onClick={onLogout}>ログアウト</button> : null}
      {!isFocusedPractice(route) ? <nav className="space-bottom-nav" aria-label="メインナビゲーション">
        {([{ name: "home", label: "Home" }, { name: "scripts", label: "台本" }, { name: "progress", label: "成長" }] as const).map(item => <button key={item.name} type="button" aria-current={route.name === item.name ? "page" : undefined} onClick={() => navigate(item.name === "progress" ? progressSelection.current : { name: item.name })}>{item.label}</button>)}
      </nav> : null}
    </div>
  );
}
