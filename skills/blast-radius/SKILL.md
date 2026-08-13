---
name: blast-radius
description: Sweep the full impact set of a symbol or behavior before changing it — callers, implementations, re-exports, string references, dynamic access, serialized data, external surface. Use before renames, signature changes, deletions, or semantic changes to shared code.
argument-hint: [symbol or behavior]
---

Establish the complete reference set for: $ARGUMENTS — before any edit.

## Sweep, in order

Run `ultra-radius <symbol>` if on PATH for the raw sweep, then classify. Without it, sweep manually — all seven classes; static call search alone misses three of them:

1. **Direct references**: `rg -w '<symbol>'` across source, excluding generated/vendored dirs (state the exclusions).
2. **Definitions**: overloads, overrides, subclass and interface implementations, monkey-patches.
3. **Re-exports**: barrel files, `__init__.py`, `mod.rs` — the public-surface multipliers.
4. **String references**: `rg '"<symbol>"|'"'"'<symbol>'"'"''` across *all* file types — configs, DI registrations, route tables, fixtures, migrations, feature flags.
5. **Dynamic access**: grep the codebase for `getattr|importlib|globals\(\)|require\([^'"]|reflect\.|Class\.forName` near the symbol's module. If the codebase uses these idioms, static confidence is capped — say so.
6. **Serialized data**: if the symbol names a field on a persisted or wire type (DB column, JSON API field, message schema, cache key), stored data holds the old name. This class survives every refactor; check migrations and schema files.
7. **External surface**: exported package API, generated clients, docs. A hit here upgrades the change from refactor to breaking change.

For hundreds of hits: group by directory, sample each group, extrapolate explicitly ("sampled 3 of 41 in `services/`").

## Output

A reference table grouped by class with counts, `path:line` entries (sampled groups marked), uncertain matches listed separately, and a verdict: what a safe change requires, in edit order, plus the references most likely to be missed. If the radius is large or the codebase is dynamic-heavy, recommend delegating the edit to `ultra:surgeon` with this table as its work list.
