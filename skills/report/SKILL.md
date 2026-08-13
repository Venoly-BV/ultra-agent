---
name: report
description: Close a task in the Venoly §56 final response format — Result, Changes, Verification, Pros, Cons, Risks, Questions, Remaining Work — with change classification tags and honest verified/not-verified accounting.
---

Produce the Constitution §56 final response for the work just completed.

Before writing it, run the §55 final review and the §81 self-review. Fix material issues found there **before** reporting — the checklist is a gate, not a form.

## Format

**## Result** — what was accomplished, in a few sentences.

**## Changes** — grouped by classification tag (§10), each entry with `path:line` and the substance of the change, not a diff replay:

```text
[ADD]     ...
[MODIFY]  ...
[REMOVE]  ...   (file, reason, replacement, compatibility impact — §63)
[FIX]     ...
[SECURITY] / [MIGRATION] / [BREAKING] / [CONFIG] / [DOCS] / [TEST] / [INFRA] as applicable
```

**## Verification** — only checks actually performed, split explicitly:

```text
VERIFIED
- <command>  → <result>

NOT VERIFIED
- <what, and why it could not be checked>
```

Never list a check you did not run (§22, §52). "I expect this to pass" is not verification, and it belongs under Risks.

**## Pros** / **## Cons** — required for significant architectural, behavioral, dependency, infra, database, or security changes (§12). Do not manufacture disadvantages; if a trade-off is negligible, say so.

**## Risks** — what could still go wrong, including anything a reviewer should look at hardest. For high-risk changes add the §34 block: blast radius, rollback, migration, downtime, data-loss risk, security impact.

**## Questions** — only unresolved items that materially matter, priority-labeled (§7).

**## Remaining Work** — what was intentionally left incomplete, plus `[OPTIONAL]` improvements identified but not implemented (§57), each with reason, pros, cons, risk.

## Rules

- Report every deletion (§63), every unrequested addition (§64), and every scope expansion with its reason (§65).
- Applying uncertainty: KNOWN / INFERRED / UNKNOWN / REQUIRED (§53). Never convert an inference into a fact.
- Omit sections that genuinely do not apply to a small change. A two-line fix does not need a Pros/Cons analysis — §60 forbids ceremony for its own sake.
