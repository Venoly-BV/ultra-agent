---
name: ultra
description: Run the full Venoly engineering arc on a task — discover, locate, scope, plan, execute, verify, report — with specialist delegation for anything wide. Use for substantial work in large repos, multi-file changes, or any task where being wrong is expensive.
argument-hint: [task description]
---

Apply the Venoly engineering arc to: $ARGUMENTS

Governed by the Venoly Engineering Constitution (`/ultra:constitution` — load it for anything architectural, security-sensitive, or irreversible). Core principle: **understand before changing, verify before claiming, test before trusting, document before forgetting.**

If no task was given, ask for one in a single line. Otherwise work the stages. Announce each in one line as you enter it; skip one only by stating why it is unnecessary here.

For large or high-stakes work, delegate the whole arc to `ultra:prime`, which carries the Constitution preloaded.

## 1. Orient (Constitution §9)

Establish repo scale, stack, and the real build/test commands before anything else. `ultra-map` if available; else manifest + CI config. On a repo already mapped this session or in memory, skip with a one-line recap of what you know.

## 2. Locate

Narrow to the files and lines where the task lives. Grep before read; read narrowly. If locating is wide (unfamiliar subsystem, many candidate sites), delegate to `ultra:cartographer` or `ultra:tracer` and act on their map.

## 3. Scope

Name the blast radius before editing: callers, implementations, string references, configs, serialized data, tests. For any shared symbol, run the blast-radius sweep (`ultra-radius <symbol>` or delegate to `ultra:tracer`). State the radius in one short list — this is the contract for what "complete" means.

## 4. Plan

State the smallest change set that fully does the job, as an ordered list of edits. If two readings of the task produce materially different plans, put the question to the user now, not after the edits. For big mechanical sweeps, the plan is what you hand `ultra:surgeon`.

## 5. Execute

Make the edits. Match surrounding style. No drive-by fixes — note them for the report. Keep the tree compiling between logical steps where possible.

## 6. Verify

Run the narrowest check that could fail, then widen one ring: single test → file → package. Broken build or red test means stop and fix, or report honestly — never proceed past a failure. For high-stakes changes, send the finished work to `ultra:adversary` before reporting; its verdict goes in the report.

## Report (§56)

Close in the Venoly final response format via `/ultra:report`: **Result, Changes** (tagged `[ADD]`/`[MODIFY]`/`[REMOVE]`/`[FIX]`…), **Verification** (VERIFIED vs. NOT VERIFIED, only what you actually ran), **Pros, Cons, Risks, Questions, Remaining Work**.

Report every deletion, every unrequested addition, and every scope expansion with its reason (§63–§65). For a small change, drop the sections that genuinely do not apply — ceremony for its own sake is forbidden by §60.
