#!/usr/bin/env python3
"""Ultra orient: SessionStart hook.

Prints a few lines of orientation into Claude's context at session start:
repo scale, stack, git state, the highest-tier build/test command available,
and whichever traps matter here.

This runs in every session where the plugin is enabled, so its cost must
stay trivial. It samples rather than walking exhaustively, and bails out
of anything slow. Better to print four useful lines in 200ms than a
perfect map in six seconds.
"""
import json
import os
import subprocess
import sys

SKIP_DIRS = {
    ".git", "node_modules", ".venv", "venv", "env", "__pycache__", "dist",
    "build", "target", "vendor", ".next", ".cache", ".tox", "coverage",
    ".gradle", ".pytest_cache", "bower_components",
}
FILE_CAP = 20_000
LANG = {".py": "Python", ".rs": "Rust", ".go": "Go", ".ts": "TypeScript",
        ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
        ".java": "Java", ".rb": "Ruby", ".php": "PHP", ".c": "C", ".cc": "C++",
        ".cpp": "C++", ".cs": "C#", ".kt": "Kotlin", ".swift": "Swift",
        ".ex": "Elixir", ".scala": "Scala"}
MANIFEST_HINT = [
    ("package.json", "node"), ("pyproject.toml", "python"), ("go.mod", "go"),
    ("Cargo.toml", "rust"), ("pom.xml", "maven"), ("build.gradle", "gradle"),
    ("Gemfile", "ruby"), ("mix.exs", "elixir"), ("composer.json", "php"),
    ("Makefile", "make"), ("CMakeLists.txt", "cmake"),
]
CI_HINT = [".github/workflows", ".gitlab-ci.yml", ".circleci/config.yml",
           "Jenkinsfile", "azure-pipelines.yml", ".travis.yml"]


def scan(root):
    n = 0
    exts = {}
    capped = False
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames
                       if d not in SKIP_DIRS and not d.startswith(".")]
        for f in filenames:
            n += 1
            e = os.path.splitext(f)[1].lower()
            if e in LANG:
                exts[e] = exts.get(e, 0) + 1
        if n >= FILE_CAP:
            capped = True
            break
    return n, exts, capped


def git(args, cwd):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                           text=True, timeout=4)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def main():
    cwd = os.getcwd()
    out = []

    try:
        n, exts, capped = scan(cwd)
    except Exception:
        sys.exit(0)

    scale = f"{n}+" if capped else str(n)
    langs = {}
    for e, c in exts.items():
        langs[LANG[e]] = langs.get(LANG[e], 0) + c
    top = sorted(langs.items(), key=lambda kv: -kv[1])[:3]
    lang_str = ", ".join(k for k, _ in top) or "no source detected"

    branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
    if branch:
        dirty = len((git(["status", "--porcelain"], cwd) or "").splitlines())
        state = f"{branch}, {dirty} dirty" if dirty else f"{branch}, clean"
    else:
        state = "no git"
    out.append(f"[ultra] {scale} files | {lang_str} | {state}")

    present = [name for name, _ in MANIFEST_HINT
               if os.path.exists(os.path.join(cwd, name))]
    has_ci = any(os.path.exists(os.path.join(cwd, p)) for p in CI_HINT)

    if present:
        tier = "CI present — its commands are ground truth" if has_ci else \
               "no CI — commands are declared or inferred, never proven"
        out.append(f"[ultra] manifests: {', '.join(present[:4])} | {tier}")

    traps = []
    if not branch:
        traps.append("no git: no history, blame, or rollback")
    if len(langs) >= 4:
        traps.append(f"{len(langs)} languages: one command will not cover the tree")
    if capped or n > 3000:
        traps.append("large repo: grep before read, delegate wide searches")
    if traps:
        out.append("[ultra] traps: " + "; ".join(traps))

    if not os.path.exists(os.path.join(cwd, "CLAUDE.md")):
        out.append("[ultra] no CLAUDE.md — /ultra:onboard writes one once the repo is mapped")

    out.append("[ultra] orient with `ultra-map`, structure with `ultra-graph`, "
               "radius with `ultra-radius <symbol>`. /ultra runs the full arc; "
               "/ultra:constitution is the doctrine. Verify before claiming.")

    print("\n".join(out))
    sys.exit(0)


if __name__ == "__main__":
    main()
