import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nativeminutes.app',
  appName: 'Native Minutes',
  webDir: 'www',
  // Simulator smoke only: point the native shell at the local dev server
  // while checking auth in the same WebView. allowNavigation keeps same-host
  // form posts to /api/* inside WKWebView instead of opening iOS Safari.
  server: {
    url: 'http://localhost:3000/login',
    allowNavigation: ['localhost'],
    cleartext: true
  }
};

export default config;
