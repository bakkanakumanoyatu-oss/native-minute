# Phase B1C local Capacitor bundle spike result

## Decision

**PARTIAL — ARCHITECTURE VERIFIED**

The local Capacitor bundle boundary and the protected Preview HTTPS BFF architecture are verified. The non-production Preview reached `READY`, and CLI-authenticated `vercel curl` requests confirmed `/api/mobile/health` and its exact CORS contract while Deployment Protection remained enabled. Simulator `connected` is intentionally deferred because B1C does not weaken Protection or embed bypass access in the mobile bundle.

## Verified checkpoint

| Check | Result | Safe evidence |
| --- | --- | --- |
| Client-only mobile bundle build | PASS | `apps/mobile/dist` contains the local shell and compiled assets. |
| Local `/login` shell | PASS | Native Minutes displayed inside the app without a Safari toolbar. |
| Capacitor release guard | PASS | Local-spike and production profiles contain no release `server.url`, cleartext, or localhost allowNavigation. |
| Release guard unsafe fixture | PASS | The self-test blocks unsafe local server/navigation, loopback BFF, and server-secret markers. |
| Local health / CORS | PASS | Exact Capacitor origin GET 200, disallowed origin 403, OPTIONS 204, no credentials or Set-Cookie. |
| iOS Simulator | PASS | Debug build, install, launch, local shell, and live app process passed on `NativeMinute-LocalBundle`. |
| Protected Preview HTTPS BFF health / CORS | PASS | The non-production Preview was `READY`. The origin-less GET returned 200, and `data` contained only `status`, `service`, and `timestamp`. The exact Capacitor-origin GET returned 200 with exact ACAO; the disallowed-origin GET returned 403 without ACAO; OPTIONS returned 204 with exact ACAO and `GET, OPTIONS`. All responses were no-store, without Set-Cookie or Allow-Credentials. The route has no DB, provider, or service-role dependency. |
| Simulator `connected` state | DEFERRED | Intentional: Deployment Protection remains enabled, and no bypass secret or Shareable Link is embedded in the mobile bundle. |
| Strict device network-off | NOT RUN | Not required for B1C close; the shell remained visible while its BFF was unreachable. |
| Native auth smoke | PENDING | B1C does not send email, follow magic links, or change auth. |

## Safety boundaries

- The Developer and quarantined Desktop checkouts are not modified by B1C.
- The local-spike has no `server.url`, cleartext mode, or localhost allowNavigation.
- The protected Preview URL was used only for CLI verification and was not stored in source, profile JSON, environment files, the mobile bundle, docs, or a commit.
- Deployment Protection remains enabled. No Protection Exception or Shareable Link was added, and no bypass secret was generated, displayed, or stored in source or the mobile bundle.
- The verified deployment was a `READY` Preview, not Production. No production deployment, alias, domain, or environment setting was changed.
- Auth, DB, audio, voice, StoreKit, and Universal Links are outside this phase.
- Authentication artifacts, secrets, tokens, cookies, magic links, and auth codes are not captured in B1C evidence.

## Known follow-ups

- The submission toolchain remains below the Xcode 26 + iOS 26 SDK requirement. Simulator success with Xcode 16.2 is not an App Store upload proof.
- The last dependency install reported 5 moderate and 6 high audit findings. B1C does not run `npm audit fix` or change dependencies; security triage is required before an internal TestFlight RC.
- Native auth smoke remains `PENDING`. The next formal phase is Mobile Auth Gate design; B1C does not enter its implementation or design.

## Close result

Phase B1C closes as `PARTIAL — ARCHITECTURE VERIFIED`. Local bundle launch, the Simulator local shell, release guards, and the protected Preview BFF health/CORS boundary are verified. Simulator-to-BFF `connected` remains intentionally deferred until a formal public or authenticated BFF contract is available. The next formal phase is Mobile Auth Gate design; this close stops before that phase.
