# Gate 4c Consent / Provider Notice UI

Status: `implemented`

This Gate adds small v1 release-candidate consent and provider notices near the existing listen, record, review, and voice setup flows. It does not implement account deletion, DB cleanup, provider cleanup, Brush-up, Capacitor, env changes, dashboard changes, or Store submission work.

Copy status: release candidate draft. Final legal and operator approval remain `human_required`.

## Updated Surfaces

- `/scripts/[id]/listen`
  - Adds a short model audio notice before the listen panel.
  - Explains normal model audio, app-owned replay, and that Brush-up voice variants are not v1.
- `/scripts/[id]/record`
  - Adds a short recording / evaluation notice before the record panel.
  - Explains recording storage, OpenAI transcription, Azure pronunciation evaluation, AI feedback limits, and no v1 best-take provider submission.
- `/scripts/[id]/review/[takeId]`
  - Adds a short review result notice after the first-view review summary.
  - Explains transcript / score / weak words / coach feedback as learning aids, not official ability judgment.
- `/setup/voice`
  - Adds a short voice setup notice before voice state and consent forms.
  - Explains voice sample / consent recording storage and server-side provider boundary.
- Voice consent and sample forms
  - Clarify that v1 consent is for normal model audio / default voice.
  - Clarify that v1 does not reuse best takes as Brush-up voice material.
- Best result export actions
  - Re-labels Brush-up as a v1.1 memo and makes clear the feature is not offered in v1.

## Notice Content

The v1 notice copy covers:

- recording is used for evaluation, review, and progress;
- OpenAI transcription may be used;
- Azure pronunciation evaluation may be used;
- AI coaching / feedback is a learning aid, not a complete ability judgment;
- normal model audio / voice setup may use voice sample or consent recording;
- voice sample and consent recording are app-owned first and processed through server-side routes;
- Supabase Storage / protected replay remain the app-owned boundary;
- Privacy Policy, Terms, Support, and account deletion request links are reachable from the notices;
- Brush-up is v1.1 deferred and not a v1 feature claim.

## Human Required

- Final legal approval for Privacy Policy, Terms, and in-app notices.
- Final support email / operator identity / legal owner confirmation if Store metadata requires it.
- Final App Privacy and Google Data Safety wording alignment with implemented behavior.
- Release QA confirmation that notices do not block the listen / record / review / voice setup flow.

## Not Changed

- No account deletion execution.
- No Auth user deletion.
- No Storage deletion.
- No provider cleanup execution.
- No DB schema or migration change.
- No API contract change.
- No provider API call.
- No env or dashboard change.
- No Brush-up implementation.
- No Capacitor or Store submission work.

## Verification

Required checks for this Gate:

- `npm run lint`
- `npm run build`
- `npm run typecheck`
- JSON report parse
- redaction scan for newly added evidence / copy
- `git diff --check`
