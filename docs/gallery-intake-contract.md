# Gallery foundation and First Collection intake

Status: `CONTENT_PACKAGE_NOT_RECEIVED`. The public catalog is intentionally empty. No First Collection text, translation, or old draft has been imported.

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

The editorial asset uses `gallery-editorial/v1` with `collectionVersion`, dynamic `themes`, and item IDs. Each item retains identity (work, title, source, speaker, addressee, year), editorial context, speaking notes, themes, related IDs, practice text/translation, five separate duration/timecode concepts, provenance, seven rights axes, editorial status, and publication mode. Unknown editorial metadata is retained by the schema so a later package adapter can preserve source detail. The public `gallery-public/v1` manifest is a strict projection. `HOLD` is excluded. `DISCOVERY` has no practice text, translation, or direct TTS/record action. `PRACTICE` gets the reviewed practice payload only. Do not put internal editorial JSON in a client import or `public/` directory.

`COMPLETE` means editorial work is done; it never implies `PRACTICE`. `NEEDS_USER_TEXT_INSERTION` cannot be PRACTICE. `HOLD` is an internal state and can preserve an over-limit draft. A non-HOLD item needs approved commercial and territory review. PRACTICE additionally needs approved text display, TTS, user recording, and sharing. Showing a translation needs approved translation review. Every approval must carry an evidence reference. These are human/legal decisions; the validator checks their presence and consistency, not legal sufficiency. In this beta, record sharing exists, so the sharing axis gates PRACTICE even though Gallery has no share button.

Practice text is the **only** TTS/script payload. It excludes speaker/character names, addressee, work title, context, stage directions, `INT./EXT.`, narration labels, other dialogue, and editorial notes. The validator detects common leading cue/label patterns; editorial inspection must check semantic contamination. Word and trimmed UTF-16 counts are recalculated using `lib/script-length.ts` (200 words / 2,000 units). Over-limit text moves to HOLD; no automatic editing. `targetSeconds` accepts 15–120, independent of `sourceSegmentSeconds`, `expectedReadingSeconds`, generated reference audio actual duration, and licensed released-master timecode. A movie's start/end cues and script/subtitle/official-clip provenance do not establish exact released-master timecode. Keep unresolved values null; if a movie requires exact timecode, it cannot publish without it.

## Intake procedure

1. Receive the exact `first_collection_complete.json`, `first_collection_editorial.md`, `first_collection_status.csv`, and `mainline_handoff.md` or the named zip. Record SHA-256 of the original bytes and an explicit collection version. Never substitute an older draft, infer missing text from the summary, search for copyrighted lines, or regenerate translations.
2. Compare all four files for the same 12 identities, statuses, source locators, rights review values, text/translation presence, and version. Report discrepancies to editorial without changing them. Map the received JSON into the canonical editorial schema while retaining any extra metadata. The current CLI expects canonical editorial JSON; its adapter is intentionally pending until the actual package format is known.
3. Run the schema/relationship/rights/length validator. The CLI `npm run gallery:manifest -- <canonical-editorial.json> <new-public-output.json>` checks the 12 identities and counts, computes the input hash, and writes a **new** public manifest (`wx`, never overwrite). Review the output for text and translation leakage, then replace `lib/gallery/public-gallery.json` only with an approved projection. Re-run Web and Mobile checks. The app never reads the editorial source at runtime.
4. A PRACTICE tap uses the existing `create_script` path and its active-10 and length guards, then opens Listen with the user's existing reference voice. A saved user script and its history remain unchanged if a Gallery item later changes. DISCOVERY opens an approved original URL, if any, and manual script creation; no scraping, clipboard monitor, background fetch, or AI text completion.

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
