# Phase B1C local Capacitor bundle spike result

## Decision

**PARTIAL**

The local Capacitor bundle vertical spike is established, but the deployed public HTTPS BFF health endpoint currently returns 404. B1C becomes PASS only after an ephemeral Vercel Preview health endpoint passes and the same local-spike app shows `connected` in the iOS Simulator.

## Verified checkpoint

| Check | Result | Safe evidence |
| --- | --- | --- |
| Client-only mobile bundle build | PASS | `apps/mobile/dist` contains the local shell and compiled assets. |
| Local `/login` shell | PASS | Native Minutes displayed inside the app without a Safari toolbar. |
| Capacitor release guard | PASS | Local-spike and production profiles contain no release `server.url`, cleartext, or localhost allowNavigation. |
| Release guard unsafe fixture | PASS | The self-test blocks unsafe local server/navigation, loopback BFF, and server-secret markers. |
| Local health / CORS | PASS | Exact Capacitor origin GET 200, disallowed origin 403, OPTIONS 204, no credentials or Set-Cookie. |
| iOS Simulator | PASS | Debug build, install, launch, local shell, and live app process passed on `NativeMinute-LocalBundle`. |
| Public HTTPS health | BLOCKED | `https://native-minute.vercel.app/api/mobile/health` returned 404 before the Preview check. |
| Simulator `connected` state | BLOCKED | Requires the passing Preview HTTPS health endpoint. |
| Strict device network-off | NOT RUN | Not required for B1C close; the shell remained visible while its BFF was unreachable. |
| Native auth smoke | PENDING | B1C does not send email, follow magic links, or change auth. |

## Safety boundaries

- The Developer and quarantined Desktop checkouts are not modified by B1C.
- The local-spike has no `server.url`, cleartext mode, or localhost allowNavigation.
- A Preview BFF origin may be injected only at build time through `MOBILE_BFF_BASE_URL`; it is not stored in source, profile JSON, `.env`, or a commit.
- Production deployment, production aliases, production environment settings, auth, DB, audio, voice, StoreKit, and Universal Links are outside this phase.
- Authentication artifacts, secrets, tokens, cookies, magic links, and auth codes are not captured in B1C evidence.

## Known follow-ups

- The submission toolchain remains below the Xcode 26 + iOS 26 SDK requirement. Simulator success with Xcode 16.2 is not an App Store upload proof.
- The last dependency install reported 5 moderate and 6 high audit findings. B1C does not run `npm audit fix` or change dependencies; security triage is required before an internal TestFlight RC.
- Native auth remains a separate gate after the local bundle/BFF boundary is proven.

## Exact remaining step

Deploy the current root Next.js app to the already-linked Vercel project as a non-production Preview, verify `/api/mobile/health` and its exact CORS contract, inject that ephemeral HTTPS origin into a local-spike build, and confirm `connected` in `NativeMinute-LocalBundle`. If project association, login, environment, billing, or Preview-only safety is unclear, do not deploy and keep this decision PARTIAL.
