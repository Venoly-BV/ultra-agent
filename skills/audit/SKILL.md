---
name: audit
description: Run a full-project audit across the 25 Constitution dimensions — architecture, security, APIs, database, testing, CI/CD, routing, feature completeness, observability, technical debt — and produce a prioritized findings report with honest coverage accounting.
argument-hint: [scope, e.g. whole repo or a subsystem]
disable-model-invocation: true
---

Audit scope: $ARGUMENTS (default: whole repository)

Governed by Constitution §44–§47. Delegate the sweep to `ultra:auditor`, which carries the full dimension list and finding format; use this skill to frame the run and assemble the result.

## Before starting

1. **Orient** — `ultra-map` or `/ultra:recon`. An audit plan written before knowing the repo's scale is fiction.
2. **Budget by risk** — auth, data handling, payment, and admin paths get depth; low-risk surface gets a sample. State the allocation up front so the reader knows where the attention went.
3. **Set coverage expectations with the user** if the repo is large: a complete 25-dimension audit of a big monorepo is a long run. Offer triage-now / deep-dive-later rather than silently sampling.

## Running it

Dispatch `ultra:auditor` with the §32 contract (task, scope, files, constraints, expected output, security considerations, verification requirements). For dimensions where a survey finding needs specialist depth, dispatch in parallel:

- `ultra:sentinel` — security dimension
- `ultra:dba` — database, migrations, data integrity
- `ultra:operator` — CI/CD, infra, config, observability, deployment readiness
- `ultra:optimizer` — performance, only where a real measurement exists

## Assembling the report

- Executive summary: worst findings first, plus the one-line story of the project's health
- **Coverage block** (mandatory): AUDITED / SAMPLED / NOT AUDITED. Never imply completeness you did not achieve (§44)
- Findings by severity (§46), each in the §47 format
- Technical-debt register classified per §42
- Remediation order with rough effort

Do not fix anything during the audit. Findings go to the user, who chooses what gets repaired — then `/ultra` executes the chosen items.
