export type MobileProfile = "development" | "local-spike" | "production";

function parseBffBaseUrl(input: string, profile: MobileProfile) {
  const url = new URL(input);
  const originOnly = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;

  if (!originOnly) {
    throw new Error("Invalid mobile BFF base URL.");
  }

  if (profile !== "development" && url.protocol !== "https:") {
    throw new Error("A secure mobile BFF base URL is required.");
  }

  if (
    profile !== "development" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
  ) {
    throw new Error("A loopback mobile BFF base URL is not allowed.");
  }

  return url.origin;
}

export const mobileEnvironment = Object.freeze({
  profile: __MOBILE_PROFILE__,
  bffBaseUrl: parseBffBaseUrl(__BFF_BASE_URL__, __MOBILE_PROFILE__)
});
