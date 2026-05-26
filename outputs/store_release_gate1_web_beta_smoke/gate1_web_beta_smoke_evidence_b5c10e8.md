# Gate 1 Web Beta Smoke Evidence

This is human-confirmed production smoke evidence for Native Minute Gate 1. It records only safe metadata. It does not include secrets, raw provider responses, private user data, transcript text, raw audio, audio paths, storage paths, API keys, or env values.

## Metadata

| Field | Value |
| --- | --- |
| Production URL | `https://native-minute.vercel.app` |
| Deploy provider | `Vercel` |
| Project name | `native-minute` |
| Deployment id/name | `Cw9FXioAa` |
| Environment | `Production / Current` |
| Deployment status | `Ready / Latest` |
| Branch | `main` |
| Commit / build ref | `b5c10e8` |
| Commit message | `Add Gate 1 web beta smoke evidence template` |
| Deployed at exact timestamp | `unknown` |
| Human-confirmed UI relative time | `6m ago` |
| Smoke reviewer | `human / project owner` |
| Device / browser | `unknown; human-confirmed browser smoke` |
| Overall decision | `PASS` |

## Smoke Results

| Area | Result | Safe evidence |
| --- | --- | --- |
| Production app opened from Vercel Visit | `PASS` | Human-confirmed |
| Home | `PASS` | Human-confirmed |
| Login | `PASS` | Human-confirmed |
| `/scripts` | `PASS` | Human-confirmed |
| `/scripts/new` | `PASS` | Human-confirmed |
| Listen | `PASS` | Human-confirmed |
| Record | `PASS` | Human-confirmed |
| Evaluate | `PASS` | Human-confirmed |
| Review | `PASS` | Human-confirmed |
| Progress | `PASS` | Human-confirmed |
| Second take | `PASS` | Human-confirmed |
| Latest / best / progress continuity | `PASS` | Human-confirmed |

## Notes

- User confirmed steps 1 through 11 all OK.
- No blocker was reported.
- This was production deployment smoke for Gate 1.
- Exact deployment timestamp is unknown from repo-side evidence; Vercel UI showed `6m ago` at confirmation time.
- Exact device/browser name is unknown and was not inferred.
- No secret, raw provider response, private user data, transcript text, audio path, storage path, API key, or env value was recorded.

## Decision

`PASS`
