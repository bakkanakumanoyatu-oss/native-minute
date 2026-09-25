import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewScriptWorkspace } from "@/components/scripts/new-script-workspace";

describe("beta script creation entries", () => {
  it("shows template and manual creation without an AI generation entry", () => {
    const html = renderToStaticMarkup(createElement(NewScriptWorkspace, { aiScriptGenerationEnabled: false }));

    expect(html).toContain("テンプレートから選ぶ");
    expect(html).toContain("自分で書く");
    expect(html).not.toContain("AIに作ってもらう");
    expect(html).not.toContain("AIに1分スクリプトを書かせる");
  });

  it("can show the existing AI entry when the server enables it", () => {
    const html = renderToStaticMarkup(createElement(NewScriptWorkspace, { aiScriptGenerationEnabled: true }));
    expect(html).toContain("AIに作ってもらう");
  });
});
