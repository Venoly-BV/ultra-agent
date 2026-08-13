---
name: recon
description: Orient in a large or unfamiliar repository — scale, stack, entry points, real build/test commands, ownership boundaries. Use at the start of work in any repo you have not mapped, or when a task moves into an unfamiliar subsystem.
argument-hint: [optional focus, e.g. a subsystem]
---

Map the repository (focus: $ARGUMENTS) without flooding context. Product: a decision-ready map, not a tour.

## Procedure

1. **Scale**: run `ultra-map` if on PATH — one call gives scale, stack, workspace layout, commands with provenance, entry points, churn, and flags. Else: count files by type, find every manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `*.csproj`), detect workspace layout.
2. **Truth from CI**: read `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or equivalent. Those commands have to work, so they are ground truth — record them verbatim. With no CI, fall back to Makefile targets, then manifest scripts, then toolchain conventions — and label which tier each came from. `ultra-map` already reports this as `verified-by-ci` / `declared` / `inferred`. Never present an inferred command as the project's test command; run it first, or say it is unverified.
3. **Structure**: `ultra-graph` for hubs (widest blast radius), cycles, and orphans. This answers "what matters here" far more cheaply than reading files.
4. **Skeleton**: top two directory levels, annotated — product code / tests / generated / vendored. Mark generated and vendored zones; every later search excludes them.
5. **Entry points**: mains, exported package surfaces, route registrations, build targets — each as `path:line`.
6. **Docs that bind**: `CLAUDE.md`, `CONTRIBUTING.md`, `CODEOWNERS`, ADR directories. Note conventions that constrain edits (lint config, formatter, commit style).
7. **Churn** (git repos): `git log --format= --name-only -n 2000 | sort | uniq -c | sort -rn | head -15` — the hot files are where the action and the risk live.

At >5k files, do stages 1–3 inline and delegate 4–7 to `ultra:cartographer` with the focus area.

## Output

A compact map: scale, real commands (with source), annotated skeleton, entry points, constraints, hot files. Then — if this session will continue working here — offer to persist it to memory or a `CLAUDE.md` (via `/ultra:onboard`); do not write one unprompted.
