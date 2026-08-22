import { Browser } from "@capacitor/browser";
import { mobileEnvironment } from "./environment";

export type TrustedLegalPage = "privacy" | "terms" | "support" | "accountDeletionInfo";

const TRUSTED_LEGAL_PATHS: Record<TrustedLegalPage, string> = {
  privacy: "/privacy",
  terms: "/terms",
  support: "/support",
  accountDeletionInfo: "/support/account-deletion"
};

type BrowserOpener = {
  open(options: { url: string }): Promise<unknown>;
};

function isTrustedLegalPage(value: string): value is TrustedLegalPage {
  return Object.prototype.hasOwnProperty.call(TRUSTED_LEGAL_PATHS, value);
}

export function resolveTrustedLegalPageUrl(page: TrustedLegalPage) {
  if (!isTrustedLegalPage(page)) {
    throw new Error("Unknown trusted legal page.");
  }

  const origin = new URL(mobileEnvironment.bffBaseUrl);

  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error("Invalid canonical mobile BFF origin.");
  }

  const target = new URL(TRUSTED_LEGAL_PATHS[page], origin.origin);

  if (target.origin !== origin.origin || target.search || target.hash || target.username || target.password) {
    throw new Error("Invalid trusted legal target.");
  }

  return target.toString();
}

export async function openTrustedLegalPage(
  page: TrustedLegalPage,
  browser: BrowserOpener = Browser
) {
  await browser.open({ url: resolveTrustedLegalPageUrl(page) });
}
