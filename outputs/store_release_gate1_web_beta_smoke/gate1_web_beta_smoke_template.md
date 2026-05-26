# Gate 1 Web Beta Smoke Evidence Template

This template is for human production smoke evidence. Record only safe metadata. Do not paste secrets, raw provider responses, raw user data, raw audio, transcripts, signed URLs, object keys, storage paths, provider voice ids, account ids, project ids, or billing details.

## Metadata

| Field | Value |
| --- | --- |
| Production URL | `<human confirmation required>` |
| Deploy provider | `<human confirmation required>` |
| Deploy project / environment | `<safe name or masked>` |
| Deploy build ref / commit ref | `<human confirmation required>` |
| Deployed at | `<human confirmation required>` |
| Smoke reviewer | `<role / initials>` |
| Device / browser | `<device, OS, browser>` |
| Launch mode | `<private_beta / small_cohort / blocked>` |
| Overall decision | `<PASS / WARN / BLOCKED / FAIL>` |

## Repo Snapshot

| Field | Value |
| --- | --- |
| Commit under review | `10e4c838b83c3780c64d0eb13af08957ba8e3069` |
| Short ref | `10e4c83` |
| Branch | `main` |
| Upstream | `origin/main` |
| Repo-confirmed deploy state | `production URL / build ref / deployedAt not confirmed from repo` |

## Smoke Checklist

| Area | Result | Safe evidence | Notes |
| --- | --- | --- | --- |
| Production URL | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Deploy build ref | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Login | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Session refresh | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Home | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Scripts list | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Script creation | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Listen | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Record | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Evaluate | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Review | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Progress | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Second take | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Latest / best / progress continuity | `<PASS / WARN / BLOCKED / FAIL>` | `<safe>` |  |
| Provider env readiness | `<PASS / WARN / BLOCKED / FAIL>` | `<provider names + status only>` |  |
| Kill switch readiness | `<PASS / WARN / BLOCKED / FAIL>` | `<operation known / blocked>` |  |
| Redaction | `<PASS / WARN / BLOCKED / FAIL>` | `<no secrets/raw data observed>` |  |
| Errors / warnings | `<PASS / WARN / BLOCKED / FAIL>` | `<safe summary>` |  |

## Blockers / Warnings

| Type | Safe summary | Owner | Follow-up |
| --- | --- | --- | --- |
| `<BLOCKER / WARNING>` | `<safe summary>` | `<owner>` | `<next action>` |

## Redaction Confirmation

- No secret values were recorded.
- No raw provider responses were recorded.
- No raw user private data, raw audio, transcripts, signed URLs, object keys, storage paths, provider voice ids, account ids, project ids, or billing details were recorded.

## Decision

`<PASS / WARN / BLOCKED / FAIL>`

Decision notes:

- `<safe notes>`
