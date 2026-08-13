# Developing the Ultra Agent bundle

## Layout

```
ultra-agent/
├── .claude-plugin/
│   ├── plugin.json          manifest — `name` is the only required field
│   └── marketplace.json     catalog; `source: "."` points at this directory
├── agents/*.md              14 subagents (recursive; subdirs would become part
│                            of the scoped id, e.g. ultra:review:security)
├── skills/<name>/SKILL.md   10 skills
├── hooks/
│   ├── hooks.json           event → matcher → command
│   ├── guard.py             PreToolUse on Bash
│   └── orient.py            SessionStart
├── bin/                     added to the Bash tool's PATH when installed as a plugin
├── install.sh               plugin | copy | symlink, plus --uninstall
└── CLAUDE.md                what Claude reads when pointed at this folder
```

Components live at the plugin **root**, never inside `.claude-plugin/` — only `plugin.json` belongs there. This is the most common reason a plugin loads but appears empty.

## Constraints that bite

**Plugin agents ignore `hooks`, `mcpServers`, and `permissionMode`.** Claude Code strips these from plugin-shipped agents for security. Supported: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation` (only `"worktree"`). Anything needing the stripped fields must be installed with `--mode copy`.

**Background subagents lose most built-in tools.** Since v2.1.198 subagents run in the background by default, and a background subagent keeps only: `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact`. Every agent here stays inside that set, so a definition behaves the same in either mode. If you add an agent that needs `Agent` or `AskUserQuestion`, it will silently not have them in the background.

**`name` cannot contain `:`** — that is reserved for plugin scoping. Claude Code refuses to load such a file and logs the error only to the debug log.

**Skill names collide across scopes.** A skill named `run` or `init` shadows or is shadowed by a built-in. In `copy` mode the `ultra:` prefix is gone, so pick names that survive unprefixed.

**`${CLAUDE_PLUGIN_ROOT}`** is the only correct way to reference bundle files from `hooks.json`. Quote it: `"command": "python3 \"${CLAUDE_PLUGIN_ROOT}\"/hooks/guard.py"`. In `copy` mode the installer rewrites these to `${CLAUDE_PROJECT_DIR}/.claude/hooks/ultra/...`.

**Cross-references are written for plugin mode.** Skills and agents refer to each other as `ultra:tracer` and `/ultra:verify`. In `copy` mode the installer strips the `ultra:` prefix from the copied Markdown (`sed 's/\bultra:\([a-z-]\)/\1/g'`), because unprefixed is correct there. Symlink mode shares the source and cannot be rewritten — it warns instead. If you add a cross-reference, write it prefixed and the installer handles the rest.

**Watch the token budget.** `claude plugin details ultra` reports always-on and on-invoke cost per component. Always-on is paid in every session by every user, so descriptions stay tight. The Constitution is ~12.6k on invoke, which is why only `prime` and `auditor` preload it via `skills:` — adding it to more agents multiplies that cost per delegation.

## Testing changes

```bash
claude plugin validate . --strict         # manifests + all frontmatter
./scripts/selftest.sh                     # 93 static checks — fast, free, run always
./scripts/smoke.sh --yes                  # live claude -p probes — costs tokens
./install.sh /tmp/scratch-repo --dry-run  # installer without side effects
```

`selftest.sh` proves the bundle is well-formed: manifests, frontmatter against the plugin-supported field list, guard-hook decisions, validate-hook true *and* false positives, workflow syntax and runtime constraints, namespace collisions, bin-utility behaviour on synthetic fixtures, and installer parse.

`smoke.sh` proves the prompts change behaviour. It builds a fixture with three traps — a decoy `test` script in `package.json` while the real command lives in CI, a symbol referenced only from a config file, and a request that invites claiming success without running anything — then checks the answers for the signals the doctrine requires. When a probe fails, suspect the assertion before the agent: on the first run all the failures were bad regexes, and one agent response correctly identified a flaw in the fixture itself.

For an end-to-end check, install into a scratch repo with `--mode copy`, start Claude Code there, and confirm the skills appear in `/` and the agents in `@`.

Hook scripts are testable directly — they read JSON on stdin:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git reset --hard"}}' | python3 hooks/guard.py
```

## Writing agents

Each prompt should carry four things: a sharp scope, the method that makes the role hard to do badly, the hard rules, and an **explicit output contract**. The last matters most — a subagent returns only its final message, so if you do not say what shape to return, you get an essay.

Restrict `tools` to what the role needs. Read-only roles get `Read, Grep, Glob, Bash` and are then read-only by construction, not by request.

Keep `description` trigger-rich: it is the only thing the router sees when deciding whether to delegate.

## Writing skills

A skill's body stays in context across turns once loaded, so every line is a recurring cost. State what to do, not why it matters. Put long reference material in a sibling file and link to it — that loads only when read.

`disable-model-invocation: true` makes a skill user-only (`/name`), and also prevents it from being preloaded into subagents via the `skills:` frontmatter field. `audit` and `onboard` use it; `constitution` deliberately does not, because `prime` and `auditor` preload it.

## Writing workflows

Scripts live in `workflows/*.js` and run as `/ultra:<meta.name>`. The runtime wraps the body in an async function, so top-level `await` and `return` are legal there but **not** in a bare ES module — `node --check` on the raw file fails. `scripts/selftest.sh` wraps before checking; do the same if you check by hand.

Runtime constraints, all enforced by the self-test:

- **No module loading.** A script containing `import(` fails before the run starts. Avoid the substring even inside prompt strings.
- **No `Date.now()`, `Math.random()`, or argless `new Date()`.** They break resume determinism. Pass timestamps through `args`; vary agents by index rather than randomly.
- **No filesystem or shell** from the script itself. Agents do the work; the script coordinates.
- **`meta` must be a pure literal** — no interpolation, no calls. Keep `meta.phases` titles in sync with every `phase()` call and `phase:` option; the self-test cross-checks them.
- Caps: 16 concurrent agents, 1000 per run, 4096 items per `parallel`/`pipeline` call.

Design notes for this bundle's three:

- **Pipeline by default, barrier only when earned.** `audit-sweep` pipelines audit → verify so a dimension's findings verify while slower dimensions still run. It barriers only before synthesis, which genuinely needs every result at once. `radius-sweep` barriers before its cross-check for the same reason: the critic must see every searcher's *technique* to reason about the gaps between them.
- **Announce every cap.** When a run drops dimensions, batches, or files, it `log()`s exactly what was skipped. Silent truncation reads as "covered everything".
- **`USE_SPECIALISTS`** at the top of each script toggles `agentType` routing to the Ultra agents. Scoped names like `ultra:sentinel` resolve in plugin mode; the installer rewrites them for copy mode. Prompts stay self-sufficient so either path produces sensible work.
- **Name collisions matter.** Skills and workflows share one `/ultra:<name>` namespace — that is why the fan-out version of the blast-radius analysis is `radius-sweep`, not `blast-radius`. The self-test fails on a duplicate.

`claude plugin details` does not enumerate workflows; its inventory covers skills, agents, hooks, MCP, and LSP only. Confirm placement by checking the installed cache under `~/.claude/plugins/cache/`, or just run the command.

## Releasing

Bump `version` in **both** `.claude-plugin/plugin.json` and the marketplace entry — they must agree, and `claude plugin tag` validates that before creating a `ultra--v<version>` git tag. Users only receive updates when `version` changes.
