import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nativeminutes.app',
  appName: 'Native Minutes',
  webDir: 'www',
  // Preflight only: this hosted WebView URL is for iOS native shell,
  // app-display, permissions, and WebView cookie/session smoke checks.
  // It is not a final Store-submission-ready architecture claim.
  server: {
    url: 'https://native-minute.vercel.app',
    cleartext: false
  }
};

export default config;
