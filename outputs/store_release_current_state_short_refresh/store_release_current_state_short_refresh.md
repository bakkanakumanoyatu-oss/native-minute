# Store Release Current State Short Refresh

Status: `ready_to_return_to_screenshot_preparation`

Date: `2026-06-10`

This is a short Store-submission readiness refresh after the voice setup rerecord practical E2E production PASS. It is docs/output-only. It does not change code, UI, provider connection, DB schema, auth, Storage policy, Store Console state, screenshots, Capacitor, or deletion behavior.

## Progress Summary

Native Minute's Web core and main practice loop are in a usable production-smoke state. The voice setup rerecord path is now also practical on iPhone Safari: users with an existing default voice can choose to keep the current voice, record again, or use an existing audio file, and the rerecord-to-new-model-voice flow has passed production practical E2E.

The next useful work is to return to screenshot candidate capture and Store asset review, not to start another UI implementation batch.

## Completed

- Web core main loop: Home, Practice, script creation, Listen, Record, Review, and Progress.
- Auth callback recovery and login flow.
- Legal / support / account deletion public routes and copy polish.
- Mobile browser QA: iPhone Safari PASS and iPhone Chrome lightweight PASS; Android remains later.
- Practice five-slot management.
- Voice setup rerecord choices.
- Voice setup practical E2E from existing voice to newly created model voice.
- PASS evidence for voice setup rerecord choices and practical E2E is recorded in docs / outputs and pushed.

## Still Remaining

- Screenshot capture and Store asset review.
- Reviewer account final login verification.
- Android / Google Play device and platform requirement checks.
- Capacitor / native packaging.
- Account deletion actual execution proof as a separately approved destructive gate.
- Provider production readiness / cleanup proof and final dashboard / kill-switch confirmations.
- App Privacy / Google Data Safety final answers.
- Final release QA.

## Screenshot Priority

1. Home / Practice entry.
2. Script creation.
3. Listen / model audio.
4. Record.
5. Review.
6. Progress.
7. Voice setup three-choice state.
8. Settings / legal / account deletion request, only if support/trust screenshots are needed.

## Before Capture

- Use a clean demo account, not the reviewer account, delete-test account, or real/personal account.
- Do not show full email, auth tokens, private URLs, raw audio, transcript body, Storage path, object key, provider id, provider response, secret, or env value.
- Use the approved demo script and keep the screen in a clean non-error state.
- Confirm old UI, internal labels, error states, Brush-up v1 claims, voice clone improvement claims, and actual-deletion-complete claims are absent.
- Capture candidates first, then decide accepted / rejected assets afterward.

## Next Step

Resume screenshot candidate capture using the existing Gate 5h / Gate 5j instructions. After capture, review the candidate set, choose accepted shots, and only then make small copy tweaks if a screenshot exposes confusing wording.
