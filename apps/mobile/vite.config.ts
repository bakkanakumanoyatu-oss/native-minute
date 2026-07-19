import { defineConfig } from "vite";
import mobileProfiles from "../../config/mobile-profiles.json";

type MobileProfile = keyof typeof mobileProfiles;

const requestedProfile = process.env.MOBILE_PROFILE?.trim();

if (!requestedProfile || !Object.prototype.hasOwnProperty.call(mobileProfiles, requestedProfile)) {
  throw new Error("MOBILE_PROFILE must be one of: development, local-spike, production.");
}

const profile = requestedProfile as MobileProfile;
const previewBffBaseUrl = process.env.MOBILE_BFF_BASE_URL?.trim();

if (previewBffBaseUrl && profile !== "local-spike") {
  throw new Error("MOBILE_BFF_BASE_URL may only override the local-spike profile.");
}

const bffBaseUrl = previewBffBaseUrl || mobileProfiles[profile].bffBaseUrl;
const supabaseUrl = process.env.MOBILE_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey = process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const authCallbackUri = mobileProfiles[profile].authCallbackUri ?? "";
const SUPABASE_PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;

function validateBffBaseUrl(input: string, profileName: MobileProfile) {
  const url = new URL(input);
  const originOnly = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;

  if (!originOnly) {
    throw new Error("The mobile BFF base URL must contain only an origin.");
  }

  if (profileName !== "development" && url.protocol !== "https:") {
    throw new Error("Local-spike and production mobile builds require an HTTPS BFF base URL.");
  }

  if (
    profileName !== "development" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
  ) {
    throw new Error("Local-spike and production mobile builds cannot use a loopback BFF host.");
  }
}

validateBffBaseUrl(bffBaseUrl, profile);

function validateMobileAuthConfig() {
  if (Boolean(supabaseUrl) !== Boolean(supabasePublishableKey)) {
    throw new Error("Mobile Supabase URL and publishable key must be provided together.");
  }

  if (supabaseUrl) {
    const url = new URL(supabaseUrl);

    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("The mobile Supabase URL must be an HTTPS origin.");
    }
  }

  if (
    supabasePublishableKey &&
    !SUPABASE_PUBLISHABLE_KEY_PATTERN.test(supabasePublishableKey)
  ) {
    throw new Error("A valid Supabase publishable key is required by the mobile application.");
  }

  if (profile === "production" && mobileProfiles[profile].authCallbackMode !== "unconfigured") {
    throw new Error("Production mobile auth requires Universal Links in a later phase.");
  }
}

validateMobileAuthConfig();

export default defineConfig({
  base: "./",
  define: {
    __MOBILE_PROFILE__: JSON.stringify(profile),
    __BFF_BASE_URL__: JSON.stringify(bffBaseUrl),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    __AUTH_CALLBACK_URI__: JSON.stringify(authCallbackUri)
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  css: {
    postcss: {
      plugins: []
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020"
  },
  plugins: [
    {
      name: "native-minute-mobile-build-metadata",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "mobile-build.json",
          source: JSON.stringify({
            profile,
            bffOrigin: new URL(bffBaseUrl).origin,
            authCallbackMode: mobileProfiles[profile].authCallbackMode,
            authConfigured: Boolean(supabaseUrl && supabasePublishableKey && authCallbackUri)
          })
        });
      }
    }
  ]
});
