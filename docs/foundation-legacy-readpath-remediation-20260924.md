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
- Human screenshots showed that the first `台本を削除` button stayed visible after confirmation opened. Pressing it again only repeated the already-open state. The follow-up hides edit/delete controls during confirmation, keeps any request error beside the confirmation, and names the archived-list entry `復元画面を開く` so the final restore action is distinct.

No migration, legacy backfill, provider call, production operation, or historical data mutation is part of this change.

## Validation

- `npm run check:workspace`: PASS.
- Affected mobile route, service, DTO, screen, and Chromium/WebKit script-management suites: 158 tests PASS across eight files. Direct regressions cover legacy saved Review lookup, all-time practice presence, current-revision comparison isolation, Home fallback, edit semantics, archive/restore history, visible management actions, collapsible archive list, and absence of hard delete.
- Root and mobile lint: PASS. Root and mobile typecheck: PASS. Root Next build: PASS. Staging Vite build: PASS using the previously installed public Staging auth target, verified against the repository's approved fingerprint. No private provider configuration was used in that mobile build.

## Backlog and acceptance boundary

- **Future contract:** permanent deletion of an archived script needs an explicit decision and audit for Takes, Reviews, reference audio, Storage, quota, and Gate5. This remediation implements no permanent delete.
- **UI consistency:** Home, Scripts, and Growth manual refresh controls differ. Compare whether a prominent button is needed, pull to refresh, a small common header action, and automatic background refresh in a separate task.
- Human Staging retest on the first installed candidate: (1) Home previous practice/history, (2) Growth existing record, (3) reviewed legacy Review recording playback, (4) delete/archive interaction, (5) archived-list close, and (6) restore were all reported successful. Screenshots confirmed the duplicate confirmation control; the follow-up UI change above needs its own device check after installation. Read-only Staging inspection after Human testing found the seven legacy Takes and their weak-word/coach row digests unchanged, with archive state transitions and no Take attached to the tested archived script.
- Title edit, then content edit acceptance can resume after the follow-up UI check. New-revision provider E2E remains later and has not started.

## Deployment

The original remediation is commit `949423cf1aa89be7c49c0c74b97b55799cd87ef0`, deployed to dedicated Staging BFF `dpl_J7UQzVXJpKuJUNTpWMb1soK3b4uv` and installed on the same iPhone. Production remained unchanged. The task's operational completion report records the follow-up mobile build and installation identities.
