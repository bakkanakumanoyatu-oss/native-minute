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
import type { PracticeApi } from "./api";
import { isFocusedPractice, safePracticeOrigin, practiceBackRoute, parsePracticeRoute, practiceRoutePath, type PracticeRoute } from "./routes";

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
  const takesBack = useRef<PracticeRoute>({ name: "home" });
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
      if (!isFocusedPractice(routeRef.current) || !isFocusedPractice(next)) origin.current = { name: "home" };
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

  const navigate = useCallback((nextRoute: PracticeRoute, options: { replace?: boolean } = {}) => {
    if (practiceRoutePath(nextRoute) === practiceRoutePath(routeRef.current)) return;
    if (leaveGuard.current && !leaveGuard.current()) return;
    if (isFocusedPractice(nextRoute) && !isFocusedPractice(routeRef.current) && routeRef.current.name !== "voice_setup") {
      origin.current = safePracticeOrigin(routeRef.current);
    }
    if (nextRoute.name === "takes") takesBack.current = routeRef.current;
    routeRef.current = nextRoute;
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
          <button type="button" onClick={() => navigate(practiceBackRoute(route, origin.current))}>← 戻る</button>
          <span aria-label="練習のステップ">{route.name === "listen" ? "1 / 3" : route.name === "record" ? "2 / 3" : "3 / 3"}</span>
          <button type="button" onClick={() => navigate({ name: "home" })}>練習を終了（Home）</button>
        </header>
      ) : <header className="space-header"><div><strong>Native Minute</strong><span>YOUR QUIET SPEAKING SPACE</span></div><button type="button" onClick={() => navigate({ name: "settings" })}>設定</button></header>}
      <div key={practiceRoutePath(route)}>{screen}</div>
      {route.name === "settings" ? <button type="button" className="space-logout" onClick={onLogout}>ログアウト</button> : null}
      {!isFocusedPractice(route) ? <nav className="space-bottom-nav" aria-label="メインナビゲーション">
        {([{ name: "home", label: "Home" }, { name: "scripts", label: "台本" }, { name: "progress", label: "成長" }] as const).map(item => <button key={item.name} type="button" aria-current={route.name === item.name ? "page" : undefined} onClick={() => navigate({ name: item.name })}>{item.label}</button>)}
      </nav> : null}
    </div>
  );
}
