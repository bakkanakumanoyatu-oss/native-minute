import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createMobileAuthService,
  type MobileAuthController
} from "./auth/mobile-auth";
import {
  canRequestMagicLink,
  type MobileAuthState
} from "./auth/state-machine";
import {
  fetchHealth,
  fetchMobileScripts,
  initialHealthState,
  type HealthConnectionState,
  type MobileScript,
  type ScriptsRequestState
} from "./lib/api";
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

type LoginViewProps = {
  authState: MobileAuthState;
  email: string;
  cooldownSeconds: number;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
};

const AUTH_ERROR_COPY: Partial<Record<string, string>> = {
  auth_email_invalid: "メールアドレスの形式を確認してください。",
  auth_request_failed: "認証メールを送信できませんでした。しばらく待って再試行してください。",
  auth_request_rate_limited: "再送できるまで少しお待ちください。",
  auth_callback_invalid: "認証リンクを確認できませんでした。新しいリンクを送信してください。",
  auth_callback_state_mismatch: "この認証リンクは現在のログイン操作と一致しません。",
  auth_callback_expired: "認証リンクの待機時間が終了しました。新しいリンクを送信してください。",
  auth_exchange_failed: "認証を完了できませんでした。新しいリンクからやり直してください。",
  auth_session_expired: "セッションの有効期限が切れました。もう一度ログインしてください。",
  auth_session_invalid: "セッションを確認できませんでした。もう一度ログインしてください。",
  auth_refresh_failed: "通信を確認してもう一度お試しください。",
  auth_secure_store_device_locked:
    "端末の安全な保存領域はロック中です。端末のロックを解除して再試行してください。",
  auth_secure_store_interaction_not_allowed:
    "端末の安全な保存領域と通信できません。アプリを再起動して再試行してください。",
  auth_secure_store_missing_entitlement:
    "このアプリbuildでは安全な保存領域を利用できません。通常署名された最新版を再インストールしてください。",
  auth_secure_store_plugin_unavailable:
    "このアプリbuildに安全な保存機能が含まれていません。最新版を再インストールしてください。",
  auth_secure_store_unexpected_status:
    "端末の安全な保存領域で予期しない問題が発生しました。アプリを再起動して再試行してください。",
  auth_not_configured: "このbuildではMobile Auth接続が未設定です。",
  auth_unavailable: "認証サービスを利用できません。"
};

export function LoginView({
  authState,
  email,
  cooldownSeconds,
  onEmailChange,
  onSubmit,
  onReset
}: LoginViewProps) {
  const isRequesting = authState.kind === "requesting_link";
  const requestAllowed = canRequestMagicLink(authState);
  const awaitingCallback = authState.kind === "link_sent" || authState.kind === "awaiting_callback";
  const reasonCode =
    authState.kind === "recoverable_error" || authState.kind === "fatal_error"
      ? authState.reasonCode
      : authState.kind === "expired"
        ? authState.reasonCode
      : null;

  return (
    <section className="intro-card auth-card" aria-live="polite">
      <p className="eyebrow">/login</p>
      <h1>メールでログイン</h1>
      <p>認証リンクをこのiPhoneで開くと、安全なPKCE認証を完了します。</p>

      {awaitingCallback ? (
        <div className="auth-notice" role="status">
          <strong>認証メールを確認してください</strong>
          <p>利用できるメールアドレスの場合、認証リンクを送信しました。</p>
        </div>
      ) : null}

      {authState.kind === "exchanging_code" || authState.kind === "restoring" ? (
        <div className="auth-notice" role="status">
          <strong>安全なセッションを確認しています</strong>
        </div>
      ) : null}

      {reasonCode ? (
        <div className="auth-error" role="alert">
          {AUTH_ERROR_COPY[reasonCode] ?? "ログインを完了できませんでした。"}
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <label htmlFor="mobile-login-email">メールアドレス</label>
        <input
          id="mobile-login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          disabled={!requestAllowed}
          required
        />
        <button type="submit" disabled={!requestAllowed || cooldownSeconds > 0}>
          {isRequesting
            ? "送信中…"
            : cooldownSeconds > 0
              ? `再送まで ${cooldownSeconds}秒`
              : "認証リンクを送信"}
        </button>
      </form>

      {reasonCode ? (
        <button type="button" className="secondary-button" onClick={onReset}>
          ログインをやり直す
        </button>
      ) : null}

      <p className="scope-note">
        別の方法でログインする経路は後続Phaseで追加します。password入力はこのsliceに含みません。
      </p>
    </section>
  );
}

export type ScriptsViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; scripts: MobileScript[] }
  | { kind: "empty" }
  | { kind: "error"; category: ScriptsRequestState["kind"] };

export function selectVisibleScriptsState(
  state: ScriptsViewState,
  loadedUserId: string | null,
  authenticatedUserId: string | null
): ScriptsViewState {
  return authenticatedUserId && loadedUserId === authenticatedUserId
    ? state
    : { kind: "loading" };
}

export function shouldRefreshScriptsRequest(result: ScriptsRequestState) {
  return result.kind === "unauthorized" && result.reasonCode === "session_expired";
}

type ScriptsViewProps = {
  state: ScriptsViewState;
  onRetry: () => void;
  onLogout: () => void;
};

export function ScriptsView({ state, onRetry, onLogout }: ScriptsViewProps) {
  return (
    <section className="intro-card scripts-card" aria-live="polite">
      <p className="eyebrow">/scripts</p>
      <div className="scripts-heading">
        <h1>自分の1分台本</h1>
        <button type="button" className="text-button" onClick={onLogout}>
          ログアウト
        </button>
      </div>

      {state.kind === "idle" || state.kind === "loading" ? (
        <p role="status">台本を読み込んでいます…</p>
      ) : null}

      {state.kind === "empty" ? (
        <div className="empty-state">
          <strong>保存済みの台本はまだありません</strong>
          <p>このsliceでは既存台本の閲覧だけを確認します。</p>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <ul className="script-list">
          {state.scripts.map((script) => (
            <li key={script.id}>
              <div className="script-meta">
                <span>{script.locale}</span>
                <span>{script.targetSeconds}秒</span>
              </div>
              <h2>{script.title}</h2>
              <p>{script.content}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {state.kind === "error" ? (
        <div className="auth-error" role="alert">
          <p>台本一覧を取得できませんでした。通信状態を確認してください。</p>
          <button type="button" onClick={onRetry}>
            再試行
          </button>
        </div>
      ) : null}
    </section>
  );
}

type AppProps = {
  authController?: MobileAuthController;
};

export function App({ authController }: AppProps = {}) {
  const [auth] = useState<MobileAuthController>(() =>
    authController ?? createMobileAuthService()
  );

  const [healthState, setHealthState] = useState<HealthConnectionState>(() =>
    initialHealthState(typeof navigator === "undefined" ? true : navigator.onLine)
  );
  const [authState, setAuthState] = useState<MobileAuthState>(() => auth.getState());
  const [scriptsState, setScriptsState] = useState<ScriptsViewState>({ kind: "idle" });
  const [scriptsOwnerUserId, setScriptsOwnerUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const healthRequestSequence = useRef(0);
  const scriptsRequestSequence = useRef(0);
  const loadedUserId = useRef<string | null>(null);
  const scriptsOwnerUserIdRef = useRef<string | null>(null);

  const reconnect = useCallback(async () => {
    const sequence = ++healthRequestSequence.current;

    if (!navigator.onLine) {
      setHealthState({ kind: "offline" });
      return;
    }

    setHealthState({ kind: "checking" });
    const nextState = await fetchHealth(mobileEnvironment.bffBaseUrl);

    if (healthRequestSequence.current === sequence) {
      setHealthState(nextState);
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
      healthRequestSequence.current += 1;
      setHealthState({ kind: "offline" });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      healthRequestSequence.current += 1;
      window.clearTimeout(initialRequest);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [reconnect]);

  useEffect(() => {
    const unsubscribe = auth.subscribe((nextState) => {
      setAuthState(nextState);

      const nextUserId = nextState.kind === "authenticated" ? nextState.userId : null;
      const shouldClearOwnedData =
        (nextUserId !== null &&
          scriptsOwnerUserIdRef.current !== null &&
          scriptsOwnerUserIdRef.current !== nextUserId) ||
        (nextUserId === null &&
          nextState.kind !== "refreshing" &&
          scriptsOwnerUserIdRef.current !== null);

      if (shouldClearOwnedData) {
        scriptsRequestSequence.current += 1;
        loadedUserId.current = null;
        scriptsOwnerUserIdRef.current = null;
        setScriptsOwnerUserId(null);
        setScriptsState({ kind: "idle" });
      }
    });
    void auth.start();

    return () => {
      unsubscribe();
      void auth.stop();
    };
  }, [auth]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadScripts = useCallback(
    async (expectedUserId?: string) => {
      const initialAuthState = auth.getState();
      const requestUserId =
        expectedUserId ??
        (initialAuthState.kind === "authenticated" ? initialAuthState.userId : null);

      if (!requestUserId) {
        return;
      }

      const sequence = ++scriptsRequestSequence.current;
      const requestIsCurrent = () => {
        const currentAuthState = auth.getState();
        return (
          scriptsRequestSequence.current === sequence &&
          currentAuthState.kind === "authenticated" &&
          currentAuthState.userId === requestUserId
        );
      };

      scriptsOwnerUserIdRef.current = requestUserId;
      setScriptsOwnerUserId(requestUserId);
      setScriptsState({ kind: "loading" });
      let accessToken = await auth.getAccessToken();

      if (!requestIsCurrent()) {
        return;
      }

      if (!accessToken) {
        const refreshResult = await auth.refresh();
        if (!requestIsCurrent()) {
          return;
        }
        if (!refreshResult.ok && refreshResult.reasonCode === "auth_refresh_failed") {
          setScriptsState({ kind: "error", category: "network-error" });
          return;
        }
        if (refreshResult.ok) {
          accessToken = await auth.getAccessToken();
        }
      }

      if (!accessToken) {
        if (requestIsCurrent()) {
          await auth.signOut();
        }
        return;
      }

      let result = await fetchMobileScripts(mobileEnvironment.bffBaseUrl, accessToken);
      accessToken = "";

      if (!requestIsCurrent()) {
        return;
      }

      if (result.kind === "success") {
        setScriptsState(
          result.scripts.length > 0
            ? { kind: "ready", scripts: result.scripts }
            : { kind: "empty" }
        );
        return;
      }

      if (result.kind === "unauthorized") {
        if (shouldRefreshScriptsRequest(result)) {
          const refreshResult = await auth.refresh();
          if (!requestIsCurrent()) {
            return;
          }
          if (!refreshResult.ok && refreshResult.reasonCode === "auth_refresh_failed") {
            setScriptsState({ kind: "error", category: "network-error" });
            return;
          }
          if (refreshResult.ok) {
            const refreshedAccessToken = await auth.getAccessToken();
            if (!requestIsCurrent()) {
              return;
            }
            if (refreshedAccessToken) {
              result = await fetchMobileScripts(
                mobileEnvironment.bffBaseUrl,
                refreshedAccessToken
              );
              if (!requestIsCurrent()) {
                return;
              }
              if (result.kind === "success") {
                setScriptsState(
                  result.scripts.length > 0
                    ? { kind: "ready", scripts: result.scripts }
                    : { kind: "empty" }
                );
                return;
              }
              if (result.kind !== "unauthorized") {
                setScriptsState({ kind: "error", category: result.kind });
                return;
              }
            }
          }
        }
        if (requestIsCurrent()) {
          await auth.signOut();
        }
        return;
      }

      setScriptsState({ kind: "error", category: result.kind });
    },
    [auth]
  );

  const authenticatedUserId =
    authState.kind === "authenticated" ? authState.userId : null;

  useEffect(() => {
    let scriptRequest: number | null = null;

    if (authState.kind === "authenticated" && authenticatedUserId) {
      window.history.replaceState(null, "", "/scripts");
      if (loadedUserId.current !== authenticatedUserId) {
        loadedUserId.current = authenticatedUserId;
        scriptRequest = window.setTimeout(() => {
          void loadScripts(authenticatedUserId);
        }, 0);
      }
    } else if (authState.kind === "refreshing") {
      window.history.replaceState(null, "", "/scripts");
    } else if (authState.kind !== "restoring" && authState.kind !== "exchanging_code") {
      loadedUserId.current = null;
      scriptsRequestSequence.current += 1;
      window.history.replaceState(null, "", "/login");
    }

    return () => {
      if (scriptRequest !== null) {
        window.clearTimeout(scriptRequest);
      }
    };
  }, [authState.kind, authenticatedUserId, loadScripts]);

  const cooldownUntil =
    authState.kind === "link_sent" || authState.kind === "awaiting_callback"
      ? authState.cooldownUntil
      : 0;
  const cooldownSeconds = Math.max(0, cooldownUntil - nowSeconds);
  const visibleScriptsState = selectVisibleScriptsState(
    scriptsState,
    scriptsOwnerUserId,
    authenticatedUserId
  );

  const submitLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const result = await auth.requestMagicLink(email);
      if (result.ok) {
        setEmail("");
      }
    },
    [auth, email]
  );

  return (
    <main className="app-shell" data-mobile-profile={mobileEnvironment.profile}>
      <div className="brand-mark" aria-hidden="true">
        NM
      </div>
      <p className="product-name">Native Minutes</p>
      <p className="profile-badge">Local bundle · {mobileEnvironment.profile}</p>

      {authState.kind === "authenticated" || authState.kind === "refreshing" ? (
        <ScriptsView
          state={visibleScriptsState}
          onRetry={() => void loadScripts(authenticatedUserId ?? undefined)}
          onLogout={() => void auth.signOut()}
        />
      ) : (
        <LoginView
          authState={authState}
          email={email}
          cooldownSeconds={cooldownSeconds}
          onEmailChange={setEmail}
          onSubmit={(event) => void submitLogin(event)}
          onReset={() => void auth.resetLogin()}
        />
      )}

      <ConnectionPanel state={healthState} onRetry={() => void reconnect()} />

      <footer>
        <span>Local UI</span>
        <span aria-hidden="true">·</span>
        <span>HTTPS BFF</span>
        <span aria-hidden="true">·</span>
        <span>Bearer BFF</span>
      </footer>
    </main>
  );
}
