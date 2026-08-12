# B1D2A M22 clean-install actual-behavior proof result

## Scope and final status

This run covered only M22, the controlled AASA/association-unavailable case. It did not start M08, M17, B1D2B, or Gate 2.

M22 final status:

`PASS_CONTROLLED_ISOLATED_AD_REAL_FAILURE_PROOF`

Provenance:

- `CONTROLLED_ISOLATED_ASSOCIATED_DOMAIN_FAILURE`
- `ACTUAL_DEVICE`
- `DEVELOPMENT_MODE`

This is not a fixed-staging outage and is not production evidence.

## Checkpoint and isolated Preview

- Mainline branch: `codex/b1d2-unit-f`
- Mainline checkpoint: `bfaedf6c8eb9001a4d2c8d87390c934185bba447`
- Device: iPhone 14 Plus
- OS: iOS 26.2.1
- Verified runtime base: `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4`
- Temporary Preview source commit: `4d306c486d4ed7a0135f8b3a0edd28ebd28cc249`
- Temporary Preview deployment: `dpl_GAB8ZdPJMfVFNJ5PCpfv8MSMoq3d`

The temporary commit deleted only `public/.well-known/apple-app-site-association`. It was pushed only to a non-production temporary branch and was never merged or promoted. Fixed staging and the separate production project were not assigned the temporary deployment.

## Temporary development-mode artifact

The temporary signed development artifact was built from the verified source with the exact associated-domain entitlement:

`applinks:native-minute-staging-1z7vogkfo-takahiro-karasawa-s-projects.vercel.app?mode=developer`

Artifact verification passed for:

- bundle ID `com.nativeminutes.app.staging`
- application identifier `46P9QD3T3Q.com.nativeminutes.app.staging`
- exact one-item temporary associated-domain entitlement
- development signing and strict code-sign verification
- staging profile / `Staging` Xcode configuration
- universal-link callback mode
- `authConfigured=true`
- no custom-scheme URL type

Before the proof install, Codex uninstalled Native Minute Staging and read the connected device application inventory. The staging bundle count was zero. Only after this absence proof was the temporary artifact installed. This was a clean install, not an update install.

## Controlled public HTTP gate

Vercel Authentication was temporarily disabled only for the `native-minute-staging` project after the Preview and both device artifacts were ready. A 15-minute automatic rollback watchdog was armed before the change.

- Protection disabled/confirmed: `2026-08-12T07:22:40Z`
- Preview AASA: `404`
- Preview callback: `303`
- Preview recovery: `200`
- Preview callback `Set-Cookie`: `0`
- fixed staging AASA during the gate: `200`
- production root during the gate: `200`

The actual-device sequence did not begin until this gate passed.

## Clean-install `swcd` corroboration

Secret-free connected-device logs immediately after clean install showed:

- `Developer mode enabled: YES`
- a new AASA data task for the masked temporary domain with the `?mode=developer` suffix
- route `.wk`, corresponding to the well-known AASA path
- a direct network request from `swcd`

The log privacy mask prevented treating the log text alone as the exact host. The exact signed entitlement above and the contemporaneous Preview HTTP gate provide that binding. Universal Links Diagnostics UI was not re-run in this V2 proof; the earlier green screen is not used as PASS evidence. Direct `swcd` acquisition evidence and the actual Notes-link tap are the corroborating and primary device evidence, respectively.

## Actual routing behavior

The secret-free URL `https://<isolated-preview-host>/mobile/auth/callback` was placed in Notes and tapped exactly once as a link. It was not entered into Safari's address bar.

Human-provided current actual-device observation and screenshot showed:

- Safari opened and rendered the fixed safe recovery page
- Native Minute Staging did not auto-open
- no custom-scheme fallback occurred
- no authentication succeeded
- no `/SCRIPTS` navigation occurred
- no crash occurred

After the observation, Protection was immediately restored. Codex removed the temporary app, installed and launched the normal signed Staging artifact, and the Human observer confirmed `/LOGIN` with no abnormal state. A second secret-free Notes tap to the fixed staging callback opened Native Minute Staging and retained `/LOGIN`, confirming normal staging Universal Link association after rollback.

## Original M22 DoD reconciliation

The original M22 requirement is:

> AASA unavailable at staging; do not fall back to a production custom scheme; remain safely in Safari or safely unhandled.

The isolated Preview returned AASA `404`, the clean-installed artifact targeted that Preview through developer mode, and the actual Notes link tap remained in Safari on the safe recovery surface. The required negative behavior is therefore observed directly. Diagnostics UI is not part of the original M22 DoD and is not used to override the actual routing result.

## Rollback and isolation

- Protection re-enabled/confirmed: `2026-08-12T07:32:33Z`
- Total public exposure: `593` seconds (`9m 53s`), within the normal 10-minute limit
- Restored Protection: `all_except_custom_domains`
- Preview AASA/callback after rollback: Vercel SSO `302`
- temporary app: removed
- normal Staging app: installed and launched
- normal Staging `/LOGIN`: Human-confirmed
- normal fixed-staging Universal Link: Human-confirmed to open the app and retain `/LOGIN`
- fixed staging AASA: `200`
- Apple CDN AASA: `200`
- fixed staging callback: `303`
- fixed staging recovery: `200`
- fixed staging callback `Set-Cookie`: `0`
- fixed staging deployment unchanged: `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`
- production deployment unchanged: `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`

Cleanup completed after rollback: the temporary remote/local branch, Preview deployment, and worktree were removed; local temporary artifacts/logs were moved to Trash for recoverable disposal; and the repo-local Git identity remained absent, matching its pre-run state. The temporary commit was not merged. No Supabase, Apple Portal, Vercel plan/team/project environment/domain, fixed staging alias, production alias, provider, database, migration, auth architecture, or mainline source/test change was made.

## Remaining B1D2A cases

B1D2A remains `OPEN` with two cases:

- M08: `PENDING_RATE_LIMIT`
- M17: `PENDING_NATURAL_REFRESH_TRIGGER`

Do not automatically start either case after this result.
