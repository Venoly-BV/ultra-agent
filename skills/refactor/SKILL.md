---
name: refactor
description: Execute a multi-file change safely — enumerate sites, handle exceptions first, edit faithfully, close the loop with a residue check. Use for renames, API migrations, pattern replacements, or any change spanning more than a handful of files.
argument-hint: [change description]
---

Execute safely across the tree: $ARGUMENTS

Precondition: the blast radius is known. If it is not, run `/ultra:blast-radius` first — this skill executes a known radius; it does not discover one.

## Procedure

1. **Enumerate.** Materialize the work list (every site, `path:line`) from the radius sweep. This list is the contract: every entry ends as edited or skipped-with-reason.
2. **Sort into mechanical vs. exceptional.** Exceptional sites — odd call shapes, generated-adjacent code, sites inside docs or fixtures — go *first*. They surface spec problems while stopping is still cheap. If an exceptional site forces an interpretation the user might dispute, ask now.
3. **Checkpoint.** On a git tree: ensure status is clean or stash-noted, so the sweep is revertible as a unit. Consider a branch for radii above ~20 files.
4. **Edit.** Mechanical sites in bulk — `ultra:surgeon` for large uniform sweeps, inline for small ones. Match each file's local style. No drive-by fixes. Keep the change-set closed: everything needed to compile lands before verification.
5. **Residue check.** Re-run the enumeration search. Every remaining hit is either an intentional skip (reason recorded) or a miss (fix now). Zero unexplained residue is the exit criterion.
6. **Verify.** Cheapest whole-tree check (typecheck/compile/lint), then targeted tests, per `/ultra:verify`. Spot-read 2–3 edited files end to end — bulk edits fail in locally-plausible ways (edits inside docstring examples, doubled imports, comments now describing old behavior).

## Report

Sites changed (count + list), sites skipped (each with reason), interpretations made, verification commands with verbatim results, residue accounting.
