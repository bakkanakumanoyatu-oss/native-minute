# Foundation legacy read path remediation

2026-09-24. Mode: `NATIVE_MINUTES_FOUNDATION_HUMAN_ACCEPTANCE_LEGACY_READPATH_REMEDIATION`.

## Data and cause

Fresh Staging read-only inspection found **PHYSICAL DATA INTACT** for the seven existing legacy Takes: six `reviewed`, one `completed`. Their pre-cutover row digest, 25 weak-word rows, and seven coach-feedback rows match postflight. All seven retain `script_revision_id`, title snapshot, and practice epoch as `NULL`; all join to owner-matched active scripts. All six reviewed recording references have matching Storage catalog objects. The completed Take's pre-existing missing Storage object remains unresolved; its playback is not claimed. Current Staging has 14 scripts and 10 reference-audio rows, versus 13 and 7 at cutover, with no legacy Take loss. No private transcript, script text, audio, or identifiers are included here.

The server progress read model already includes legacy Takes in `takeHistory` and historical counts. It deliberately leaves current-revision `latestTake`, `bestTake`, and `takeCount` empty for legacy-only scripts. Mobile Home chose the previous script solely from `latestTake`; Growth chose practiced status solely from `takeCount`. Those selectors turned preserved history into empty presentation. Saved Review lookup already accepts an owned legacy Take and returns persisted evaluation/coach data with no historical script body. The source issue was presentation selection, not a missing DB join or a need to backfill.

## Focused changes

- Home chooses each active script's newest saved Take across revisions. When only archived scripts have history, it keeps the recording-history route visible and explains why the previous practice shortcut is unavailable. Completed-only old records count as saved history but do not inflate the reviewed count. Listening to reference audio does not create practice history. A legacy/older Take never causes the current script body preview to appear as its evaluated text.
- Growth counts and picker labels use saved history for practice presence. Legacy-only details show historical records and links to Review while current-revision latest/best remain empty. The comparison heading explicitly says both results belong to the current version.
- Review DTO exposes the Take's stored nullable title snapshot. The app validates legacy `NULL` title/snapshot and labels the live script title as **現在の台本名**; it never labels current content as the old evaluation target. Recording name, saved script title, and current script title have distinct labels in Home, My Takes, and Review.
- Scripts' edit/delete action and delete confirmation scroll into view and receive focus. The confirmation says the active-list entry is removed while recording/evaluation history remains; the action is `削除する` and still calls archive. The archived list opens and closes, and restore remains explicit. No hard-delete path is added.

No migration, legacy backfill, provider call, production operation, or historical data mutation is part of this change.

## Validation

- `npm run check:workspace`: PASS.
- Affected mobile route, service, DTO, screen, and Chromium/WebKit script-management suites: 158 tests PASS across eight files. Direct regressions cover legacy saved Review lookup, all-time practice presence, current-revision comparison isolation, Home fallback, edit semantics, archive/restore history, visible management actions, collapsible archive list, and absence of hard delete.
- Root and mobile lint: PASS. Root and mobile typecheck: PASS. Root Next build: PASS. Staging Vite build: PASS using the previously installed public Staging auth target, verified against the repository's approved fingerprint. No private provider configuration was used in that mobile build.

## Backlog and acceptance boundary

- **Future contract:** permanent deletion of an archived script needs an explicit decision and audit for Takes, Reviews, reference audio, Storage, quota, and Gate5. This remediation implements no permanent delete.
- **UI consistency:** Home, Scripts, and Growth manual refresh controls differ. Compare whether a prominent button is needed, pull to refresh, a small common header action, and automatic background refresh in a separate task.
- Human Staging retest: (1) Home previous practice/history, (2) Growth existing record, (3) open one reviewed legacy Review and play its recording, (4) delete/archive interaction, (5) close archived list, (6) restore. The six matching reviewed recording objects support the playback attempt, but actual device playback remains Human pending.
- Resume title edit, then content edit acceptance only after this retest passes. New-revision provider E2E remains later and has not started.

## Deployment

Local candidate ready; exact commit, Staging deployment/install identities, Production isolation proof, and Human verdict are pending below.
