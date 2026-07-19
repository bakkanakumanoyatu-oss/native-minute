export type MobileProfile = "development" | "local-spike" | "production";

const DEBUG_AUTH_CALLBACK_URI = "com.nativeminutes.app.debug://auth/callback";
const SUPABASE_PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;

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

function parseMobileAuthConfig(profile: MobileProfile) {
  const supabaseUrl = __SUPABASE_URL__.trim();
  const publishableKey = __SUPABASE_PUBLISHABLE_KEY__.trim();
  const callbackUri = __AUTH_CALLBACK_URI__.trim();
  const configured = Boolean(supabaseUrl && publishableKey && callbackUri);

  if (configured) {
    const parsedSupabaseUrl = new URL(supabaseUrl);

    if (
      parsedSupabaseUrl.protocol !== "https:" ||
      parsedSupabaseUrl.pathname !== "/" ||
      parsedSupabaseUrl.search ||
      parsedSupabaseUrl.hash
    ) {
      throw new Error("Invalid mobile Supabase URL.");
    }

    if (!SUPABASE_PUBLISHABLE_KEY_PATTERN.test(publishableKey)) {
      throw new Error("Invalid mobile Supabase publishable key.");
    }

    if (profile === "production") {
      throw new Error("Production mobile authentication is blocked until Universal Links are configured.");
    }

    if (callbackUri !== DEBUG_AUTH_CALLBACK_URI) {
      throw new Error("Invalid debug mobile authentication callback.");
    }
  }

  return Object.freeze({
    configured,
    supabaseUrl,
    publishableKey,
    callbackUri,
    storageKey: `nm-mobile-auth-${profile}`
  });
}

export const mobileEnvironment = Object.freeze({
  profile: __MOBILE_PROFILE__,
  bffBaseUrl: parseBffBaseUrl(__BFF_BASE_URL__, __MOBILE_PROFILE__),
  auth: parseMobileAuthConfig(__MOBILE_PROFILE__)
});
