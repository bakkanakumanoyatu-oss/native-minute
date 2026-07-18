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

export default defineConfig({
  base: "./",
  define: {
    __MOBILE_PROFILE__: JSON.stringify(profile),
    __BFF_BASE_URL__: JSON.stringify(bffBaseUrl)
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
            bffOrigin: new URL(bffBaseUrl).origin
          })
        });
      }
    }
  ]
});
