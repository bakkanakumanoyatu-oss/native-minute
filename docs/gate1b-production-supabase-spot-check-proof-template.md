# Gate1b Production Supabase Spot-check Proof Template

Use this template after running the Gate1b runbook against the production Supabase project. Do not paste secrets, raw user ids, raw object keys, signed URLs, raw audio, provider ids, or auth headers.

## Recorded Protected Replay Proof

This section records the 2026-05-08 human manual protected replay check. Raw URLs, raw ids, signed URLs, user ids, and storage paths were not recorded.

| Check | Result | Safe evidence |
| --- | --- | --- |
| User A own script-audio replay | `PASS` | 200-equivalent response; audio replay worked. |
| User B cross-user script-audio replay | `PASS` | 403/404-equivalent response; audio did not replay. |
| User A own take-audio replay | `PASS` | 200-equivalent response; audio replay worked. |
| User B cross-user take-audio replay | `PASS` | 403/404-equivalent response; audio did not replay. |
| User B login before cross-user check | `PASS` | User B reached `/scripts` before checking User A audio routes. |

Gate1b protected replay / cross-user ownership proof status: `PASS`.

## Proof Metadata

- Checked at:
- Reviewer:
- App commit / deployment:
- Supabase project ref: `****`
- App origin:
- Result: `PASS / WARN / BLOCKED / FAIL`
- Notes:

## Automated Checks

| Check | Result | Evidence to record |
| --- | --- | --- |
| `npm run production:preflight` | `PASS / WARN / BLOCKED / FAIL` | Provider choices and launch mode only. No env values. |
| `npm run supabase:storage-rls:check` | `PASS / WARN / BLOCKED / FAIL` | Required tables reachable and buckets private. No storage paths. |
| `npm run lint` | `PASS / FAIL` | Command result only. |
| `npm run build` | `PASS / FAIL` | Command result only. |
| `npm run typecheck` | `PASS / FAIL` | Command result only. |

## Migration / Schema Proof

Record counts or yes/no status only.

| Item | Result | Safe evidence |
| --- | --- | --- |
| Migrations `0001` through `0012` applied in order | `PASS / WARN / BLOCKED / FAIL` | List of applied filenames or table presence count. |
| Required public tables exist | `PASS / WARN / BLOCKED / FAIL` | `12/12 tables reachable`. |
| RLS enabled on required tables | `PASS / WARN / BLOCKED / FAIL` | Count of tables with `rowsecurity = true`. |
| Required policies present | `PASS / WARN / BLOCKED / FAIL` | Policy count by table. Do not paste user ids. |
| `NOTIFY pgrst, 'reload schema';` completed after apply/check | `PASS / WARN / BLOCKED / FAIL` | Timestamp only. |

Required tables:

- `profiles`
- `voice_consents`
- `voices`
- `scripts`
- `script_audios`
- `takes`
- `weak_words`
- `coach_feedback`
- `quota_events`
- `script_saved_model_audios`
- `script_saved_best_takes`
- `account_deletion_requests`

## Storage Bucket Proof

Record bucket names, privacy state, and counts only. Do not record object keys.

| Bucket | Exists | Private | Safe object count | Result |
| --- | --- | --- | --- | --- |
| `recordings` | `yes / no` | `yes / no` | count only | `PASS / WARN / BLOCKED / FAIL` |
| `script-audios` | `yes / no` | `yes / no` | count only | `PASS / WARN / BLOCKED / FAIL` |
| `voice-samples` | `yes / no` | `yes / no` | count only | `PASS / WARN / BLOCKED / FAIL` |
| `voice-consents` | `yes / no` | `yes / no` | count only | `PASS / WARN / BLOCKED / FAIL` |

Expected:

- All four buckets exist.
- All four buckets are private.
- Upload/download checks happen through app routes or authenticated storage policy, not public URLs.

## Ownership / RLS User-session Proof

Use two test accounts. Record them as User A and User B only. Do not paste email addresses or raw ids.

| Check | Expected | Result | Safe evidence |
| --- | --- | --- | --- |
| User A can create a script | own write succeeds | `PASS / FAIL` | Route/API status only. |
| User A can upload a recording | own upload succeeds | `PASS / FAIL` | `recordings` count increments by 1, no path. |
| User A can generate or replay script audio | own replay succeeds | `PASS / FAIL` | `/api/script-audio/[audioId]` returns 200 and audio content type. Do not paste id. |
| User A can upload voice sample if tested | own upload succeeds | `PASS / WARN / FAIL` | `voice-samples` count increments, no path. |
| User A can upload voice consent if tested | own upload succeeds | `PASS / WARN / FAIL` | `voice-consents` count increments, no path. |
| User B cannot see User A script in app | cross-user data hidden | `PASS / FAIL` | UI/API does not show User A item. |
| User B cannot replay User A script audio | 404/403 equivalent | `PASS / FAIL` | Status only. Do not paste audio id. |
| User B cannot replay User A take audio | 404/403 equivalent | `PASS / FAIL` | Status only. Do not paste take id. |
| Authenticated client cannot perform service-role-only writes | write rejected | `PASS / WARN / FAIL` | Status/error class only. |

## Protected Replay Proof

| Route | Own user expected | Cross-user expected | Result |
| --- | --- | --- | --- |
| `GET /api/script-audio/[audioId]` | `200`, `Content-Type: audio/*`, `Cache-Control: private` | `404/403` | `PASS / FAIL` |
| `GET /api/takes/[takeId]/audio` | `200`, `Content-Type: audio/*`, `Cache-Control: private` | `404/403` | `PASS / FAIL` |

Do not record:

- `audioId`
- `takeId`
- raw storage path
- object key
- signed URL
- audio bytes

## Client Secret / Raw Detail Check

| Check | Expected | Result |
| --- | --- | --- |
| Service role key is not in client bundle / page source | not present | `PASS / FAIL` |
| Signed URL is not shown in UI for replay | not present | `PASS / FAIL` |
| Raw storage object key is not shown in UI for replay | not present | `PASS / FAIL` |
| Provider voice id is not shown in replay UI | not present | `PASS / FAIL` |
| Raw provider response is not shown in UI | not present | `PASS / FAIL` |

## Final Decision

- Gate1b proof status: `PASS / WARN / BLOCKED / FAIL`
- Can proceed to Web beta checklist: `yes / no`
- Blockers:
- Follow-up owner:
- Follow-up due date:

## Redaction Rules

Never paste:

- Supabase service role key
- provider API keys
- auth tokens
- user ids
- emails
- raw object keys or storage paths
- signed URLs
- audio ids / take ids if they can identify private data
- raw audio
- raw provider response

Use counts, statuses, masked refs, and User A / User B labels instead.
