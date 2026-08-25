export type PracticeRoute =
  | { name: "scripts" }
  | { name: "settings" }
  | { name: "account_deletion" }
  | { name: "voice_deletion" }
  | { name: "voice_setup"; scriptId?: string }
  | { name: "listen"; scriptId: string }
  | { name: "record"; scriptId: string }
  | { name: "review"; scriptId: string; takeId: string }
  | { name: "progress"; scriptId?: string };

const SAFE_ROUTE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function safeSegment(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value);
    return SAFE_ROUTE_SEGMENT.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parsePracticeRoute(location: Pick<Location, "pathname" | "search">): PracticeRoute {
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 1 && segments[0] === "scripts") {
    return { name: "scripts" };
  }

  if (segments.length === 1 && segments[0] === "settings") {
    return { name: "settings" };
  }

  if (segments.length === 2 && segments[0] === "settings" && segments[1] === "account-deletion") {
    return { name: "account_deletion" };
  }

  if (segments.length === 2 && segments[0] === "settings" && segments[1] === "voice-data") {
    return { name: "voice_deletion" };
  }

  if (segments.length === 2 && segments[0] === "setup" && segments[1] === "voice") {
    const requestedScriptId = new URLSearchParams(location.search).get("scriptId") ?? undefined;
    const scriptId = safeSegment(requestedScriptId);
    return scriptId ? { name: "voice_setup", scriptId } : { name: "voice_setup" };
  }

  if (segments.length === 3 && segments[0] === "scripts") {
    const scriptId = safeSegment(segments[1]);
    if (scriptId && segments[2] === "listen") {
      return { name: "listen", scriptId };
    }
    if (scriptId && segments[2] === "record") {
      return { name: "record", scriptId };
    }
  }

  if (segments.length === 4 && segments[0] === "scripts" && segments[2] === "review") {
    const scriptId = safeSegment(segments[1]);
    const takeId = safeSegment(segments[3]);
    if (scriptId && takeId) {
      return { name: "review", scriptId, takeId };
    }
  }

  if (segments.length === 1 && segments[0] === "progress") {
    const requestedScriptId = new URLSearchParams(location.search).get("scriptId") ?? undefined;
    const scriptId = safeSegment(requestedScriptId);
    return scriptId ? { name: "progress", scriptId } : { name: "progress" };
  }

  return { name: "scripts" };
}

export function practiceRoutePath(route: PracticeRoute) {
  switch (route.name) {
    case "scripts":
      return "/scripts";
    case "settings":
      return "/settings";
    case "account_deletion":
      return "/settings/account-deletion";
    case "voice_deletion":
      return "/settings/voice-data";
    case "voice_setup":
      return route.scriptId
        ? `/setup/voice?scriptId=${encodeURIComponent(route.scriptId)}`
        : "/setup/voice";
    case "listen":
      return `/scripts/${encodeURIComponent(route.scriptId)}/listen`;
    case "record":
      return `/scripts/${encodeURIComponent(route.scriptId)}/record`;
    case "review":
      return `/scripts/${encodeURIComponent(route.scriptId)}/review/${encodeURIComponent(route.takeId)}`;
    case "progress":
      return route.scriptId
        ? `/progress?scriptId=${encodeURIComponent(route.scriptId)}`
        : "/progress";
  }
}

export function isPracticePath(pathname: string) {
  if (pathname === "/scripts" || pathname === "/progress" || pathname === "/setup/voice" || pathname === "/settings" || pathname === "/settings/account-deletion" || pathname === "/settings/voice-data") {
    return true;
  }

  const route = parsePracticeRoute({ pathname, search: "" });
  return route.name !== "scripts";
}
