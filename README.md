# Venoly Ultra Agent

An autonomous engineering agent stack for Claude Code, built for large repositories.

Fourteen specialist subagents, ten skills, three multi-agent workflows, three safety hooks, and four repo-scale CLI utilities — governed by the **Venoly Engineering Constitution**, a production specification for how an engineering agent should behave: understand before changing, verify before claiming, test before trusting, document before forgetting.

> **Owned and published by Venoly B.V.** · Authored by @mcs.s (Discord) / @founder (venoly.nl)

## Install

Point Claude Code at this folder and say *"install this into `<repo>`"* — [`CLAUDE.md`](CLAUDE.md) tells it exactly what to do. Or run it yourself:

```bash
./install.sh /path/to/your/repo --with-bin
```

Then restart Claude Code in that repo. Uninstall with `./install.sh /path/to/your/repo --uninstall`.

Three modes: `plugin` (default — namespaced, updatable), `copy` (checked into the repo for your team), `symlink` (live-linked, for developing this bundle). See [`INSTALL.md`](INSTALL.md) for the details and trade-offs.

## What you get

### Skills

| Command | What it does |
| :-- | :-- |
| `/ultra <task>` | The full engineering arc — discover, locate, scope, plan, execute, verify, report |
| `/ultra:audit` | Full-project audit across the Constitution's 25 dimensions, with honest coverage accounting |
| `/ultra:recon` | Orient in a large or unfamiliar repo without flooding context |
| `/ultra:blast-radius <symbol>` | The complete impact set before you change a shared symbol |
| `/ultra:refactor` | Multi-file change protocol — enumerate, exceptions first, residue check |
| `/ultra:verify` | Prove the change works: narrowest failing check, widening in rings |
| `/ultra:docwork` | PDFs, spreadsheets, docx, notebooks, large corpora — cited, never paraphrased |
| `/ultra:onboard` | Generate a terse, accurate `CLAUDE.md` for the repo |
| `/ultra:report` | Close a task in the Constitution's §56 response format |
| `/ultra:constitution` | The full operating specification |

### Agents

`@ultra:prime` orchestrates; the rest are delegated to by the shape of the work.

| Agent | Domain |
| :-- | :-- |
| `prime` | Orchestrator — carries the Constitution, runs the arc, delegates |
| `cartographer` | Repo structure, subsystem boundaries, ownership |
| `tracer` | Every reference to a symbol — including the ones static analysis misses |
| `surgeon` | Well-specified mechanical change across many files |
| `mechanic` | Red builds and tests driven to green, with a causal story |
| `adversary` | Attacks a finding or fix before you trust it; CONFIRMED / REFUTED / UNPROVEN |
| `archaeologist` | Why does this exist; when did it break |
| `sentinel` | Security review — taint paths, missing authz, secrets, crypto misuse |
| `dba` | Schema, migrations, query behavior, data integrity |
| `operator` | CI/CD, infra, config, observability, deployment readiness |
| `optimizer` | Measured performance work — baseline, profile, prove |
| `auditor` | Full-project audit mode |
| `archivist` | Documents and corpora |
| `scribe` | Docs, ADRs, runbooks, changelogs |

### Workflows

Multi-agent orchestration for jobs too big for one context. Each holds its plan in a script, so intermediate results live in script variables instead of your context window — you get the report, not the transcript.

| Command | Orchestration |
| :-- | :-- |
| `/ultra:audit-sweep [scope]` | Recon → one auditor per risk dimension → **adversarial verification of every finding** → ranked report with a coverage block. Dimensions absent from the repo are dropped before any agent spawns; findings that fail refutation are excluded rather than reported. |
| `/ultra:radius-sweep <symbol>` | Seven reference-class searchers in parallel, each blind to the others → a completeness critic that hunts what their *techniques* could not reach (aliases, runtime-built names, unasked classes) → ordered edit plan with a confidence verdict. |
| `/ultra:migrate <change>` | Discover sites → **stop if the spec is ambiguous** → shared files and exceptional sites first, serialized → mechanical sites in disjoint parallel batches → residue check, typecheck, tests. |

The verification stage is the point. A single-pass audit reports what one agent believed; `audit-sweep` sends every finding to an independent agent whose default verdict is REFUTED, so what survives has been attacked. `radius-sweep` applies the same idea to search: seven blind searchers plus a critic beat one searcher who anchors on their first working pattern.

Each script starts with `const USE_SPECIALISTS = true`, which routes stages to the agents above via `agentType`. Set it to `false` to run every stage on the default workflow subagent — the prompts are self-sufficient either way.

Workflows need Claude Code v2.1.154+ and can spawn many agents. Try a narrow scope first (`/ultra:audit-sweep src/api`) to gauge cost, and watch progress with `/workflows`.

### Hooks

- **`guard.py`** (`PreToolUse` on Bash) — denies catastrophic commands (`rm -rf /`, `mkfs`, `dd` to a block device, force-push to main), escalates destructive-but-legitimate ones (`git reset --hard`, `git clean -fd`, `DROP TABLE`, `docker system prune`) to a permission prompt. Deliberately narrow: a guard that cries wolf gets disabled.
- **`validate.py`** (`PostToolUse` on Edit/Write/NotebookEdit) — parses the file that was just written and reports a syntax error straight back into context. Catching a broken edit on the turn that caused it costs one turn; finding it three edits later costs the reasoning behind all three. Python, JSON, TOML, YAML, JS, shell, Go, notebooks. Silent on everything else — a noisy PostToolUse hook taxes every edit in the session, so compilers and type checkers deliberately stay out.
- **`orient.py`** (`SessionStart`) — scale, languages, git state, manifests, whether CI exists (and therefore whether any command is proven), and the traps that matter here. Runs in ~75ms.

### CLI utilities (`bin/`, on `PATH` when installed as a plugin)

- **`ultra-map [path] [--json]`** — one-shot orientation: scale, languages, workspace layout, entry points (by convention *and* content scan), churn, and traps. Its core output is **commands with provenance** — `verified-by-ci` (has to work), `declared` (the project says so), `inferred` (from the toolchain, unproven) — derived from CI, then Makefile targets, then manifests, then toolchain convention. An agent that knows which tier a command came from knows what it may assert.
- **`ultra-graph [path] [--file F] [--cycles] [--json]`** — the import graph. Hubs by fan-in (widest blast radius), fan-out leaders (hardest to test in isolation), circular dependencies, and orphans. `--file` answers "who imports this, and what does it import" — real edges, not text matches. Python, JS/TS, Go, Rust, Java/Kotlin, C/C++, Ruby.
- **`ultra-radius <symbol>`** — blast-radius sweep across seven reference classes: word-boundary, string references in configs and fixtures, composites, dynamic-access idioms, tests. Flags when a codebase's dynamism caps static confidence.
- **`ultra-doc <file>`** — extraction for PDF, xlsx, docx, pptx, ipynb, csv, with `--inventory` for corpora. Reports extraction *failure* explicitly rather than returning plausible emptiness.

### Optional: real code intelligence

`./scripts/enable-lsp.sh` scans your PATH and writes an `.lsp.json` containing **only the language servers you actually have installed**, giving Claude go-to-definition, find-references, and live diagnostics instead of text search. A server declared but not installed fails silently at startup, which is why the config is generated rather than shipped. `--dry-run` to preview, `--remove` to undo.

## Design notes

**Tool sets are chosen for the background-subagent intersection.** Claude Code strips most built-in tools from subagents running in the background (the default since v2.1.198). Every agent here uses only tools that survive that filter, so a given definition behaves identically in foreground and background.

**Read-only agents are read-only by construction.** `cartographer`, `tracer`, `adversary`, `archaeologist`, `sentinel`, and `auditor` are restricted to `Read, Grep, Glob, Bash` in frontmatter. Diagnosis and repair in the same hands compromises both.

**Plugin agents cannot use `hooks`, `mcpServers`, or `permissionMode`** — Claude Code ignores those fields for plugin-shipped agents. Install with `--mode copy` if you need them.

**Every agent has an explicit output contract.** A subagent returns only its final message; everything it read is discarded. Each prompt therefore ends by specifying the shape of what comes back.

**Memory is a protocol, not a flag.** `prime`, `cartographer`, and `mechanic` carry project-scoped memory, and their prompts say exactly what to record (the map, commands *and which were actually run*, hubs, gotchas, and the wrong turns that cost time), what to read before orienting, and when to treat a map as stale and overwrite it. A `memory:` field with no protocol behind it does nothing — the second session ends up as slow as the first.

**Verification is measured, not asserted.** `scripts/selftest.sh` (93 checks) proves the bundle is well-formed. `scripts/smoke.sh` proves the prompts change behaviour: it builds a fixture with a decoy test command in `package.json`, a reference reachable only from a config file, and an invitation to claim success without running anything — then runs real `claude -p` probes and checks the answers. All three pass.

**Context cost is budgeted deliberately.** The whole stack adds ~1.9k tokens to every session — that is the always-on cost of 24 component descriptions, and nothing more loads until something fires. The Constitution itself is ~12.6k tokens and is preloaded into only two agents, `prime` and `auditor`, where it governs the work. Every other agent carries its domain rules in its own prompt and can pull the Constitution on demand via `/ultra:constitution`. Check the real numbers any time with `claude plugin details ultra`.

## Licence

MIT. The Venoly Engineering Constitution is owned and published by Venoly B.V. ( https://venoly.nl )
