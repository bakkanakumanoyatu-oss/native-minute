# G5D-4 proof evidence template

Status: `EMPTY REVIEWER-SAFE TEMPLATE / NOT AUTHORIZATION / NOT EXECUTION EVIDENCE`

This template records only allowlisted aliases, digests, counts, fixed states, and verdicts. It does not authorize a micro-step and must not be used to request or infer Human authorization.

## Binding

| Field | Reviewer-safe value |
| --- | --- |
| run | `<g5d4_run_32hex>` |
| authorization | `<g5d4_authz_32hex>` |
| micro-step | `<provider_cleanup\|storage_cleanup\|database_cleanup\|auth_cleanup\|completion_verification>` |
| commit | `<40_lowercase_hex>` |
| project ref | `ztlliqishddrrvqqrrlu` |
| fixture A alias | `<g5d4_v1_64hex>` |
| fixture B alias | `<g5d4_v1_64hex>` |
| target alias | `<g5d4_v1_64hex>` |
| target digest | `<64_lowercase_hex>` |
| target count | `<safe_integer>` |
| collector digest | `<64_lowercase_hex>` |
| manifest seal digest | `<64_lowercase_hex>` |

## Corrected fixture contract

| Check | Required | Result |
| --- | ---: | --- |
| A prep-stop observed | `17` | `<PASS\|FAIL>` |
| A sealed observed | `22` | `<PASS\|FAIL>` |
| A D/A/R | `15 / 1 / 6` | `<PASS\|FAIL>` |
| A processing consents | `2` | `<PASS\|FAIL>` |
| A writer-intent kinds | `5` | `<PASS\|FAIL>` |
| A Provider targets | `1` | `<PASS\|FAIL>` |
| A Storage targets | `4` | `<PASS\|FAIL>` |
| A Auth presence before Auth step | `1` | `<PASS\|FAIL>` |
| B control observed | `16` | `<PASS\|FAIL>` |
| B processing consents | `2` | `<PASS\|FAIL>` |
| B deletion requests | `0` | `<PASS\|FAIL>` |
| B Provider presence | `1` | `<PASS\|FAIL>` |
| B Storage presence | `4 / 4` | `<PASS\|FAIL>` |
| B Auth presence | `1` | `<PASS\|FAIL>` |

The obsolete A authority `16 / 21 / 14 / 1 / 6` is always `FAIL`.

## One authorized micro-step

| Field | Result |
| --- | --- |
| authorization state before consume | `<confirmed\|FAIL>` |
| authorization state before child launch | `<consumed\|FAIL>` |
| parent guard before | `<off\|FAIL>` |
| child guard scope | `<on_for_one_child\|FAIL>` |
| parent guard after | `<off\|FAIL>` |
| child spawn count | `<0\|1>` |
| retry count | `0` |
| chaining count | `0` |
| shell | `false` |
| safe operator status | `<succeeded\|already_satisfied\|retryable\|manual_required\|blocked\|failed>` |
| child exit semantic | `<exit_0_valid\|exit_2_valid_progress\|spawn_failed\|output_rejected\|not_spawned>` |
| mandatory stop | `true` |

## Control and replay

| Check | Result |
| --- | --- |
| B fingerprint before | `<64_lowercase_hex>` |
| B fingerprint after | `<64_lowercase_hex>` |
| B before/after equality | `<true\|false>` |
| replay external action count | `<0\|FAIL>` |
| replay mutation count | `<0\|FAIL>` |
| consumed authorization replay | `<rejected\|FAIL>` |
| Completion terminal | `<true\|false\|not_reached>` |
| protected replay inaccessible | `<PASS\|FAIL\|not_reached>` |

## Hard-zero boundary

| Boundary | Required result |
| --- | ---: |
| non-target account mutation | `0` |
| same-invocation next-stage call | `0` |
| authorization reuse | `0` |
| target expansion/substitution | `0` |
| reviewer-output redaction finding | `0` |

## Verdict

| Field | Value |
| --- | --- |
| result | `<PASS\|FAIL\|STOP>` |
| P0/P1/P2/UNKNOWN | `<n / n / n / n>` |
| G5D-4 state | `<NOT_AUTHORIZED_NOT_STARTED\|AUTHORIZED_SINGLE_STEP_STOPPED\|COMPLETED_PENDING_REVIEW>` |
| exact next action | `<fixed_authority_action>` |

Do not add free-form notes or diagnostic payloads. If an allowlisted field cannot express the result, record `FAIL` or `STOP` and keep the diagnostic only in the private `0600` run state.
