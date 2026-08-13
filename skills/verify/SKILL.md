---
name: verify
description: Prove a change works before reporting it — narrowest failing check first, widen in rings, adversarial pass for high-stakes work. Use after any substantive change, and whenever tempted to report "done" without having run anything.
---

A change that has not been run is a hypothesis. Prove it or label it one.

## Rings, inside out

Run the narrowest check that could actually fail, then widen one ring at a time. Stop widening when a ring is green and the next ring adds no new information about *this* change:

1. **The line**: does it parse/typecheck? (`tsc --noEmit`, `python -c "import x"`, `cargo check`, `go vet`)
2. **The behavior**: the single test covering the change. If none exists and the change is risky, write one — and make sure it *fails on the old code*; a test that passes both before and after proves nothing.
3. **The file/package**: the surrounding test scope.
4. **The seams**: integration tests over the boundaries the change touches.
5. **The tree**: full suite / full build — only when the radius was wide enough to warrant it.

Use the repo's real commands (from CI config, recon, or CLAUDE.md) — never guessed ones.

## Rules

- A red check stops the line: fix it or report it. Never continue past a failure because the change "looks right", and never re-run a flaky-looking test into submission without saying so (three runs, report the ratio).
- Exit codes over vibes: check `$?`, not the shape of the output.
- Verify the *absence* too: after a removal, prove the thing is gone (grep residue, dead route returns 404, old flag rejected).
- No harness available? Say exactly what could not be verified and what would verify it. That sentence is the deliverable.

## Adversarial ring

For changes that are expensive to be wrong about — data migrations, auth logic, public API, anything irreversible — send the finished work to `ultra:adversary` with the claim stated crisply ("all callers updated; test X proves behavior Y"). Its verdict (CONFIRMED / REFUTED / UNPROVEN) goes into the final report verbatim.

## Reporting language

Calibrate claims to evidence: "tests pass" requires having run them, in this tree, after the last edit. Anything less is "I expect this to pass because…". The report states the exact commands and their exact results.
