#!/usr/bin/env bash
# Venoly Ultra Agent — installer.
#
#   ./install.sh [TARGET_REPO] [options]
#
# Installs the Ultra agent stack into a target repository. Run with no
# arguments to install into the current directory.
#
# Options:
#   --mode plugin|copy|symlink   how to install (default: plugin)
#   --scope project|user|local   plugin scope (default: project)
#   --with-bin                   also link bin/ utilities into ~/.local/bin
#   --uninstall                  remove a previous install from TARGET_REPO
#   --dry-run                    print what would happen, change nothing
#   -h, --help                   this message
#
# Modes:
#   plugin   Registers this directory as a marketplace and installs the plugin.
#            Namespaced (/ultra:recon, ultra:prime), updatable, does not copy
#            files into the repo. Best default.
#   copy     Copies agents/skills/hooks into TARGET/.claude/. Self-contained and
#            checked into the repo for the whole team; unprefixed (/recon).
#   symlink  Like copy, but symlinks — edits here take effect immediately.
#            For developing this bundle, not for shared repos.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="ultra"
MARKET_NAME="ultra-agent"

TARGET=""
MODE="plugin"
SCOPE="project"
WITH_BIN=0
UNINSTALL=0
DRY=0

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m::\033[0m %s\n' "$*"; }
ok() { printf '\033[32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m !\033[0m %s\n' "$*" >&2; }
run() {
  if [ "$DRY" = 1 ]; then printf '   would run: %s\n' "$*"; else "$@"; fi
}

usage() { sed -n '2,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --with-bin) WITH_BIN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *) [ -z "$TARGET" ] || die "unexpected argument: $1"; TARGET="$1"; shift ;;
  esac
done

TARGET="${TARGET:-$PWD}"
[ -d "$TARGET" ] || die "target is not a directory: $TARGET"
TARGET="$(cd "$TARGET" && pwd)"

case "$MODE" in plugin|copy|symlink) ;; *) die "--mode must be plugin, copy, or symlink" ;; esac
case "$SCOPE" in project|user|local) ;; *) die "--scope must be project, user, or local" ;; esac

if [ "$TARGET" = "$SRC" ] && [ "$UNINSTALL" = 0 ]; then
  die "target is the bundle itself — pass the repository you want to install into,
       e.g. ./install.sh ~/code/my-app"
fi

CLAUDE_DIR="$TARGET/.claude"
AGENT_DIR="$CLAUDE_DIR/agents/ultra"
SKILL_DIR="$CLAUDE_DIR/skills"
HOOK_DIR="$CLAUDE_DIR/hooks/ultra"
WORKFLOW_DIR="$CLAUDE_DIR/workflows"
SETTINGS="$CLAUDE_DIR/settings.json"

# ---------------------------------------------------------------- uninstall --
if [ "$UNINSTALL" = 1 ]; then
  info "uninstalling from $TARGET"
  if command -v claude >/dev/null 2>&1; then
    (cd "$TARGET" && run claude plugin uninstall "$PLUGIN_NAME" 2>/dev/null) || true
    (cd "$TARGET" && run claude plugin marketplace remove "$MARKET_NAME" 2>/dev/null) || true
  fi
  for p in "$AGENT_DIR" "$HOOK_DIR"; do
    [ -e "$p" ] && { run rm -rf "$p"; ok "removed $p"; }
  done
  for f in "$SRC"/workflows/*.js; do
    [ -e "$f" ] || continue
    w="$WORKFLOW_DIR/$(basename "$f")"
    [ -e "$w" ] && { run rm -f "$w"; ok "removed $w"; }
  done
  for d in "$SRC"/skills/*/; do
    name="$(basename "$d")"
    [ -e "$SKILL_DIR/$name" ] && { run rm -rf "$SKILL_DIR/$name"; ok "removed $SKILL_DIR/$name"; }
  done
  if [ -f "$SETTINGS" ] && command -v python3 >/dev/null 2>&1; then
    run python3 - "$SETTINGS" <<'PY'
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
hooks = d.get("hooks", {})
for ev in list(hooks):
    kept = []
    for entry in hooks[ev]:
        inner = [h for h in entry.get("hooks", [])
                 if "ultra" not in str(h.get("command", ""))]
        if inner:
            entry["hooks"] = inner
            kept.append(entry)
    if kept:
        hooks[ev] = kept
    else:
        del hooks[ev]
if not hooks:
    d.pop("hooks", None)
else:
    d["hooks"] = hooks
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
print("   cleaned ultra hooks from settings.json")
PY
  fi
  for b in ultra-map ultra-radius ultra-doc ultra-graph; do
    [ -L "$HOME/.local/bin/$b" ] && { run rm -f "$HOME/.local/bin/$b"; ok "unlinked $b"; }
  done
  ok "uninstalled"
  exit 0
fi

# ------------------------------------------------------------------ preflight --
[ -f "$SRC/.claude-plugin/plugin.json" ] || die "bundle looks incomplete: no .claude-plugin/plugin.json in $SRC"
command -v python3 >/dev/null 2>&1 || warn "python3 not found — hooks and bin utilities will not run"

info "source: $SRC"
info "target: $TARGET"
if [ "$DRY" = 1 ]; then info "mode:   $MODE (dry run — nothing will change)"; else info "mode:   $MODE"; fi

# --------------------------------------------------------------------- plugin --
install_plugin() {
  command -v claude >/dev/null 2>&1 || die "claude CLI not found on PATH — use --mode copy instead"
  info "registering marketplace ($SCOPE scope)"
  (cd "$TARGET" && run claude plugin marketplace add "$SRC" --scope "$SCOPE") \
    || warn "marketplace add reported an error (it may already be registered)"
  info "installing plugin"
  (cd "$TARGET" && run claude plugin install "${PLUGIN_NAME}@${MARKET_NAME}" --scope "$SCOPE" -y) \
    || die "plugin install failed — see the message above, or use --mode copy"
  ok "plugin installed"
  cat <<EOF

  Skills:  /ultra:ultra  /ultra:recon  /ultra:audit  /ultra:constitution
           /ultra:blast-radius  /ultra:refactor  /ultra:verify
           /ultra:docwork  /ultra:onboard  /ultra:report
  Agents:  @ultra:prime and 13 specialists
  Note:    the marketplace points at $SRC on this machine. For a team, push
           this bundle to git and re-add the marketplace by its git URL.
EOF
}

# ------------------------------------------------------------- copy / symlink --
place() {  # place <src> <dest>
  local s="$1" d="$2"
  run mkdir -p "$(dirname "$d")"
  run rm -rf "$d"
  if [ "$MODE" = symlink ]; then run ln -s "$s" "$d"; else run cp -r "$s" "$d"; fi
}

install_files() {
  info "placing components into $CLAUDE_DIR"
  run mkdir -p "$AGENT_DIR" "$SKILL_DIR" "$HOOK_DIR"

  for f in "$SRC"/agents/*.md; do
    place "$f" "$AGENT_DIR/$(basename "$f")"
  done
  ok "agents  -> $AGENT_DIR"

  for d in "$SRC"/skills/*/; do
    place "${d%/}" "$SKILL_DIR/$(basename "${d%/}")"
  done
  ok "skills  -> $SKILL_DIR"

  for f in "$SRC"/hooks/*.py; do
    place "$f" "$HOOK_DIR/$(basename "$f")"
  done
  ok "hooks   -> $HOOK_DIR"

  for f in "$SRC"/workflows/*.js; do
    [ -e "$f" ] || continue
    place "$f" "$WORKFLOW_DIR/$(basename "$f")"
  done
  [ -d "$WORKFLOW_DIR" ] && ok "workflows -> $WORKFLOW_DIR"

  # Components cross-reference each other by plugin-scoped name (ultra:tracer,
  # /ultra:verify). Outside plugin mode there is no prefix, so strip it from the
  # copies. Symlinks share the source and cannot be rewritten.
  if [ "$MODE" = copy ] && [ "$DRY" = 0 ]; then
    find "$AGENT_DIR" "$SKILL_DIR" -name '*.md' -type f -print0 2>/dev/null \
      | xargs -0 -r sed -i 's/\bultra:\([a-z-]\)/\1/g'
    find "$WORKFLOW_DIR" -name '*.js' -type f -print0 2>/dev/null \
      | xargs -0 -r sed -i "s/'ultra:\([a-z-]*\)'/'\1'/g"
    ok "cross-references de-namespaced for copy mode"
  elif [ "$MODE" = symlink ]; then
    warn "symlink mode: components still reference each other as 'ultra:name',
       which only resolves under plugin mode. Harmless in practice, but use
       --mode copy if you want the names to match exactly."
  fi

  merge_hooks
}

merge_hooks() {
  command -v python3 >/dev/null 2>&1 || { warn "python3 missing — skipping hook registration"; return; }
  if [ "$DRY" = 1 ]; then printf '   would merge ultra hooks into %s\n' "$SETTINGS"; return; fi
  mkdir -p "$CLAUDE_DIR"
  [ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.ultra-backup"
  python3 - "$SETTINGS" <<'PY'
import json, os, sys
path = sys.argv[1]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception as e:
        sys.exit(f"settings.json is not valid JSON ({e}) — fix it and re-run")

base = '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/ultra'
want = {
    "PreToolUse": {"matcher": "Bash",
                   "hooks": [{"type": "command",
                              "command": f'python3 {base}/guard.py', "timeout": 10}]},
    "PostToolUse": {"matcher": "Edit|Write|NotebookEdit",
                    "hooks": [{"type": "command",
                               "command": f'python3 {base}/validate.py', "timeout": 15}]},
    "SessionStart": {"hooks": [{"type": "command",
                                "command": f'python3 {base}/orient.py', "timeout": 20}]},
}
hooks = data.setdefault("hooks", {})
added = []
for event, entry in want.items():
    bucket = hooks.setdefault(event, [])
    already = any("ultra" in str(h.get("command", ""))
                  for e in bucket for h in e.get("hooks", []))
    if not already:
        bucket.append(entry)
        added.append(event)
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
print(f"   hooks registered: {', '.join(added) if added else 'already present'}")
PY
  ok "settings -> $SETTINGS"
}

link_bin() {
  local dest="$HOME/.local/bin"
  mkdir -p "$dest"
  for b in ultra-map ultra-radius ultra-doc ultra-graph; do
    run ln -sf "$SRC/bin/$b" "$dest/$b"
  done
  ok "bin utilities linked into $dest"
  case ":$PATH:" in
    *":$dest:"*) ;;
    *) warn "$dest is not on your PATH — add it to use ultra-map/ultra-radius/ultra-doc" ;;
  esac
}

case "$MODE" in
  plugin) install_plugin ;;
  copy|symlink)
    install_files
    cat <<EOF

  Skills:  /ultra  /recon  /audit  /constitution  /blast-radius
           /refactor  /verify  /docwork  /onboard  /report
  Agents:  @prime and 13 specialists (unprefixed in copy mode)
EOF
    [ "$WITH_BIN" = 0 ] && warn "bin/ utilities are not on PATH in this mode — re-run with --with-bin"
    ;;
esac

[ "$WITH_BIN" = 1 ] && link_bin

printf '\n'
ok "done — restart Claude Code (or run /reload-plugins) to load the stack"
