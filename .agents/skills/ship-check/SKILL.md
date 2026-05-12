---
name: ship-check
description: Use this skill before considering a Native Minute MVP task complete. Runs a final implementation review covering lint, type safety, environment variables, migrations, README, error handling, and risky edge cases.
---

# Ship check skill

Use this skill when:
- a feature is mostly done
- preparing to merge or hand off
- checking MVP completeness

## Review checklist
- lint passes
- typecheck passes
- imports are clean
- no obvious dead code
- env vars documented
- migrations included when schema changed
- DB types updated
- user-facing error messages exist
- loading and empty states exist where needed
- README setup steps are accurate
- known limitations are noted honestly

## Risk review
Specifically check:
- provider API failures
- short or invalid audio uploads
- missing signed URL handling
- unauthorized access to user data
- mismatch between DB schema and app code
- hardcoded provider assumptions