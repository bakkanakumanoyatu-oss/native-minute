# Personal Space P1 — Human approval and closeout

- MODE: `QSS_PERSONAL_SPACE_P1_HUMAN_APPROVAL_AND_CLOSEOUT`
- Human decision (2026-09-17): **P1 Home / Navigation APPROVED**.
- Status: `HUMAN_APPROVED / CLOSED / VISUAL_FROZEN`. No additional visual round.
- Final permitted UI change: remove the populated Home `— / お気に入り / 準備中` metric. Existing CSS grid slots, other Home visual / IA / copy / navigation remain unchanged. No unimplemented Favorite state appears in product UI.
- Base: `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`, previous HEAD/upstream `46aeda02a2be4b06d7742a9ea3777327e4f7d23a`.
- This closeout and the full P1 implementation are one commit: `Add Native Minute personal Home and navigation`. That commit is the frozen baseline; push is normal, without force.
- Gate5 remains CLOSED; no re-audit, schema changes or provider/production operations.

## Frozen P1 behavior

- Mobile `/` is Home; usual navigation is Home / 台本 / 成長, with Settings at the top. Existing web and mobile practice routes remain compatible.
- First Home shows the short saved-results explanation, initial CTA and up to three actual owned scripts (title / targetSeconds / locale / practice action). Empty scripts stay empty; no fake/recommended content.
- Populated Home retains おかえりなさい / Continue / previous result with prominent Script title, canonical latest and same-script best / compact real metrics / up to three recently practiced scripts / up to two saved Takes. When only one exists, only one is displayed.
- Home reads `PracticeApi.getProgress()` → authenticated `/api/mobile/progress` → owner-scoped `getProgressOverview()`. `練習した台本` is distinct script IDs with saved Takes. `保存済み録音` is the existing evaluated-and-saved Take count, not unreviewed uploads or an independently checked playable-asset count. Retrieval failures never become zero.
- Script title is preserved in every Take row; date and score come from persisted data. There are no fake custom recording names, Favorite controls or Share controls.
- Scripts has one `練習する` CTA to Listen. Direct Record routes remain available.
- Listen / Record / Review hide bottom navigation. Back follows meaningful steps; Exit uses an explicit safe origin, falling back to Home. It does not blindly trust browser history or caller URLs.
- Record retains full-text scroll, persistent dock, preview confirmation, stable Take ID, upload reuse and evaluation retry. Unsaved Back/Exit/popstate is confirmed; rejected exits retain the recording. Saved-review success bypasses the discard prompt.
- Review keeps next Take as primary, reference Listen / recording history / Exit as secondary. `/takes` is a saved-Take → Review shell; no replay API or P2 persistence is invented.

## Closeout validation

All checks below passed after removing the Favorite metric:

- `npm run check:workspace`
- Root and mobile lint; root and mobile source/test typecheck.
- Root build, post-build root typecheck and mobile local-spike build.
- 204 affected tests across 13 files: Home, Scripts/Review/Progress, navigation, recording, API, audio, auth and App.
- 40 Home browser conditions at 320/428px × 100/200% text: first, unpracticed, truly empty, long first title, one result, populated, long title, error/retry, My Takes and preview navigation. Explicit assertions reject Favorite/pending text in Home.
- 36 direct navigation/dock conditions: semantic Back/Exit, existing Record link, one Scripts CTA, no focused bottom nav, dock bounds and final script line accessibility.
- `git diff --check` and staged diff check.

Reproducible fixture harness and machine-readable results are committed in `outputs/qss-personal-space-p1/`. Generated screenshots and superseded QA rounds stay local. These are product components with explicit synthetic QA data; no live account/provider traffic is implied. Additional real-iPhone / VoiceOver / OS Dynamic Type / live-account acceptance was not run during this closeout.

Start local QA from the repository root:

```sh
node node_modules/vite/bin/vite.js --config outputs/qss-personal-space-p1/vite.config.mjs
node outputs/qss-personal-space-p1/verify-home-density-final.cjs
node outputs/qss-personal-space-p1/verify.cjs
```

P0/P1 findings: 0/0. Existing device-acceptance carryover remains; Favorite/Rename/My Takes persistence belongs to P2, Share to its later scope. Environment backups and `supabase/.temp/` are not part of the commit.

`NEXT_ONE_ACTION=QSS_PERSONAL_SPACE_P2_FAVORITE_RENAME_MY_TAKES_IMPLEMENTATION`
