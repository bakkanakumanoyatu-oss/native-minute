import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionPanel } from "./App";

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
