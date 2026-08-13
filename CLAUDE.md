# Ultra Agent — installation instructions for Claude

**If a user has pointed you at this folder, they want the Ultra agent stack installed into one of their repositories.** This file tells you how. Follow it directly; you do not need to read the rest of the bundle first.

## What this is

A Claude Code plugin: 14 specialist subagents, 10 skills, 3 multi-agent workflows, 3 safety hooks, and 4 repo-scale CLI utilities, governed by the Venoly Engineering Constitution (`skills/constitution/SKILL.md`). Built for large repositories, multi-file editing, security and database review, full-project audits, and document work.

## Install it

**Step 1 — ask which repository**, unless the user already named one. One line, no menu:

> Which repository should I install the Ultra stack into?

**Step 2 — pick the mode.** Default to `plugin`. Use `copy` only if the user wants the stack checked into the repo for their team, or if the `claude` CLI is unavailable.

| Mode | Command | Result |
| :-- | :-- | :-- |
| `plugin` (default) | `./install.sh /path/to/repo` | Namespaced (`/ultra:recon`, `@ultra:prime`), updatable, nothing copied into the repo. Registers this folder as a local marketplace at project scope, so the declaration lands in the repo's `.claude/settings.json`. |
| `copy` | `./install.sh /path/to/repo --mode copy` | Files copied into `<repo>/.claude/`. Self-contained and committable; skills lose the `ultra:` prefix (`/recon`). |
| `symlink` | `./install.sh /path/to/repo --mode symlink` | Like copy but live-linked to this folder. For developing this bundle. |

Add `--with-bin` to link `ultra-map`, `ultra-graph`, `ultra-radius`, and `ultra-doc` into `~/.local/bin`. The agents use these when present and fall back to plain `grep`/`rg` when absent, so this is optional but recommended.

**Step 3 — run it**, then report the result. Preview with `--dry-run` first if the target repo has an existing `.claude/settings.json` you would be merging into.

```bash
cd <this bundle's directory>
./install.sh /path/to/their/repo --with-bin
```

**Step 4 — tell them to restart Claude Code** (or run `/reload-plugins`) in the target repo, and list what they now have:

- `/ultra <task>` — the full engineering arc on any substantial task
- `/ultra:audit` — full-project audit across 25 dimensions
- `/ultra:recon` — orient in a large repo
- `@ultra:prime` — delegate a whole task to the orchestrator
- 13 further specialists: `cartographer` `tracer` `surgeon` `mechanic` `adversary` `archaeologist` `sentinel` `dba` `operator` `optimizer` `auditor` `archivist` `scribe`
- Workflows (many agents, background, `/workflows` to watch): `/ultra:audit-sweep [scope]`, `/ultra:radius-sweep <symbol>`, `/ultra:migrate <change>`

Mention that workflows spawn many agents and cost meaningfully more than a normal turn — suggest starting with a narrow scope.

## Uninstalling

`./install.sh /path/to/repo --uninstall` — removes plugin registration or copied files, strips the ultra hooks from `settings.json` (a `.ultra-backup` is written on install), and unlinks the bin utilities.

## Verifying an install

```bash
claude plugin validate . --strict          # manifests, run from this bundle's root
cd /path/to/repo && claude plugin list     # is it enabled in the target repo
```

## Notes that matter

- **The marketplace source is an absolute local path.** Installing at project scope writes that path into the repo's `.claude/settings.json`, which will not resolve on a teammate's machine. For team use, push this bundle to git and register the marketplace by its git URL instead, or use `--mode copy`.
- **The `PreToolUse` hook can block Bash commands.** It denies a short list of catastrophic ones (`rm -rf /`, `mkfs`, force-push to main) and escalates destructive-but-legitimate ones (`git reset --hard`, `rm -rf`, `DROP TABLE`) to a permission prompt. Mention this — a user who does not know why a command needs confirmation will find it mysterious. It lives in `hooks/guard.py` and is easy to edit.
- **A `PostToolUse` hook syntax-checks every edit** (`hooks/validate.py`) and reports breakage back into context immediately. Silent unless something actually fails to parse.
- **Offer `./scripts/enable-lsp.sh`** if the target repo is in a language whose server they may have installed — it gives Claude real find-references instead of grep. It writes config only for binaries found on `PATH`, so it is safe to run and does nothing if none are present.
- **Do not install into this folder itself.** The installer refuses.

## Working on this bundle

Editing the stack rather than installing it? `docs/DEVELOPING.md` covers the layout, the frontmatter constraints that plugin agents are subject to, and how to test changes.
