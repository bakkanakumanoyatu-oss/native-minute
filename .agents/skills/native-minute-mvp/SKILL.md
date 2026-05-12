---
name: native-minute-mvp
description: Use this skill when implementing or modifying product features for the Native Minute MVP. Applies MVP boundaries, provider abstraction rules, fixed-script constraints, and end-to-end product checks for record -> evaluate -> coach -> save.
---

# Native Minute MVP skill

Use this skill when:
- adding or changing app features
- creating pages, APIs, DB schema, or service modules
- reviewing whether a change still fits the MVP

Do not use this skill when:
- doing narrow syntax-only fixes
- fixing formatting only
- making unrelated infra changes

## Core rules
- Keep the app focused on fixed 1-minute script practice
- Do not introduce free conversation or real-time conversation
- Preserve voice provider abstraction
- Preserve evaluator abstraction
- Prefer one working vertical slice over partial scattered features

## Checkpoints
When implementing a feature, verify:
1. Does it stay within MVP scope?
2. Does it preserve provider-swappable design?
3. Does it keep route handlers thin?
4. Does it update DB/types/migrations consistently?
5. Does it support the main user flow?
6. Does it produce user-friendly error messages?