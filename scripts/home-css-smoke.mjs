import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const targetUrl = process.env.HOME_CSS_SMOKE_URL || "http://localhost:3000/";
const screenshotPath = path.resolve("test-results/home-css-smoke/home-localhost-3000-clean.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failedStaticResponses = [];
const consoleErrors = [];

page.on("response", (response) => {
  const responseUrl = response.url();

  if (responseUrl.includes("/_next/static/") && response.status() >= 400) {
    failedStaticResponses.push(`${response.status()} ${responseUrl}`);
  }
});

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

const response = await page.goto(targetUrl, { waitUntil: "networkidle" });
await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
await page.screenshot({ path: screenshotPath, fullPage: true });

const result = await page.evaluate(() => {
  const header = document.querySelector("header");
  const main = document.querySelector("main");
  const nav = document.querySelector("nav");
  const bodyStyles = window.getComputedStyle(document.body);
  const headerStyles = header ? window.getComputedStyle(header) : null;
  const navStyles = nav ? window.getComputedStyle(nav) : null;

  return {
    title: document.title,
    mainText: main?.textContent ?? "",
    h1: document.querySelector("h1")?.textContent ?? "",
    navText: nav?.textContent ?? "",
    bodyBackgroundImage: bodyStyles.backgroundImage,
    bodyFontFamily: bodyStyles.fontFamily,
    headerDisplay: headerStyles?.display ?? "",
    headerBorderRadius: headerStyles?.borderRadius ?? "",
    navDisplay: navStyles?.display ?? "",
    navGap: navStyles?.columnGap || navStyles?.gap || "",
    cssLinks: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.href)
  };
});

await browser.close();

const failures = [];
const status = response?.status() ?? 0;

if (status !== 200) {
  failures.push(`Expected HTTP 200, got ${status}`);
}

if (result.h1 !== "1分英語を、お手本で聞いて、自分で録って、成果を見る。") {
  failures.push(`Expected Home h1, got "${result.h1}"`);
}

if (result.mainText.includes("This page could not be found")) {
  failures.push("Root main content rendered the Next.js 404 message");
}

if (result.bodyBackgroundImage === "none") {
  failures.push("Global CSS background is not applied");
}

if (result.headerDisplay !== "flex") {
  failures.push(`Expected header display flex, got "${result.headerDisplay}"`);
}

if (result.headerBorderRadius === "0px") {
  failures.push("Header border radius is not applied");
}

if (result.navDisplay !== "flex") {
  failures.push(`Expected nav display flex, got "${result.navDisplay}"`);
}

if (result.navGap === "normal" || result.navGap === "0px" || result.navGap === "") {
  failures.push(`Expected nav gap, got "${result.navGap}"`);
}

if (failedStaticResponses.length > 0) {
  failures.push(`Static asset failures: ${failedStaticResponses.join("; ")}`);
}

if (consoleErrors.length > 0) {
  failures.push(`Console errors: ${consoleErrors.join("; ")}`);
}

console.log(
  JSON.stringify(
    {
      targetUrl,
      status,
      screenshotPath,
      failedStaticResponses,
      consoleErrors,
      result,
      ok: failures.length === 0,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exitCode = 1;
}
