import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConnectionPanel,
  LoginView,
  ScriptsView,
  selectVisibleScriptsState,
  shouldRefreshScriptsRequest
} from "./App";
import type { MobileAuthState } from "./auth/state-machine";

describe("ConnectionPanel", () => {
  it("renders the offline state without hiding the local shell recovery action", () => {
    const html = renderToStaticMarkup(
      <ConnectionPanel state={{ kind: "offline" }} onRetry={() => undefined} />
    );

    expect(html).toContain("オフラインです");
    expect(html).toContain("local login shellは表示できます");
    expect(html).toContain("再接続");
  });

  it("renders a safe server error without raw response details", () => {
    const html = renderToStaticMarkup(
      <ConnectionPanel state={{ kind: "server-error", status: 503 }} onRetry={() => undefined} />
    );

    expect(html).toContain("BFFが利用できません");
    expect(html).not.toContain("503");
  });
});

describe("LoginView", () => {
  const baseProps = {
    email: "",
    cooldownSeconds: 0,
    onEmailChange: () => undefined,
    onSubmit: () => undefined,
    onReset: () => undefined
  };

  it("renders email Magic Link login without a password field", () => {
    const html = renderToStaticMarkup(
      <LoginView authState={{ kind: "unauthenticated" }} {...baseProps} />
    );

    expect(html).toContain("/login");
    expect(html).toContain("認証リンクを送信");
    expect(html).toContain('type="email"');
    expect(html).not.toContain('type="password"');
  });

  it("uses generic link-sent copy and a safe fixed callback error", () => {
    const sentHtml = renderToStaticMarkup(
      <LoginView
        authState={{ kind: "awaiting_callback", cooldownUntil: 120 }}
        {...baseProps}
      />
    );
    const errorHtml = renderToStaticMarkup(
      <LoginView
        authState={{
          kind: "recoverable_error",
          reasonCode: "auth_exchange_failed",
          restartRequired: true
        }}
        {...baseProps}
      />
    );

    expect(sentHtml).toContain("利用できるメールアドレスの場合");
    expect(errorHtml).toContain("新しいリンクからやり直してください");
    expect(errorHtml).not.toContain("provider");
  });

  it.each([
    {
      reasonCode: "auth_secure_store_device_locked",
      copy: "端末の安全な保存領域はロック中です",
      mayMentionUnlock: true
    },
    {
      reasonCode: "auth_secure_store_interaction_not_allowed",
      copy: "端末の安全な保存領域と通信できません",
      mayMentionUnlock: false
    },
    {
      reasonCode: "auth_secure_store_missing_entitlement",
      copy: "通常署名された最新版を再インストールしてください",
      mayMentionUnlock: false
    },
    {
      reasonCode: "auth_secure_store_plugin_unavailable",
      copy: "安全な保存機能が含まれていません",
      mayMentionUnlock: false
    },
    {
      reasonCode: "auth_secure_store_unexpected_status",
      copy: "安全な保存領域で予期しない問題が発生しました",
      mayMentionUnlock: false
    }
  ] as const)(
    "keeps $reasonCode diagnostic classification separate from safe user copy",
    ({ reasonCode, copy, mayMentionUnlock }) => {
      const html = renderToStaticMarkup(
        <LoginView
          authState={{ kind: "fatal_error", reasonCode }}
          {...baseProps}
        />
      );

      expect(html).toContain(copy);
      expect(html).not.toContain(reasonCode);
      if (mayMentionUnlock) {
        expect(html).toContain("ロックを解除");
      } else {
        expect(html).not.toContain("ロックを解除");
      }
    }
  );

  it.each([
    { kind: "requesting_link" },
    { kind: "restoring" },
    { kind: "exchanging_code" },
    { kind: "refreshing" },
    { kind: "signing_out" }
  ] satisfies MobileAuthState[])("disables login controls while auth is $kind", (authState) => {
    const html = renderToStaticMarkup(
      <LoginView authState={authState} {...baseProps} />
    );

    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});

describe("ScriptsView", () => {
  it("renders loading, empty, owned list, and safe retry states", () => {
    const loading = renderToStaticMarkup(
      <ScriptsView state={{ kind: "loading" }} onRetry={() => undefined} onLogout={() => undefined} />
    );
    const empty = renderToStaticMarkup(
      <ScriptsView state={{ kind: "empty" }} onRetry={() => undefined} onLogout={() => undefined} />
    );
    const ready = renderToStaticMarkup(
      <ScriptsView
        state={{
          kind: "ready",
          scripts: [
            {
              id: "script-fixture",
              title: "Morning update",
              content: "A one-minute practice script.",
              targetSeconds: 60,
              locale: "en-US",
              createdAt: "2026-07-18T00:00:00.000Z",
              updatedAt: "2026-07-19T00:00:00.000Z"
            }
          ]
        }}
        onRetry={() => undefined}
        onLogout={() => undefined}
      />
    );
    const error = renderToStaticMarkup(
      <ScriptsView
        state={{ kind: "error", category: "server-error" }}
        onRetry={() => undefined}
        onLogout={() => undefined}
      />
    );

    expect(loading).toContain("台本を読み込んでいます");
    expect(empty).toContain("保存済みの台本はまだありません");
    expect(ready).toContain("Morning update");
    expect(ready).toContain("ログアウト");
    expect(error).toContain("再試行");
  });

  it("never exposes one authenticated user's list while another user is loading", () => {
    const priorUserState = {
      kind: "ready" as const,
      scripts: [
        {
          id: "user-a-script",
          title: "Private A",
          content: "Owned by user A.",
          targetSeconds: 60,
          locale: "en-US",
          createdAt: "2026-07-18T00:00:00.000Z",
          updatedAt: "2026-07-19T00:00:00.000Z"
        }
      ]
    };

    expect(selectVisibleScriptsState(priorUserState, "user-a", "user-b")).toEqual({
      kind: "loading"
    });
    expect(selectVisibleScriptsState(priorUserState, "user-a", "user-a")).toBe(
      priorUserState
    );
  });

  it("refreshes only an explicitly expired BFF session", () => {
    expect(
      shouldRefreshScriptsRequest({ kind: "unauthorized", reasonCode: "session_expired" })
    ).toBe(true);
    expect(
      shouldRefreshScriptsRequest({ kind: "unauthorized", reasonCode: "session_invalid" })
    ).toBe(false);
    expect(
      shouldRefreshScriptsRequest({ kind: "unauthorized", reasonCode: "auth_required" })
    ).toBe(false);
  });
});
