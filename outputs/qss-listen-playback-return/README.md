# Listen playback / return local evidence

See [implementation report](../../docs/qss-iphone14plus-acceptance-resume/listen-playback-controls-and-return.md).

- `verification.json`: checks and exact source/test hashes. 99 scoped tests + 46 browser cases PASS.
- `staging-readonly*.json`: bounded, safe SELECT observations; no private content or audio.
- Eight `chromium/webkit-{320,428}-{16,32}.png` images show the actual Listen component after scrolling to the final line. Synthetic audio and API/lifecycle fixtures; 850px viewport height; root text 100/200%. Native safe-area values and VoiceOver were not simulated or claimed.
- Reproduce browser checks: `npm run test --workspace @native-minute/mobile -- tests/listen-playback-controls.test.ts --testTimeout=12000`.

No actual-device result, native build/install, Staging mutation, deployment, provider call, commit or push.
