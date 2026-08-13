#!/usr/bin/env bash
# Self-test for the Ultra bundle: manifests, frontmatter, hooks, bin utilities.
# Exits non-zero on the first hard failure. Safe to run in CI.
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SRC"

PASS=0; FAIL=0
ok()   { printf '\033[32m ✓\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '\033[31m ✗\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[36m== %s ==\033[0m\n' "$*"; }

head_ "manifests"
if command -v claude >/dev/null 2>&1; then
  if claude plugin validate . --strict >/dev/null 2>&1; then
    ok "claude plugin validate --strict"
  else
    bad "claude plugin validate --strict"; claude plugin validate . --strict 2>&1 | sed 's/^/    /'
  fi
else
  printf ' - claude CLI absent, skipping manifest validation\n'
fi

for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json; do
  if python3 -c "import json,sys; json.load(open('$f'))" 2>/dev/null; then
    ok "valid JSON: $f"
  else
    bad "invalid JSON: $f"
  fi
done

head_ "agent frontmatter"
PLUGIN_OK="name description model effort maxTurns tools disallowedTools skills memory background isolation"
for f in agents/*.md; do
  out=$(python3 - "$f" "$PLUGIN_OK" <<'PY'
import re, sys
path, allowed = sys.argv[1], set(sys.argv[2].split())
text = open(path, encoding="utf-8").read()
m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
if not m:
    print("no frontmatter"); sys.exit(1)
body = text[m.end():]
keys, name, desc = [], None, None
for line in m.group(1).splitlines():
    fm = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
    if fm:
        keys.append(fm.group(1))
        if fm.group(1) == "name": name = fm.group(2).strip()
        if fm.group(1) == "description": desc = fm.group(2).strip()
errs = []
for k in keys:
    if k not in allowed:
        errs.append(f"field '{k}' is ignored for plugin agents")
if not name: errs.append("missing name")
elif ":" in name: errs.append("name contains ':' (reserved)")
elif not re.fullmatch(r"[a-z][a-z0-9-]*", name): errs.append(f"name '{name}' not lowercase-hyphen")
if not desc: errs.append("missing description")
elif len(desc) < 40: errs.append("description too short to route on")
if len(body.strip()) < 200: errs.append("body suspiciously short")
if errs: print("; ".join(errs)); sys.exit(1)
print(name)
PY
)
  if [ $? -eq 0 ]; then ok "agent $(basename "$f") -> $out"; else bad "agent $(basename "$f"): $out"; fi
done

head_ "skill frontmatter"
for f in skills/*/SKILL.md; do
  out=$(python3 - "$f" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
if not m:
    print("no frontmatter"); sys.exit(1)
fm = dict()
for line in m.group(1).splitlines():
    g = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
    if g: fm[g.group(1)] = g.group(2).strip()
errs = []
if not fm.get("description"): errs.append("missing description")
n = fm.get("name")
if n and not re.fullmatch(r"[a-z][a-z0-9-]*", n): errs.append(f"bad name '{n}'")
dirname = path.split("/")[-2]
if n and n != dirname: errs.append(f"name '{n}' != dir '{dirname}' (invocation name may surprise)")
if errs: print("; ".join(errs)); sys.exit(1)
print(n or dirname)
PY
)
  if [ $? -eq 0 ]; then ok "skill $out"; else bad "skill $(dirname "$f"): $out"; fi
done

head_ "hooks"
for f in hooks/*.py; do
  python3 -c "import ast,sys; ast.parse(open('$f').read())" 2>/dev/null \
    && ok "parses: $f" || bad "syntax error: $f"
  [ -x "$f" ] && ok "executable: $f" || bad "not executable: $f"
done

# guard behaviour
guard_case() { # <expect> <command>
  local expect="$1" cmd="$2"
  local got
  got=$(printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$cmd")" \
        | python3 hooks/guard.py 2>/dev/null \
        | python3 -c 'import json,sys
d=sys.stdin.read().strip()
print(json.loads(d)["hookSpecificOutput"]["permissionDecision"] if d else "pass")' 2>/dev/null)
  if [ "$got" = "$expect" ]; then ok "guard $expect: $cmd"; else bad "guard expected $expect, got '$got': $cmd"; fi
}
guard_case deny     "rm -rf /"
guard_case deny     "mkfs.ext4 /dev/sda1"
guard_case deny     "git push --force origin main"
guard_case escalate "git reset --hard HEAD~3"
guard_case escalate "rm -rf ./build"
guard_case escalate "DROP TABLE users;"
guard_case pass     "git status"
guard_case pass     "npm test"
guard_case pass     "git push --force-with-lease origin feature/x"
guard_case pass     "rm ./tmpfile"

# validate.py: must flag broken files, stay silent otherwise
VT=$(mktemp -d)
validate_case() { # <expect: flag|silent> <filename> <content>
  local expect="$1" name="$2" body="$3" out
  printf '%b' "$body" > "$VT/$name"
  out=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$VT/$name" \
        | python3 hooks/validate.py 2>/dev/null)
  if [ "$expect" = flag ]; then
    printf '%s' "$out" | grep -q 'SYNTAX ERROR' \
      && ok "validate flags: $name" || bad "validate missed broken $name"
  else
    [ -z "$out" ] && ok "validate silent: $name" || bad "validate false-positive on $name"
  fi
}
validate_case flag   bad.py    'def f(:\n  pass\n'
validate_case silent good.py   'def f():\n    return 1\n'
validate_case flag   bad.json  '{"a": 1,}\n'
validate_case silent good.json '{"a": 1}\n'
validate_case silent good.rs   'fn main() { let x = ( ; }\n'
validate_case silent empty.json ''
out=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/missing.py"}}' "$VT" \
      | python3 hooks/validate.py 2>/dev/null)
[ -z "$out" ] && ok "validate silent on missing file" || bad "validate spoke about a missing file"
out=$(printf '{"tool_name":"Bash","tool_input":{"command":"ls"}}' \
      | python3 hooks/validate.py 2>/dev/null)
[ -z "$out" ] && ok "validate ignores non-edit tools" || bad "validate fired on a Bash call"
rm -rf "$VT"

# orient runs and stays quiet enough
if out=$(cd /tmp && python3 "$SRC/hooks/orient.py" 2>/dev/null) && [ -n "$out" ]; then
  n=$(printf '%s\n' "$out" | wc -l)
  [ "$n" -le 6 ] && ok "orient.py output is $n lines" || bad "orient.py too verbose: $n lines"
else
  bad "orient.py produced no output"
fi

head_ "workflows"
if command -v node >/dev/null 2>&1; then
  for f in workflows/*.js; do
    [ -e "$f" ] || continue
    # the runtime wraps the body in an async fn, so top-level await/return are
    # legal there but not in a bare module — wrap before syntax-checking
    T=$(mktemp /tmp/wfchk-XXXXXX.mjs)
    { echo "(async () => {"; sed 's/^export const meta/const meta/' "$f"; echo "})()"; } > "$T"
    if node --check "$T" 2>/dev/null; then ok "parses: $f"; else
      bad "syntax error: $f"; node --check "$T" 2>&1 | sed 's/^/    /' | head -5
    fi
    rm -f "$T"
  done
else
  printf ' - node absent, skipping workflow syntax check\n'
fi

for f in workflows/*.js; do
  [ -e "$f" ] || continue
  # `import(` is rejected by the runtime before the run starts; the other three
  # break resume determinism. None may appear anywhere, including in strings.
  if grep -qE 'import\s*\(|Date\.now|Math\.random|new Date' "$f"; then
    bad "forbidden runtime construct in $f"; grep -nE 'import\s*\(|Date\.now|Math\.random|new Date' "$f" | sed 's/^/    /' | head -3
  else
    ok "no forbidden constructs: $(basename "$f")"
  fi
  out=$(python3 - "$f" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
m = re.match(r"export const meta = \{(.*?)\n\}", text, re.S)
if not m:
    print("meta block missing or not at the top"); sys.exit(1)
block = m.group(1)
errs = []
if not re.search(r"\bname:\s*'[a-z][a-z0-9-]*'", block): errs.append("meta.name missing or not kebab-case")
if not re.search(r"\bdescription:\s*'", block): errs.append("meta.description missing")
if re.search(r"\$\{|\bDate\b|\(\)", block): errs.append("meta must be a pure literal (no interpolation or calls)")
# every phase() title should have a matching meta.phases entry
titles = set(re.findall(r"phase\('([^']+)'\)", text)) | set(re.findall(r"phase:\s*'([^']+)'", text))
declared = set(re.findall(r"title:\s*'([^']+)'", block))
missing = titles - declared
if missing: errs.append(f"phase(s) not declared in meta.phases: {sorted(missing)}")
if errs: print("; ".join(errs)); sys.exit(1)
print(re.search(r"name:\s*'([a-z0-9-]+)'", block).group(1))
PY
)
  if [ $? -eq 0 ]; then ok "meta valid: /ultra:$out"; else bad "$(basename "$f"): $out"; fi
done

# Skills and workflows share one /ultra:<name> namespace — a duplicate name
# means one of them is unreachable.
dupes=$(python3 - <<'PY'
import glob, os, re
names = {}
for p in glob.glob("skills/*/SKILL.md"):
    t = open(p, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    n = None
    if m:
        g = re.search(r"^name:\s*(\S+)", m.group(1), re.M)
        n = g.group(1) if g else None
    names.setdefault(n or os.path.basename(os.path.dirname(p)), []).append(p)
for p in glob.glob("workflows/*.js"):
    t = open(p, encoding="utf-8").read()
    g = re.search(r"name:\s*'([a-z0-9-]+)'", t)
    if g: names.setdefault(g.group(1), []).append(p)
for n, ps in sorted(names.items()):
    if len(ps) > 1:
        print(f"{n}: {', '.join(ps)}")
PY
)
if [ -z "$dupes" ]; then
  ok "no name collisions across skills and workflows"
else
  bad "name collision in the /ultra: namespace"; printf '%s\n' "$dupes" | sed 's/^/    /'
fi

head_ "bin utilities"
for b in bin/*; do
  python3 -c "import ast,sys; ast.parse(open('$b').read())" 2>/dev/null \
    && ok "parses: $b" || bad "syntax error: $b"
  [ -x "$b" ] && ok "executable: $b" || bad "not executable: $b"
done

TD=$(mktemp -d); trap 'rm -rf "$TD"' EXIT
mkdir -p "$TD/src" "$TD/.github/workflows"
cat > "$TD/src/app.py" <<'EOF'
def verifyToken(t):
    return t
HANDLERS = {"verifyToken": verifyToken}
EOF
cat > "$TD/config.json" <<'EOF'
{"auth": "verifyToken"}
EOF
cat > "$TD/package.json" <<'EOF'
{"name":"t","scripts":{"test":"jest","build":"tsc"}}
EOF
cat > "$TD/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - run: npm ci
      - run: npm test
EOF

if out=$(python3 bin/ultra-map "$TD" 2>&1) && printf '%s' "$out" | grep -q "npm test"; then
  ok "ultra-map finds the real test command from CI"
else
  bad "ultra-map did not surface CI commands"; printf '%s\n' "$out" | sed 's/^/    /' | head -20
fi
printf '%s' "$out" | grep -q 'CI      ' \
  && ok "ultra-map labels CI commands as verified" \
  || bad "ultra-map lost command provenance labelling"
python3 bin/ultra-map "$TD" --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d["commands"] and "flags" in d else 1)' \
  && ok "ultra-map --json is well-formed" || bad "ultra-map --json broken"

# no-CI repo: commands must still be derived, and flagged as unproven
ND=$(mktemp -d)
printf 'test:\n\t@echo hi\nbuild:\n\t@echo b\n' > "$ND/Makefile"
if out=$(python3 bin/ultra-map "$ND" 2>&1) && printf '%s' "$out" | grep -q "make test"; then
  ok "ultra-map derives commands from Makefile when there is no CI"
else
  bad "ultra-map found no commands without CI"; printf '%s\n' "$out" | sed 's/^/    /' | head -12
fi
printf '%s' "$out" | grep -q "no CI config" \
  && ok "ultra-map flags the absence of CI" || bad "ultra-map did not flag missing CI"
rm -rf "$ND"

# ultra-graph: cycle, orphan, and hub detection on a known shape
GD=$(mktemp -d); mkdir -p "$GD/pkg"
printf 'from pkg.b import x\n' > "$GD/pkg/a.py"
printf 'from pkg.a import y\n' > "$GD/pkg/b.py"
printf 'z = 1\n' > "$GD/pkg/lonely.py"
gout=$(python3 bin/ultra-graph "$GD" 2>&1)
printf '%s' "$gout" | grep -q 'pkg/a.py -> pkg/b.py -> pkg/a.py\|pkg/b.py -> pkg/a.py -> pkg/b.py' \
  && ok "ultra-graph detects an import cycle" || { bad "ultra-graph missed the cycle"; printf '%s\n' "$gout" | sed 's/^/    /' | head -20; }
printf '%s' "$gout" | grep -q 'lonely.py' \
  && ok "ultra-graph reports orphans" || bad "ultra-graph missed the orphan"
python3 bin/ultra-graph "$GD" --file pkg/b.py 2>/dev/null | grep -q 'pkg/a.py' \
  && ok "ultra-graph --file resolves importers" || bad "ultra-graph --file broken"
python3 bin/ultra-graph "$GD" --json 2>/dev/null | python3 -c 'import json,sys; json.load(sys.stdin)' \
  && ok "ultra-graph --json is well-formed" || bad "ultra-graph --json broken"
rm -rf "$GD"

if out=$(python3 bin/ultra-radius verifyToken "$TD" 2>&1); then
  printf '%s' "$out" | grep -q "config.json" \
    && ok "ultra-radius finds the string reference in config.json" \
    || { bad "ultra-radius missed the config.json string reference"; printf '%s\n' "$out" | sed 's/^/    /' | head -30; }
else
  bad "ultra-radius failed to run"
fi

printf 'x,y\n1,2\n' > "$TD/d.csv"
if python3 bin/ultra-doc "$TD/d.csv" 2>/dev/null | grep -q "1"; then
  ok "ultra-doc reads csv"
else
  bad "ultra-doc failed on csv"
fi
if python3 bin/ultra-doc --inventory "$TD" 2>/dev/null | grep -q "files:"; then
  ok "ultra-doc --inventory works"
else
  bad "ultra-doc --inventory failed"
fi

head_ "scripts"
for s in install.sh scripts/selftest.sh scripts/enable-lsp.sh scripts/smoke.sh; do
  bash -n "$s" 2>/dev/null && ok "parses: $s" || bad "syntax error: $s"
  [ -x "$s" ] && ok "executable: $s" || bad "not executable: $s"
done
./scripts/enable-lsp.sh --dry-run >/dev/null 2>&1 \
  && ok "enable-lsp.sh --dry-run runs" || bad "enable-lsp.sh --dry-run failed"
if bash install.sh "$TD" --mode copy --dry-run >/dev/null 2>&1; then
  ok "install.sh --dry-run succeeds"
else
  bad "install.sh --dry-run failed"; bash install.sh "$TD" --mode copy --dry-run 2>&1 | sed 's/^/    /' | head
fi

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
