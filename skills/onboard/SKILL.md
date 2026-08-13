---
name: onboard
description: Generate or refresh a CLAUDE.md for the current repository — the facts and commands an agent needs that it cannot derive from the tree, kept terse because every line costs context in every future session.
disable-model-invocation: true
---

Produce a `CLAUDE.md` for this repository that makes every future session faster.

## Gather (do not guess)

1. Run `/ultra:recon` scope if the repo is unmapped; reuse the session's map if it exists.
2. Verify every command you intend to document by running it (or mark it unverified with the reason).
3. Diff against any existing `CLAUDE.md`: keep what is still true, drop what the tree now contradicts, preserve the owner's hand-written notes — they encode intent you cannot recover.

## Include — only what the tree cannot say

- Build / test / lint / typecheck commands, verbatim, with any non-obvious flags
- How to run one test (the single-test invocation is the most-used command an agent needs)
- Layout notes only where the structure misleads: generated dirs, vendored code, the directory whose name lies
- Conventions that constrain edits and are not enforced by tooling (naming, error-handling idiom, import style)
- Sharp edges: the test that needs a service running, the config that must not be committed, the slow suite to avoid
- Monorepos: per-package variations, where shared code lives, how packages reference each other

## Exclude

File trees the agent can list, code the agent can read, history git already records, aspirations ("we plan to…"), anything derivable in one tool call. A CLAUDE.md is not documentation for humans — it is context an agent pays for every session. Target: under ~60 lines. Every line must earn its recurring cost.

## Deliver

Write `CLAUDE.md` at the repo root (or show the diff against the existing one), then a one-line summary per section of what changed and why.
