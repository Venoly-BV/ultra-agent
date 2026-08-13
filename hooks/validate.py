#!/usr/bin/env python3
"""Ultra validate: PostToolUse hook for Edit/Write/NotebookEdit.

Parses the file that was just written and, if it is now broken, reports the
error straight back into Claude's context. Catching a syntax error on the
edit that caused it costs one turn; discovering it three edits later costs
the reasoning behind all three.

Only checks that are fast and unambiguous run here. A slow or noisy check in
a PostToolUse hook taxes every edit in the session, so compilers, test
suites, and type checkers deliberately stay out.
"""
import json
import os
import shutil
import subprocess
import sys

TIMEOUT = 6
MAX_BYTES = 2_000_000


def emit(context):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": context,
        }
    }))
    sys.exit(0)


def run(cmd, **kw):
    try:
        return subprocess.run(cmd, capture_output=True, text=True,
                              timeout=TIMEOUT, **kw)
    except Exception:
        return None


def check_python(path, src):
    import ast
    try:
        ast.parse(src, filename=path)
    except SyntaxError as e:
        return f"{e.msg} at line {e.lineno}, column {e.offset}"
    return None


def check_json(path, src):
    try:
        json.loads(src)
    except Exception as e:
        return str(e)
    return None


def check_toml(path, src):
    try:
        import tomllib
    except ImportError:
        return None
    try:
        tomllib.loads(src)
    except Exception as e:
        return str(e)
    return None


def check_yaml(path, src):
    try:
        import yaml  # type: ignore
    except ImportError:
        return None
    try:
        list(yaml.safe_load_all(src))
    except Exception as e:
        return str(e).replace("\n", " ")[:400]
    return None


def check_node(path, src):
    if not shutil.which("node"):
        return None
    r = run(["node", "--check", path])
    if r is None or r.returncode == 0:
        return None
    return (r.stderr or "").strip().splitlines()[0][:400] if r.stderr else "parse error"


def check_shell(path, src):
    shell = "bash" if shutil.which("bash") else ("sh" if shutil.which("sh") else None)
    if not shell:
        return None
    r = run([shell, "-n", path])
    if r is None or r.returncode == 0:
        return None
    return (r.stderr or "").strip().splitlines()[0][:400] if r.stderr else "parse error"


def check_go(path, src):
    if not shutil.which("gofmt"):
        return None
    r = run(["gofmt", "-e", path])
    if r is None or r.returncode == 0:
        return None
    return (r.stderr or "").strip().splitlines()[0][:400] if r.stderr else "parse error"


def check_notebook(path, src):
    err = check_json(path, src)
    if err:
        return err
    try:
        nb = json.loads(src)
        for i, cell in enumerate(nb.get("cells", [])):
            if cell.get("cell_type") == "code":
                import ast
                try:
                    ast.parse("".join(cell.get("source", [])))
                except SyntaxError as e:
                    return f"cell {i}: {e.msg} at line {e.lineno}"
    except Exception:
        return None
    return None


CHECKS = {
    ".py": check_python, ".pyi": check_python,
    ".json": check_json,
    ".toml": check_toml,
    ".yaml": check_yaml, ".yml": check_yaml,
    ".js": check_node, ".mjs": check_node, ".cjs": check_node,
    ".sh": check_shell, ".bash": check_shell,
    ".go": check_go,
    ".ipynb": check_notebook,
}


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    if payload.get("tool_name") not in ("Edit", "Write", "NotebookEdit"):
        sys.exit(0)

    path = (payload.get("tool_input") or {}).get("file_path")
    if not path or not os.path.isfile(path):
        sys.exit(0)

    ext = os.path.splitext(path)[1].lower()
    check = CHECKS.get(ext)
    if not check:
        sys.exit(0)

    try:
        if os.path.getsize(path) > MAX_BYTES:
            sys.exit(0)
        with open(path, encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        sys.exit(0)

    # A JSON/TOML/YAML file that is legitimately empty is not an error.
    if not src.strip():
        sys.exit(0)

    try:
        err = check(path, src)
    except Exception:
        sys.exit(0)  # a broken checker must never obstruct the session

    if err:
        emit(f"[ultra] SYNTAX ERROR introduced in {os.path.basename(path)}: {err}\n"
             f"The file no longer parses. Fix it now, before making further edits — "
             f"a broken file makes every later error message misleading.")
    sys.exit(0)


if __name__ == "__main__":
    main()
