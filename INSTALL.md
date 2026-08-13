# Installing the Ultra Agent

## Quickest path

Open Claude Code in this folder and say:

> Install this into `~/code/my-app`

[`CLAUDE.md`](CLAUDE.md) is the instruction set Claude follows. Or do it yourself:

```bash
./install.sh ~/code/my-app --with-bin
```

Restart Claude Code in the target repo (or run `/reload-plugins`).

## Choosing a mode

### `plugin` — default

```bash
./install.sh /path/to/repo
```

Registers this folder as a local marketplace and installs the plugin, both at **project scope**, so the declarations land in `<repo>/.claude/settings.json`.

- Components are namespaced: `/ultra:recon`, `@ultra:prime`
- `bin/` utilities are added to the Bash tool's `PATH` automatically
- Updates with `claude plugin update ultra`
- Nothing is copied into the repo

**Caveat:** the marketplace source is recorded as an absolute path on this machine. A teammate cloning the repo will not resolve it. For team use, push this bundle to git and register the marketplace by URL:

```bash
cd /path/to/repo
claude plugin marketplace add https://github.com/you/ultra-agent --scope project
claude plugin install ultra@ultra-agent --scope project
```

Change scope with `--scope user` (all your projects) or `--scope local` (this machine, this repo, not committed).

### `copy` — self-contained, committable

```bash
./install.sh /path/to/repo --mode copy --with-bin
```

Copies into `<repo>/.claude/`:

```
.claude/
├── agents/ultra/*.md      14 agents
├── skills/*/SKILL.md      10 skills
├── workflows/*.js         3 workflows
├── hooks/ultra/*.py       guard.py, validate.py, orient.py
└── settings.json          hooks registered (backed up as .ultra-backup)
```

- Works with no `claude` CLI and no marketplace
- Commit it and the whole team has the stack
- Skills lose the prefix: `/recon`, `/audit`, `/ultra`
- Agents lose the prefix: `@prime`, `@sentinel`
- Unlocks `hooks`, `mcpServers`, and `permissionMode` in agent frontmatter, which Claude Code ignores for plugin-shipped agents
- `bin/` is not auto-added to `PATH` — use `--with-bin`

### `symlink` — for developing this bundle

```bash
./install.sh /path/to/repo --mode symlink
```

Same layout as `copy`, but symlinked, so edits here take effect immediately. Do not use in a shared repo — the links point at your local filesystem.

## Options

| Flag | Effect |
| :-- | :-- |
| `--mode plugin\|copy\|symlink` | Installation strategy (default `plugin`) |
| `--scope project\|user\|local` | Plugin scope (default `project`) |
| `--with-bin` | Symlink `ultra-map`, `ultra-graph`, `ultra-radius`, `ultra-doc` into `~/.local/bin` |
| `--dry-run` | Print every action, change nothing |
| `--uninstall` | Reverse a previous install |

## Verifying

```bash
claude plugin validate . --strict          # manifests and frontmatter
cd /path/to/repo && claude plugin list      # installed and enabled?
ultra-map /path/to/repo | head -30          # bin utilities on PATH?
```

In a Claude Code session in the target repo, `/ultra:recon` (or `/recon` in copy mode) should appear in the `/` menu, and `@ultra:prime` in the `@` typeahead.

## Uninstalling

```bash
./install.sh /path/to/repo --uninstall
```

Removes the plugin registration or copied files, strips the ultra hook entries from `settings.json`, and unlinks the bin utilities. Your original `settings.json` was backed up to `settings.json.ultra-backup` at install time.

## Requirements

| Component | Needs |
| :-- | :-- |
| Agents, skills | Claude Code 2.1+ |
| `plugin` mode | `claude` CLI on `PATH` |
| Hooks, `bin/` utilities | `python3` |
| `ultra-map` churn, `archaeologist` | `git` |
| `ultra-radius` (fast path) | `ripgrep` — falls back to a pure-Python walk |
| `ultra-graph`, `ultra-map` | nothing beyond `python3` |
| `enable-lsp.sh` | any language server on `PATH`; writes config for those found only |
| `ultra-doc` PDF | `pdftotext` (poppler-utils) |
| `ultra-doc` xlsx/docx (rich) | `openpyxl`, `python-docx` — falls back to zip/XML |

Everything degrades rather than failing: missing optional tools produce a stated limitation, not a crash.

## The Bash guard

Installing enables a `PreToolUse` hook on Bash. It **denies** `rm -rf /` or `~`, `mkfs`, `dd` to a block device, fork bombs, `chmod 777 /`, and force-pushes to `main`/`master` without `--force-with-lease`. It **escalates to a permission prompt** on `git reset --hard`, `git clean -fdx`, `git checkout .`, `rm -rf`, `find -delete`, `DROP TABLE`, `docker system prune`, and `kubectl delete` on stateful resources.

Everything else passes untouched. Edit `hooks/guard.py` to adjust — the `DENY` and `ESCALATE` lists are plain regex tables at the top of the file.
