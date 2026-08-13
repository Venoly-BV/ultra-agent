#!/usr/bin/env python3
"""Ultra guard: PreToolUse hook for Bash.

Blocks a short list of irreversibly destructive commands outright and
escalates risky-but-sometimes-legitimate ones to the user. Everything else
passes through untouched (exit 0, no decision).

Philosophy: a guard that cries wolf gets disabled. Deny only what is
near-certainly a mistake; escalate only what destroys uncommitted work or
rewrites shared history.
"""
import json
import re
import sys


def out(decision: str, reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


# Patterns that are near-certainly catastrophic. Deny.
DENY = [
    # rm -rf on root, home, or filesystem-wide globs
    (r"\brm\s+(-\w*[rR]\w*f\w*|-\w*f\w*[rR]\w*)\s+(--\S+\s+)*([\"']?)(/|/\*|~|~/|\$HOME)\3(\s|$)",
     "rm -rf targeting / or home"),
    # mkfs / dd onto a block device
    (r"\bmkfs(\.\w+)?\s", "mkfs formats a filesystem"),
    (r"\bdd\s+[^|;&]*\bof=/dev/(sd|nvme|vd|hd)", "dd writing to a block device"),
    # fork bomb
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "fork bomb"),
    # chmod -R 777 from root-ish paths
    (r"\bchmod\s+(-\w*R\w*\s+)?777\s+(--\S+\s+)*/(\s|$)", "chmod 777 on /"),
    # git push --force to a primary branch (allow --force-with-lease)
    (r"\bgit\s+push\s+(?!.*--force-with-lease)[^|;&]*(--force|-f)\b[^|;&]*\b(main|master)\b",
     "force push to main/master (use --force-with-lease and a feature branch)"),
    (r"\bgit\s+push\s+(?!.*--force-with-lease)[^|;&]*\b(origin|upstream)\s+\+?(main|master)\b[^|;&]*(--force|-f)\b",
     "force push to main/master (use --force-with-lease and a feature branch)"),
]

# Patterns that destroy local state that may not be recoverable. Escalate to the user.
ESCALATE = [
    (r"\bgit\s+reset\s+--hard\b", "git reset --hard discards uncommitted work"),
    (r"\bgit\s+clean\s+-\w*[dfx]", "git clean deletes untracked files"),
    (r"\bgit\s+checkout\s+(--\s+)?\.(\s|$)", "git checkout . discards uncommitted changes"),
    (r"\bgit\s+restore\s+(--\S+\s+)*\.(\s|$)", "git restore . discards uncommitted changes"),
    (r"\bgit\s+branch\s+-D\b", "force-deleting a branch loses unmerged commits"),
    (r"\bgit\s+stash\s+(drop|clear)\b", "dropping stashes is irreversible"),
    (r"\brm\s+(-\w*[rR]\w*f\w*|-\w*f\w*[rR]\w*)\s", "recursive force delete"),
    (r"\bfind\s+[^|;&]*-delete\b", "find -delete mass-removes files"),
    (r"\btruncate\s+-s\s*0\b", "truncate empties files in place"),
    (r"\bdocker\s+system\s+prune\b|\bdocker\s+volume\s+rm\b",
     "docker prune/volume rm destroys container state"),
    (r"\bkubectl\s+delete\s+(ns|namespace|deploy|deployment|statefulset|pvc|pv)\b",
     "kubectl delete on stateful resources"),
    (r"(?i)\bdrop\s+(table|database|schema)\b", "SQL DROP is irreversible"),
]


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # malformed input: stay out of the way

    if payload.get("tool_name") != "Bash":
        sys.exit(0)

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not command:
        sys.exit(0)

    for pattern, why in DENY:
        if re.search(pattern, command):
            out("deny", f"Ultra guard: blocked — {why}.")

    for pattern, why in ESCALATE:
        if re.search(pattern, command):
            out("escalate", f"Ultra guard: needs your confirmation — {why}.")

    sys.exit(0)  # no opinion: normal permission flow applies


if __name__ == "__main__":
    main()
