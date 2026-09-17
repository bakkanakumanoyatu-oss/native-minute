# Personal Space P2 — Human approval and closeout

- MODE: `QSS_PERSONAL_SPACE_P2_HUMAN_ACCEPTANCE_CLOSEOUT_COMMIT_AND_PUSH`
- Human acceptance: **PASS**, explicitly received 2026-09-17. P2: **HUMAN APPROVED / CLOSED**.
- Human verified: Favorite ON; recording name save; Favorite/name retained after reload; My Takes recording name + Script title + date + score; Favorite filtering; Home Favorite count/preview; Favorite OFF reflected in My Takes/Home.
- Human also approved Listen / Record / Review `練習を終了（Home）` always navigating Home, unchanged previous-step Back and hidden practice bottom navigation. Record's existing discard guard remains.
- Acceptance used the explicitly synthetic **browser QA fixture** with actual product components. **iPhone Favorite/Rename acceptance was not performed**; collect it after P3 integration during actual-device acceptance.
- P1: `HUMAN APPROVED / CLOSED / VISUAL FROZEN`; Gate5: `CLOSED`; 58-item acceptance: `PAUSED / resume after P3 integration`; P3 Share: `NOT STARTED`.
- Closeout preflight: Developer checkout, `codex/g3-mobile-main-loop`, HEAD/upstream `ae951055c2156d3f60a8bfff2b638ca3dfb3e081`, ahead/behind `0/0`; approved P2 WIP only, index empty, no unknown changes. Workspace/diff check PASS.
- Repository delivery: one commit, subject `Add favorite and named Take library`, followed by normal push. Exact commit hash and local/upstream/remote reconciliation are recorded in the task's final report after execution. No remote migration, provider, Storage or Production actions.
- Exact approved path allowlist: [staged-paths.txt](../outputs/qss-personal-space-p2/staged-paths.txt). Unrelated/protected paths in that list: **0/0**. Environment backups, `supabase/.temp/`, prior P1 local artifacts and generated PNGs remain local. Existing migrations 0001–0030 are unchanged.

## Contract and changes

- Existing `takes` had no personal metadata fields. Repository migration **0031** (confirmed unused after 0030) adds `favorite boolean NOT NULL DEFAULT false` and nullable `display_name`; no new table. SQL length/empty/control-character constraints accompany API validation. SHA-256: `f7b8d75b371635b9ebb63a308faa1f64dd1cf7d1277955699cbe194d887214c4`.
- `PATCH /api/mobile/takes/[takeId]/metadata` accepts only `favorite` and/or `displayName`. Strict schema rejects unknown keys, empty patch, invalid types and excessive names. Name is trimmed, blank becomes NULL, max 60 UTF-16 code units in API/UI (DB additionally caps 60 characters); raw input max 240. React renders names as text. No score/transcript/audio/script/owner changes.
- Favorite supports multiple Takes and is unrelated to score-selected automatic Best. Explicit boolean set is idempotent. Patch maps only supplied metadata fields; no upsert or row recreation.
- Existing Bearer authentication/CORS and `takes_crud_own` RLS remain. UPDATE also filters validated user ID, Take ID and `status=reviewed`; missing/wrong-owner/deleted Takes return 404. SQL errors and names are not logged by this path.
- Canonical Review DTO and Progress histories carry both fields. Missing/malformed metadata is an API failure, never false/zero. Review also reads the owned script endpoint for its title; failure does not silently drop that title.
- Review displays optional recording name, then Script title. Favorite/name controls are secondary, after next Take/listen actions and before diagnostics; history and Exit remain. No Share.
- `/takes` shows persisted recording name (if any), Script title, date, score and Favorite, newest first with ID tie-break as in P1. All/Favorite filters preserve optional script scope. Home Favorite link opens the filter. No additional Home navigation.
- Home retains P1 layout/CSS/navigation and existing Continue, previous result, recent practice and saved-recording previews. Restored existing third metric uses actual Favorite count; up to two actual favorite previews appear only when nonzero. First/empty Home remains quiet.
- Save lock synchronously rejects repeated submissions, disables editor operations while saving, and applies only returned persisted data. Unmounted responses are ignored. Failed/ambiguous updates require refetch before further editing. PracticeApi waits for pending metadata writes before a new Home/My Takes/Review read, including navigation during save; read still fetches server state.
- Metadata lives only on the Take row. Direct Take deletion and the existing Account DB finalizer remove it; no separate retained metadata. The finalizer and Gate5 authority were not changed/re-audited.

Main files: `supabase/migrations/0031_take_personal_metadata.sql`, `types/database.ts`, `schemas/take-metadata.ts`, `services/takes/take-metadata.service.ts`, `lib/mobile/take-metadata-route.ts`, `app/api/mobile/takes/[takeId]/metadata/route.ts`; existing Review/Progress DTOs, mobile API adapter, Review/TakeMetadataEditor/Takes/Home screens and filter route; focused tests, isolated proof scripts, README/current-state, and `outputs/qss-personal-space-p2/`.

## Validation

- Workspace check, diff check, root/mobile lint, root typecheck, mobile source/test typecheck: PASS.
- Root production build + post-build typecheck; mobile local-spike build: PASS.
- Focused regression suite: **226 tests / 13 files PASS** (metadata validation/API, auth adapter, main-loop routes, Home, Review/Progress, routes/navigation, record/audio, App/auth).
- `python3 scripts/take-metadata-isolated-test.py`: PASS. Fresh PostgreSQL 17 container, `--network none`, no port bindings, migrations 0001–0031 applied; real owner/cross-owner RLS, DB constraints, direct Take deletion and actual existing Account DB finalizer. Another owner's Take survives and name is absent from retained Account audit.
- Connected service/route test against that DB: Favorite on/off, rename set/update/clear/trim, fresh client + **DB restart** persistence, wrong owner/forged owner denial, score/evaluation/identity columns byte-equivalent, automatic Best unchanged, DTO history populated, actual PATCH handler, deleted Take cannot be recreated. Container removed afterward.
- Actual product components with explicitly synthetic browser fixture: **52 P2 conditions + 8 failure conditions**, 320/428px × 100/200% root text. Includes zero/one/no-name/long-name, HTML escaping, all/Favorite ordering and empty state, rapid clicks, save lock, rename/update failures, late response after navigation, deletion error, reload persistence, Home count/preview, Script title and no horizontal overflow.
- P1 Home **40** conditions and navigation/dock **36** conditions PASS. Copied regression harness updates only P2-authorized Favorite/name/My Takes expectations; original P1 files remain unchanged. Images visually inspected at 428/100% and 320/200%.
- Fixture state is localStorage-backed synthetic QA data, not a live account. DB proof is separate from browser proof. Staging/Production 0031 apply, live-account acceptance, real iPhone/VoiceOver/OS Dynamic Type and the paused 58-item formal run were **not performed**.
- Focused P0/P1/P2/correctness UNKNOWN = `0/0/0/0` after self-review. Human acceptance is PASS; actual-device acceptance remains pending; inherited Gate5 nonblocking limitations remain unchanged. No independent reviewer/subagent was used.

## Human preview

Run from the Developer checkout:

```sh
node node_modules/vite/bin/vite.js --config outputs/qss-personal-space-p2/vite.config.mjs
```

Open <http://127.0.0.1:5192/scripts/preview-script/review/preview-latest?fixture=one>.
The banner explicitly says **P2 QA fixture・合成データ**. Actual PracticeApp and screen components are mounted. Review starts from synthetic saved results; edits persist locally across page reloads.

1. In Review, press `♡ お気に入り`.
2. Use `名前をつける` → `保存` and confirm the Script title below the name.
3. Open `録音履歴を見る` to see My Takes.
4. Select `お気に入り`, then `すべて`.
5. Press bottom-nav `Home` and confirm count and favorite preview.
6. Reopen Review; confirm recording name and Script title remain distinct.

Replay browser checks with `node outputs/qss-personal-space-p2/verify.cjs`, `verify-errors.cjs`, `verify-p1-home.cjs`, and `verify-p1-navigation.cjs` (each full path under that directory). Machine-readable results are beside the harnesses. This preview makes no live provider/account calls. The local QA server remains available for Human review.

`NEXT_ONE_ACTION=QSS_PERSONAL_SPACE_P3_IOS_TAKE_SHARE_IMPLEMENTATION`


## Human checkpoint correction — Exit always goes Home (2026-09-17)

User-authorized single navigation correction: Listen / Record / Review top-right label is now `練習を終了（Home）`, with destination fixed to Home regardless of practice origin. Existing Back route, Record discard guard and focused bottom-nav hiding remain unchanged. Only the exit label may wrap at narrow widths / enlarged text; no other P1 visual or navigation changes.

Direct regression only: `node outputs/qss-personal-space-p2/verify-exit-home.cjs` — **12 PASS** (3 screens × 320/428px × 100/200% text). Actual components, non-Home entry points, Home exit, previous-step Back, hidden bottom nav and no horizontal overflow. Existing P2 harness selectors/exit expectations were updated but broad P2/P1 suites were not rerun. Root/mobile lint and mobile build (source/test typecheck included), workspace/diff checks PASS. Root build and live-device acceptance were not rerun for this mobile-only correction.

At the correction checkpoint, P2 was `IMPLEMENTED / HUMAN_ACCEPTANCE_PENDING` with stage/commit/push `0/0/0`. The subsequent Human approval above supersedes that pending status. `NEXT_ONE_ACTION=QSS_PERSONAL_SPACE_P3_IOS_TAKE_SHARE_IMPLEMENTATION`.


## Final closeout verification

Final closeout PASS: root/mobile lint, root build + post-build typecheck, mobile build with source/test typechecks, the existing 226 affected tests (13 files), and the 12 direct Listen/Record/Review navigation conditions. All checks passed. These are the same bounded suites; no feature or visual edits and no suite expansion. Final PASS results are recorded in `verification-summary.json`.

Fresh isolated DB/RLS/deletion/restart proof is reused from the implementation run because its schema/service contract is unchanged. Migration 0031 SHA-256 is still `f7b8d75b371635b9ebb63a308faa1f64dd1cf7d1277955699cbe194d887214c4`. No Staging/Production apply or actual-device run is included in this closeout.

After the authorized normal push succeeds, final delivery status is `HUMAN APPROVED / CLOSED / COMMITTED / PUSHED`; the final report records the exact hash and zero ahead/behind reconciliation.
