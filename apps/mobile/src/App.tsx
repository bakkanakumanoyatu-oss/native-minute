import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth, initialHealthState, type HealthConnectionState } from "./lib/api";
import { mobileEnvironment } from "./lib/environment";

type ConnectionPanelProps = {
  state: HealthConnectionState;
  onRetry: () => void;
};

const STATUS_COPY: Record<HealthConnectionState["kind"], { title: string; detail: string }> = {
  checking: {
    title: "BFFへ接続しています",
    detail: "安全なHTTPS health endpointの応答を待っています。"
  },
  connected: {
    title: "BFFに接続済み",
    detail: "local shellからpublic health endpointへ接続できました。"
  },
  offline: {
    title: "オフラインです",
    detail: "通信がなくても、このlocal login shellは表示できます。"
  },
  timeout: {
    title: "接続がタイムアウトしました",
    detail: "少し待ってから再接続してください。"
  },
  "server-error": {
    title: "BFFが利用できません",
    detail: "serverがhealth requestを正常に処理できませんでした。"
  },
  "invalid-response": {
    title: "応答を確認できません",
    detail: "health endpointから想定した形式の応答を受け取れませんでした。"
  },
  "network-error": {
    title: "BFFに接続できません",
    detail: "networkまたはendpointの状態を確認して再接続してください。"
  }
};

export function ConnectionPanel({ state, onRetry }: ConnectionPanelProps) {
  const copy = STATUS_COPY[state.kind];
  const className = ["status-card", "status-" + state.kind].join(" ");

  return (
    <section className={className} aria-live="polite" aria-busy={state.kind === "checking"}>
      <div className="status-heading">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <p className="eyebrow">BFF接続状態</p>
          <h2>{copy.title}</h2>
        </div>
      </div>
      <p>{copy.detail}</p>
      <button type="button" onClick={onRetry} disabled={state.kind === "checking"}>
        {state.kind === "checking" ? "確認中…" : "再接続"}
      </button>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<HealthConnectionState>(() =>
    initialHealthState(typeof navigator === "undefined" ? true : navigator.onLine)
  );
  const requestSequence = useRef(0);

  const reconnect = useCallback(async () => {
    const sequence = ++requestSequence.current;

    if (!navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }

    setState({ kind: "checking" });
    const nextState = await fetchHealth(mobileEnvironment.bffBaseUrl);

    if (requestSequence.current === sequence) {
      setState(nextState);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => {
      void reconnect();
    }, 0);

    const handleOnline = () => {
      void reconnect();
    };
    const handleOffline = () => {
      requestSequence.current += 1;
      setState({ kind: "offline" });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      requestSequence.current += 1;
      window.clearTimeout(initialRequest);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [reconnect]);

  return (
    <main className="app-shell" data-mobile-profile={mobileEnvironment.profile}>
      <div className="brand-mark" aria-hidden="true">
        NM
      </div>
      <p className="product-name">Native Minutes</p>
      <p className="profile-badge">Local bundle · {mobileEnvironment.profile}</p>

      <section className="intro-card">
        <p className="eyebrow">/login shell</p>
        <h1>ログイン準備中</h1>
        <p>
          1分間の英語練習をiPhoneで始めるための、最小local bundleを確認しています。
        </p>
        <p className="scope-note">
          このspikeでは実際のメール入力やログインは行いません。
        </p>
      </section>

      <ConnectionPanel state={state} onRetry={() => void reconnect()} />

      <footer>
        <span>Local UI</span>
        <span aria-hidden="true">·</span>
        <span>HTTPS BFF</span>
        <span aria-hidden="true">·</span>
        <span>No credentials</span>
      </footer>
    </main>
  );
}
