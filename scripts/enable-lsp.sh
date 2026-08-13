#!/usr/bin/env bash
# Generate .lsp.json containing only the language servers actually installed
# on this machine, giving Claude real go-to-definition and find-references
# instead of text search.
#
#   ./scripts/enable-lsp.sh [--dry-run] [--remove]
#
# Why generated rather than shipped: a server declared but not installed
# fails at startup, and the failure is visible only in `claude --debug`. A
# config listing binaries that exist is a config that works.
#
# Note: when another enabled plugin already claims a file extension, the
# first server registered wins and this one never starts. Anthropic ships
# LSP plugins on the official marketplace — search "lsp" in /plugin Discover
# — and those are the better choice if they cover your languages.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$SRC/.lsp.json"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

ok()   { printf '\033[32m ✓\033[0m %s\n' "$*"; }
skip() { printf '   %s\n' "$*"; }
info() { printf '\033[36m::\033[0m %s\n' "$*"; }

if [ "${1:-}" = "--remove" ]; then
  [ -f "$OUT" ] && { rm -f "$OUT"; ok "removed $OUT"; } || skip "no .lsp.json to remove"
  exit 0
fi

# name | binary | args (JSON array) | extensions (JSON object)
CANDIDATES=(
  'pyright|pyright-langserver|["--stdio"]|{".py":"python",".pyi":"python"}'
  'pylsp|pylsp|[]|{".py":"python",".pyi":"python"}'
  'typescript|typescript-language-server|["--stdio"]|{".ts":"typescript",".tsx":"typescriptreact",".js":"javascript",".jsx":"javascriptreact",".mjs":"javascript",".cjs":"javascript"}'
  'rust|rust-analyzer|[]|{".rs":"rust"}'
  'go|gopls|["serve"]|{".go":"go"}'
  'clangd|clangd|[]|{".c":"c",".h":"c",".cc":"cpp",".cpp":"cpp",".hpp":"cpp",".cxx":"cpp"}'
  'java|jdtls|[]|{".java":"java"}'
  'ruby|solargraph|["stdio"]|{".rb":"ruby"}'
  'lua|lua-language-server|[]|{".lua":"lua"}'
  'bash|bash-language-server|["start"]|{".sh":"shellscript",".bash":"shellscript"}'
  'zig|zls|[]|{".zig":"zig"}'
  'elixir|elixir-ls|[]|{".ex":"elixir",".exs":"elixir"}'
)

info "scanning PATH for language servers"
FOUND=()
CLAIMED=""   # first server to claim an extension keeps it
for row in "${CANDIDATES[@]}"; do
  IFS='|' read -r name bin args exts <<< "$row"
  if ! command -v "$bin" >/dev/null 2>&1; then
    skip "$name — $bin not installed"
    continue
  fi
  # avoid declaring the same extension twice inside our own config
  conflict=0
  for e in $(printf '%s' "$exts" | grep -oE '"\.[a-z]+"' | tr -d '"'); do
    case ":$CLAIMED:" in *":$e:"*) conflict=1 ;; esac
  done
  if [ "$conflict" = 1 ]; then
    skip "$name — its extensions are already claimed by an earlier server"
    continue
  fi
  for e in $(printf '%s' "$exts" | grep -oE '"\.[a-z]+"' | tr -d '"'); do
    CLAIMED="$CLAIMED:$e"
  done
  FOUND+=("$name|$bin|$args|$exts")
  ok "$name — $(command -v "$bin")"
done

if [ ${#FOUND[@]} -eq 0 ]; then
  printf '\n\033[33m !\033[0m No language servers found on PATH. Nothing written.\n'
  cat <<'EOF'

  Install one or more, then re-run:
    npm i -g typescript-language-server typescript   # TS/JS
    npm i -g pyright                                 # Python
    rustup component add rust-analyzer               # Rust
    go install golang.org/x/tools/gopls@latest       # Go
    <your package manager> install clangd            # C/C++
EOF
  exit 0
fi

JSON="{"
first=1
for row in "${FOUND[@]}"; do
  IFS='|' read -r name bin args exts <<< "$row"
  [ $first = 1 ] || JSON="$JSON,"
  first=0
  JSON="$JSON
  \"$name\": {
    \"command\": \"$bin\",
    \"args\": $args,
    \"extensionToLanguage\": $exts,
    \"diagnostics\": true,
    \"restartOnCrash\": true,
    \"maxRestarts\": 3,
    \"startupTimeout\": 20000
  }"
done
JSON="$JSON
}"

if [ "$DRY" = 1 ]; then
  printf '\n--- would write %s ---\n%s\n' "$OUT" "$JSON"
  exit 0
fi

printf '%s\n' "$JSON" > "$OUT"
python3 -c "import json,sys; json.load(open('$OUT'))" 2>/dev/null \
  || { rm -f "$OUT"; printf '\033[31merror:\033[0m generated invalid JSON, not written\n'; exit 1; }

printf '\n'
ok "wrote $OUT with ${#FOUND[@]} server(s)"
cat <<EOF

  Claude now gets go-to-definition, find-references, and diagnostics for
  those languages in any repo where this plugin is enabled.

  Reinstall so the cached copy picks it up:
    ./install.sh /path/to/repo

  Undo with: ./scripts/enable-lsp.sh --remove
EOF
