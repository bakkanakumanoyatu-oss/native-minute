# P3 local QA evidence

Synthetic account/Take/audio data, actual mobile React components. The Share controller uses a fake native adapter. **This preview does not invoke iOS Share Sheet and is not actual-device acceptance.** No live credentials, real user audio, Storage, BFF or providers are used.

From the repository root:

```sh
node node_modules/vite/bin/vite.js --config outputs/qss-personal-space-p3/vite.config.mjs
node outputs/qss-personal-space-p3/verify-p3.cjs
node outputs/qss-personal-space-p3/verify-j.cjs
node outputs/qss-personal-space-p3/verify.cjs
node outputs/qss-personal-space-p3/verify-p1-home.cjs
node outputs/qss-personal-space-p3/verify-p1-navigation.cjs
node outputs/qss-personal-space-p3/verify-exit-home.cjs
node outputs/qss-personal-space-p3/verify-errors.cjs
```

Preview: `http://127.0.0.1:5198/`. Each check uses isolated browser contexts at 320/428px and root font 16/32px. JSON and PNG evidence are written here. Existing P1/P2 evidence is preserved; regression scripts were copied here and adjusted only for the approved P3 heading/count expectations and this local server.

`p3-browser-results.json`: 44 P3 conditions. Other original result JSON files: 148 P1/P2 regression conditions. `j-browser-results.json`: 8 Chromium/WebKit viewport/text configurations for one-tap playback, stable Share, cancellation and recovery. Full implementation/native validation/limits and the later Human A–K acceptance are in `docs/qss-personal-space-p3-checkpoint.md`. Human acceptance is independent of the synthetic fixture. Generated PNGs remain local; text fixtures/results and sanitized Staging proofs are committed. Deployment/install JSONs preserve their capture-time state, including then-pending Human acceptance.
