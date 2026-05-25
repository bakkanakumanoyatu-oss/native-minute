# Brush-up v1 design plan

## Goal
Brush-up starts from a user's best recording and creates a safer practice candidate for the same script. It should help the user hear a better target and keep practicing without overwriting the existing default model audio.

This is a design packet only. It does not add DB schema, migrations, route contracts, provider integrations, or UI buttons that pretend the feature is ready.

## Candidate entry points
- Progress, next to the selected script's best result.
- Review, next to the current saved recording / best-save area.
- v1 recommendation: start with Review first, then add Progress once the operation is proven. Review already has the exact take context and avoids ambiguity about which recording starts the brush-up.

## Inputs already available
- Best take audio: existing owned `/api/takes/[takeId]/audio` route can replay it, but provider-side use would need a server-side owned read path before any synthesis workflow.
- Script text: server-owned `scripts` row is available and must remain canonical.
- Score: `takes.score` is available through review/progress summaries.
- Weak words: persisted `weak_words` are available through review/progress hydration.
- Coach feedback: persisted `coach_feedback` is available through review/progress hydration.
- Existing model audio: `script_audios` and saved model audio entries can show current targets.

## Output options
- Brush-up audio candidate for the same script.
- Optional comparison with the current model audio.
- Optional comparison with the user's best recording.
- Updated short guidance based on weak words and coach feedback.

v1 should output only a brush-up audio candidate plus a short reason label. Comparison views can wait.

## Overwrite policy
- Do not overwrite the current default model audio.
- Do not mutate the script.
- Do not mutate historical takes or reviews.
- Create or save a distinct candidate so the user can choose it later.

## Storage options
### Existing `script_audios`
`script_audios` can store generated audio for a script/voice/cache identity. It is app-owned and already has protected replay. However, current cache identity is built around provider, voice, script locale/content, and style preset. It does not explicitly model "generated from best take X".

Using `script_audios` without a new discriminator risks mixing brush-up candidates with normal model audio unless the cache key and metadata semantics are carefully fixed.

### Existing Audio Library saved model audios
Saved model audios can pin `script_audios` rows in a 5-slot script-scoped library. This can represent a candidate after it exists. It cannot by itself describe the brush-up generation source.

### New model
A dedicated brush-up candidate model would be clearer if v1 needs lineage, status, source take, comparison state, or multiple candidates. This requires DB schema / API contract changes and is out of scope for the current UI cleanup.

## 5-slot relationship
- Generated model audios: existing saved model audio library has 5 slots.
- User recordings: existing saved best take library has 5 slots.
- Brush-up candidate recommendation: count it as a model-audio candidate only after the user explicitly saves it to saved model audios.
- Do not consume the user's best recording slots for generated brush-up audio.

## Provider / consent / ownership / storage notes
- Any brush-up generation must re-fetch the script, take, voice, and saved audio server-side.
- The source take must be owned by the current user and match the script.
- If provider synthesis needs the best take audio bytes, the service must read owned recording storage server-side. Client URLs are not enough.
- Consent/default voice flow must remain unchanged. Brush-up should not update the user's default voice or clone source.
- Protected replay should remain the only user-facing audio playback path.

## Minimal v1 that is safe
1. Add a Review-only entry point after a take exists.
2. Server-side service re-fetches script, take, weak words, coach feedback, and default voice.
3. Generate a new model-audio candidate for the same script without changing script text or default voice.
4. Store it as a separate `script_audios` row only if a stable cache/metadata discriminator for brush-up source is defined.
5. Let the user save that candidate into saved model audios if they like it.

Before step 4, decide whether existing `script_audios.cache_key` can safely encode `brushup:<takeId or take hash>` without changing API contract or confusing normal cache reuse.

## v1 should not do
- No script in-place edit.
- No overwrite of current model audio.
- No default voice replacement.
- No voice clone update from best take.
- No SNS/export automation.
- No hidden provider connection or new external dependency.
- No best-take audio upload to provider from the client.
- No fake button that looks usable before backend semantics are fixed.

## Open implementation decision
The main unresolved question is storage identity. Existing `script_audios` plus saved model audios may be enough only if brush-up candidates get an unambiguous cache key and metadata contract. If that cannot be done without changing data model/API semantics, v1 should stop and introduce a dedicated brush-up candidate model in a separate schema/API phase.
