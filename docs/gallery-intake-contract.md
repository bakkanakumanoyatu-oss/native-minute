# Gallery foundation and First Collection intake

Status: `FIRST_WORLD_BETA_RELEASE_ARTIFACTS_LOCAL / NOT DEPLOYED`. The canonical private source still has all 12 items on HOLD. The separate Human release decision yields 12 public metadata cards (5 PRACTICE, 7 DISCOVERY) and a private runtime with exactly the five PRACTICE payloads. No practice text or translation is stored in this public repository or Mobile bundle. Human review of the generated public metadata precedes Staging cutover.

Canonical local private vault: `/Users/karasawatakahiro/Developer/native-minute-private-content/first-collection/2026-09-27-first-collection-editorial-v1/` (outside every public Git worktree). Collection version: `2026-09-27-first-collection-editorial-v1`. ZIP SHA-256: `92808ca7894c23e88389e9373b7ab05147f661a6b642a916101daf0251754f41`. Main JSON SHA-256: `2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4`. This local vault requires a private backup; it is not a Git repository. A private version-controlled repository can be considered when content grows, but is not a publication prerequisite.

## Product boundary

Gallery starts with a real person's words in a real situation: find a moment, understand its source and context, then choose whether to say it. Source (`Movies`, `Speeches`, `Conversations`, `Books, Essays & Letters`, `Your Story`) and Theme are separate. `Quotes` is not a Source. Empty categories are valid. Gallery count is independent of the user's active 10 scripts. Do not pad, repeat, truncate, invent cinematic lines, clone a speaker, or turn Gallery browsing into TTS or a user script. `Your Story` opens manual script creation; AI generation remains off. The six old fictional Script Studio templates remain in the repo as legacy reference and are no longer a runtime entry.

## Expected First Collection identity

Exactly 12: Movies 4, Speeches 4, Books/Essays/Letters 4; editorial `COMPLETE` 6, `NEEDS_USER_TEXT_INSERTION` 6, rejected 0. No substitution for the park-bench **Good Will Hunting — Your Move, Chief** scene.

| Source | Work / speaker | Item | Editorial state |
| --- | --- | --- | --- |
| Movies | Good Will Hunting | Your Move, Chief | NEEDS_USER_TEXT_INSERTION |
| Movies | The Devil Wears Prada | The Sweater Was Chosen for You | NEEDS_USER_TEXT_INSERTION |
| Movies | Hidden Figures | There Is No Bathroom for Me Here | NEEDS_USER_TEXT_INSERTION |
| Movies | Network | First, You’ve Got to Get Mad | NEEDS_USER_TEXT_INSERTION |
| Speeches | Conan O’Brien | Your Worst Fear, Realized | NEEDS_USER_TEXT_INSERTION |
| Speeches | Theodore Roosevelt | The Person in the Arena | COMPLETE |
| Speeches | John F. Kennedy | Because They Are Hard | COMPLETE |
| Speeches | Frederick Douglass | No Progress Without Struggle | COMPLETE |
| Books, Essays & Letters | Ernest Shackleton | The End of the Endurance | COMPLETE |
| Books, Essays & Letters | Nellie Bly | Because of My Work | COMPLETE |
| Books, Essays & Letters | Helen Keller | The Mystery of Language | NEEDS_USER_TEXT_INSERTION |
| Books, Essays & Letters | Harriet Jacobs | The Loophole of Retreat | COMPLETE |

## Editorial source and public projection

The editorial asset uses `gallery-editorial/v1` with `collectionVersion`, dynamic `themes`, and item IDs. Each item retains identity (work, title, source, speaker, addressee, year), editorial context, speaking notes, themes, related IDs, practice text/translation, five separate duration/timecode concepts, provenance, seven rights axes, editorial status, and publication mode. Unknown editorial metadata is retained by the schema so a later package adapter can preserve source detail. The public `gallery-public/v1` manifest is a strict metadata projection. `HOLD` is excluded. `DISCOVERY` has no practice text, translation, or direct TTS/record action. `PRACTICE` has `practiceAvailable`, target, locale, and length metadata, without text or translation. Public projection omits raw editorial speaking notes and replaces private source locators with work identity because both can contain excerpt cues. Do not put internal editorial JSON in a client import or `public/` directory.

`COMPLETE` means editorial work is done; it never implies `PRACTICE`. `NEEDS_USER_TEXT_INSERTION` cannot be PRACTICE. `HOLD` is an internal state and can preserve an over-limit draft. A non-HOLD item needs approved commercial and territory review. PRACTICE additionally needs approved text display, TTS, user recording, and sharing. Showing a translation needs approved translation review. Every approval must carry an evidence reference. These are human/legal decisions; the validator checks their presence and consistency, not legal sufficiency. In this beta, record sharing exists, so the sharing axis gates PRACTICE even though Gallery has no share button.

Practice text is the **only** TTS/script payload. It excludes speaker/character names, addressee, work title, context, stage directions, `INT./EXT.`, narration labels, other dialogue, and editorial notes. The validator detects common leading cue/label patterns; editorial inspection must check semantic contamination. Word and trimmed UTF-16 counts are recalculated using `lib/script-length.ts` (200 words / 2,000 units). Over-limit text moves to HOLD; no automatic editing. `targetSeconds` accepts 15–120, independent of `sourceSegmentSeconds`, `expectedReadingSeconds`, generated reference audio actual duration, and licensed released-master timecode. A movie's start/end cues and script/subtitle/official-clip provenance do not establish exact released-master timecode. Keep unresolved values null; a PRACTICE movie requiring exact timecode cannot publish without it, while metadata-only DISCOVERY can.

## Intake procedure

1. The received ZIP and its main JSON match the SHA-256 values above; all ten entries in `SHA256SUMS.txt` match the copied files. The source JSON already uses the canonical `gallery-editorial/v1` schema, so no adapter is needed. Keep all private package files in the vault, never in this repository.
2. Compare the same 12 identities, statuses, source locators, rights review values, text/translation presence, and version before a later editorial revision. Report discrepancies without changing the received source. New content or release decisions require a new version and expected hash.
3. For the pinned worldwide beta release, run `npm run gallery:release -- <canonical-editorial.json> <world-release-decision.json> <new-public-candidate.json> <new-private-output-directory>`. The source and decision stay outside public worktrees. The command verifies their pinned SHA-256 values, applies the separate decision in memory, validates exact 5/7 IDs and rights gates, and writes a new public candidate plus private runtime, hash manifest, and validation report. It refuses overwrite. The private directory is 0700 and its three files are 0600. The canonical source remains unchanged. `gallery:manifest` and `gallery:runtime` remain generic intake builders; running them directly on the still-HOLD canonical source would produce zero released items.
4. Review the 12-card candidate as metadata only, including source URLs, context, and excerpt leakage. The release validator compares source text/translation fragments against public fields and forbids DISCOVERY payloads in runtime; `npm run check:gallery-private-leak -- --source <canonical-editorial.json>` also scans the public tree and Web/Mobile build output for complete protected payloads. After validation, move the candidate bytes into `lib/gallery/public-gallery.json` and verify its SHA-256 against the private release manifest. The `gallery-runtime/v1` artifact has only the five PRACTICE IDs, text, translation, target, locale, and content SHA-256. The app never reads the editorial source at runtime.
5. Provision a dedicated `gallery-runtime-private` Supabase Storage bucket through a controlled admin Storage operation with `public=false`; add no anonymous/authenticated object policies. Verify direct authenticated read and mutation denial before upload. A new DB table or migration is not required. Upload only the reviewed runtime artifact to `releases/<release-version>/gallery-runtime.json`, then set server-only `GALLERY_RUNTIME_RELEASE_VERSION`, `GALLERY_RUNTIME_OBJECT_KEY`, and `GALLERY_RUNTIME_SHA256` to exact values. Without all three, PRACTICE delivery fails closed. No bucket, upload, or live setting was made by this local foundation.
6. Web PRACTICE detail authenticates and renders at request time; Mobile fetches only the selected item through Bearer BFF. Both explicit create actions send only the Gallery ID. The server reloads the pinned private item and calls the authenticated `create_script` RPC with its active-10, 200-word/2,000-unit, and immutable revision guards. Browsing does no DB write, quota reservation, or provider call. Existing user script/Take history is unaffected by later Gallery releases. DISCOVERY opens an approved original URL, if any, and manual script creation; no scraping, clipboard monitor, background fetch, or AI text completion.

Reject duplicate IDs, invalid source/theme/status/mode/locale/target, missing provenance, malformed or non-HTTPS URL, placeholder values, broken/self relations, unresolved required movie timecode, practice text without gates, translation without its gate, public HOLD, public DISCOVERY text leakage, and length overflow. Run synthetic contract/UI tests without copying real lines.

## Synthetic JSON example

This example is invented for testing, never a Gallery candidate:

```json
{
  "schemaVersion": "gallery-editorial/v1",
  "collectionVersion": "synthetic-v1",
  "themes": ["Choice"],
  "items": [{
    "id": "synthetic-one", "collectionVersion": "synthetic-v1",
    "editorialStatus": "COMPLETE", "publicationMode": "HOLD",
    "identity": { "title": "A Test Moment", "workTitle": "Invented Work", "sourceType": "Speeches", "speaker": "Test Speaker", "addressee": null, "year": 2026 },
    "editorial": { "moment": "A fictional decision.", "contextJa": "架空の状況です。", "whyItMattersJa": "テスト用です。", "speakingNotes": ["Pause clearly."], "themes": ["Choice"], "moreLikeThis": [] },
    "practice": { "practiceTextEn": "I will speak clearly.", "translationJa": null, "targetSeconds": 60, "expectedReadingSeconds": 8, "sourceSegmentSeconds": 12, "locale": "en-US" },
    "source": { "primarySourceUrl": "https://example.org/test", "canonicalSourceLocator": "Invented Work, page 1", "sourceKind": "official", "startCue": null, "endCue": null, "releasedMasterTimecode": null, "releasedMasterTimecodeRequired": false, "sourceCheckedAt": "2026-09-27T00:00:00.000Z" },
    "rights": { "textDisplayReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "translationReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "ttsReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "userRecordingReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "sharingReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "commercialReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "territoryReview": { "state": "UNRESOLVED", "evidenceRefs": [] }, "rightsNote": null, "evidenceRefs": [] }
  }]
}
```
