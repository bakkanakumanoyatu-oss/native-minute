import { createRoot } from "react-dom/client";
import { VoiceDeletionPanel } from "../../../components/voice/voice-deletion-panel";
import { createPracticeApi } from "../src/practice/api";
import { VoiceDeletionScreen } from "../src/screens/VoiceDeletionScreen";

const root = document.getElementById("root");
const navigation = document.getElementById("navigation");
const component = new URLSearchParams(window.location.search).get("component");
const fixtureUserId = "voice-deletion-component-test-user";

if (!root || !navigation) {
  throw new Error("Voice deletion component test harness root is missing.");
}

const testRoot = root;
const navigationOutput = navigation;
document.body.dataset.authRefreshes = "0";
document.body.dataset.sessionInvalidations = "0";

function incrementBodyCounter(name: "authRefreshes" | "sessionInvalidations") {
  const current = Number(document.body.dataset[name] ?? "0");
  document.body.dataset[name] = String(current + 1);
}

const mobileApi = createPracticeApi({
  auth: {
    getState: () => ({ kind: "authenticated", userId: fixtureUserId }),
    subscribe: () => () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
    requestMagicLink: async () => ({ ok: false as const, reasonCode: "auth_unavailable" }),
    handleCallbackUrl: async () => ({ ok: false as const, reasonCode: "auth_unavailable" }),
    refresh: async () => {
      incrementBodyCounter("authRefreshes");
      return { ok: true as const };
    },
    refreshIfNeeded: async () => ({ ok: true as const }),
    getAccessToken: async () => "fixture-access-token",
    signOut: async () => undefined,
    resetLogin: async () => undefined
  },
  bffBaseUrl: window.location.origin,
  ownerUserId: fixtureUserId,
  onSessionInvalid: () => incrementBodyCounter("sessionInvalidations")
});

function navigate(route: unknown) {
  navigationOutput.textContent = JSON.stringify(route);
}

createRoot(testRoot).render(
  component === "web"
    ? <VoiceDeletionPanel />
    : <VoiceDeletionScreen api={mobileApi} isOnline={true} onNavigate={navigate} />
);
