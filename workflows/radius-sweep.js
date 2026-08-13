export const meta = {
  name: 'radius-sweep',
  description: 'Sweep every reference class for a symbol in parallel, cross-check for misses, and return an ordered edit plan — the multi-agent version of /ultra:blast-radius, for symbols too widely referenced to trace by hand',
  whenToUse: 'Before renaming, deleting, or changing the signature or semantics of a shared symbol, especially in a dynamic language or a repo too large to grep confidently by hand',
  phases: [
    { title: 'Sweep', detail: 'one agent per reference class, each blind to the others' },
    { title: 'Cross-check', detail: 'completeness critic hunts what the sweep missed' },
    { title: 'Plan', detail: 'ordered edit plan with the misses most likely to bite' },
  ],
}

const USE_SPECIALISTS = true
const AS = t => (USE_SPECIALISTS ? { agentType: t } : {})

const symbol = typeof args === 'string' ? args : (args && args.symbol)
const path = (args && args.path) || '.'
const intent = (args && args.intent) || 'rename or change this symbol'

if (!symbol) {
  return { error: 'radius-sweep needs a symbol. Run it as: /ultra:radius-sweep verifyToken' }
}

const REFS_SCHEMA = {
  type: 'object',
  required: ['class', 'references', 'confidence'],
  properties: {
    class: { type: 'string' },
    references: {
      type: 'array',
      items: {
        type: 'object',
        required: ['location', 'context', 'kind'],
        properties: {
          location: { type: 'string', description: 'path:line' },
          context: { type: 'string', description: 'the line itself, trimmed' },
          kind: { type: 'string', description: 'call, definition, import, re-export, string, config, test, schema, doc' },
          certain: { type: 'boolean', description: 'false if this may be an unrelated same-named symbol' },
          note: { type: 'string' },
        },
      },
    },
    confidence: {
      type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'],
      description: 'LOW when the codebase uses idioms that hide references from static search',
    },
    confidenceReason: { type: 'string' },
    searchesRun: { type: 'array', items: { type: 'string' }, description: 'the exact searches you ran' },
  },
}

// Each class is searched by an agent that does not see the others' results.
// Blindness is the point: a single searcher anchors on its first successful
// pattern and stops varying its technique.
const CLASSES = [
  { key: 'static',
    prompt: `Word-boundary and direct references. Run \`ultra-radius ${symbol} ${path}\` first if it is on PATH — it sweeps several classes at once and prints its own exclusions. Otherwise use \`rg -w '${symbol}'\`. Then widen: composite identifiers containing the symbol (getUserToken, user_token_id), and imports of it. Exclude generated and vendored directories, and say which you excluded.` },

  { key: 'definitions',
    prompt: `Definitions and redefinitions: the declaration itself, overloads, overrides, subclass and interface implementations, protocol conformances, monkey-patches, and any duplicate definition elsewhere in the tree. Two independent definitions of the same name is itself a finding — report it loudly, because a rename that changes one and not the other compiles and then misbehaves.` },

  { key: 'reexports',
    prompt: `Re-exports and public surface: barrel files (index.ts, __init__.py, mod.rs), \`export * from\`, explicit re-export lists, package manifest "exports"/"main" fields, and generated API clients or type definitions. Anything here means changing the symbol is a breaking change for consumers, not an internal refactor. Say explicitly whether this symbol is part of the package's public API.` },

  { key: 'strings',
    prompt: `String references across EVERY file type, not just source: \`rg '"${symbol}"|'"'"'${symbol}'"'"''\` plus bare occurrences in JSON, YAML, TOML, .env, SQL, HTML, and templates. Look specifically in DI container registrations, route tables, feature flags, permission and role definitions, test fixtures, mocks, snapshot files, seed data, and CI config. This class is invisible to every type checker, so a miss here compiles cleanly and fails at runtime.` },

  { key: 'dynamic',
    prompt: `Dynamic access. First determine whether this codebase uses dynamic dispatch at all. Search for these idioms: getattr and setattr; the importlib module and dunder-import; indexing into globals; the eval and Function constructors; a module loaded from a variable rather than a literal; Class.forName; the Go and Java reflect packages; Ruby's method_missing, const_get and symbol-send; and dictionary-based handler dispatch tables. Then judge whether '${symbol}' could be reached that way — for example a handler registered in a dict keyed by name, or a class resolved from a config string. Report the idioms present with evidence, and state plainly whether static search can be trusted for this symbol in this codebase. Set confidence LOW if dynamic dispatch is used anywhere near this symbol's module.` },

  { key: 'persisted',
    prompt: `Persisted and wire references. If '${symbol}' names a field on anything that crosses a process boundary or outlives the process, stored data holds the old name and no code change reaches it. Check: database schemas and migrations, ORM model field names, API request/response shapes, GraphQL schemas, protobuf/Avro/JSON Schema definitions, message queue payloads, cache keys, cookie and localStorage keys, log field names, analytics event names, and env var names. If the symbol is purely internal, say so explicitly — that is a valuable negative result.` },

  { key: 'tests-docs',
    prompt: `Tests and documentation. Every test referencing '${symbol}' is both blast radius and the harness that will verify the change — list them, and say which ones would actually fail if the symbol changed (as opposed to passing regardless, which tells you coverage is illusory). Then find documentation references: README, docs/, docstrings, code comments, ADRs, changelogs, and inline examples. A doc that keeps the old name after the rename is a defect that outlives the refactor.` },
]

// ------------------------------------------------------------- phase 1 --
phase('Sweep')
log(`Blast radius for '${symbol}' under ${path} — ${CLASSES.length} reference classes in parallel`)

const sweeps = (await parallel(CLASSES.map(c => () =>
  agent(
    `Find every reference of class **${c.key}** to the symbol \`${symbol}\` under \`${path}\`.

${c.prompt}

Ground rules:
- The cost of your mistakes is asymmetric: a false positive wastes a minute of review, a false negative ships a production failure. When unsure whether a match is a real reference, INCLUDE it with certain=false and a note.
- Every reference needs a real path:line you actually observed. Never infer a location.
- If there are hundreds of hits, group by directory and sample within each group — then say in confidenceReason that you sampled and how much.
- Report the exact searches you ran, so the cross-check can spot what your technique could not reach.
- Finding nothing is a real result. Return an empty list with HIGH confidence and say what you searched.

Do not propose or make any edit. This is reconnaissance.`,
    { label: `sweep:${c.key}`, phase: 'Sweep', schema: REFS_SCHEMA, ...AS('ultra:tracer') },
  ),
))).filter(Boolean)

const refs = sweeps.flatMap(s => (s.references || []).map(r => ({ ...r, class: s.class })))
const seen = new Set()
const unique = refs.filter(r => {
  const k = `${r.location}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
const lowConfidence = sweeps.filter(s => s.confidence === 'LOW')
const uncertain = unique.filter(r => r.certain === false)

log(`${unique.length} distinct references across ${sweeps.length} classes (${uncertain.length} uncertain)`)
if (lowConfidence.length) {
  log(`LOW confidence from: ${lowConfidence.map(s => s.class).join(', ')} — static search is a floor here, not a ceiling`)
}

// ------------------------------------------------------------- phase 2 --
// A barrier is correct here: the critic must see every class's result and
// every searcher's technique at once to reason about what fell between them.
phase('Cross-check')

const critique = await agent(
  `Seven independent searches swept the codebase for references to \`${symbol}\`. Find what they missed.

WHAT EACH SEARCHER RAN AND FOUND:
${sweeps.map(s => `
[${s.class}] confidence ${s.confidence}${s.confidenceReason ? ` — ${s.confidenceReason}` : ''}
  searches: ${(s.searchesRun || []).join(' | ') || 'not reported'}
  found: ${(s.references || []).length} reference(s)
${(s.references || []).slice(0, 25).map(r => `    ${r.location}  [${r.kind}]  ${r.context}`).join('\n')}${(s.references || []).length > 25 ? `\n    ... +${s.references.length - 25} more` : ''}`).join('\n')}

Your job is the gap between these searches, not a repeat of them:

1. **Technique gaps.** Given the exact searches above, what kind of reference could exist that none of these patterns would match? Case variants, the symbol split across a string concatenation, a name built at runtime from a prefix, an alias created at an import site, a wrapper that forwards to it.
2. **Aliases.** Was this symbol imported under a different local name anywhere (\`import { ${symbol} as x }\`, \`from m import ${symbol} as x\`)? If so, every use of that alias is a reference the searchers never looked for. Search for the aliases you find.
3. **Contradictions.** Do any two searchers disagree — one says public API, another says internal? Resolve it by looking yourself.
4. **The unasked class.** Is there a reference class relevant to THIS codebase that was not in the seven? Infrastructure-as-code, a Makefile target, a shell script, a CI job, a cron definition, a k8s manifest, a client SDK in another repo referenced by name.
5. **Verify a sample.** Pick three of the reported references and confirm they actually exist as described. If any is wrong, say so — it means the set needs re-checking, not just extending.

Return what the sweep missed, with path:line evidence for anything new. If the sweep looks genuinely complete, say so and state which specific risk you were unable to rule out.`,
  { label: 'cross-check', phase: 'Cross-check', ...AS('ultra:adversary') },
)

// ------------------------------------------------------------- phase 3 --
phase('Plan')

const byClass = {}
for (const r of unique) (byClass[r.class] = byClass[r.class] || []).push(r)

const plan = await agent(
  `Produce the edit plan for: ${intent} — symbol \`${symbol}\`.

REFERENCE SET (${unique.length} distinct locations):
${Object.entries(byClass).map(([cls, rs]) => `
== ${cls} (${rs.length}) ==
${rs.slice(0, 60).map(r => `  ${r.location}  [${r.kind}]${r.certain === false ? '  (UNCERTAIN)' : ''}  ${r.context}`).join('\n')}${rs.length > 60 ? `\n  ... +${rs.length - 60} more` : ''}`).join('\n')}

SEARCH CONFIDENCE:
${sweeps.map(s => `  ${s.class}: ${s.confidence}${s.confidenceReason ? ` — ${s.confidenceReason}` : ''}`).join('\n')}

CROSS-CHECK FOUND:
${critique || '(cross-check produced no output)'}

Produce:

1. **Verdict** — is this change a safe refactor, a breaking change to a public surface, or a data migration? These need different processes, and misclassifying is how a "rename" takes down consumers.

2. **Edit order** — the sequence that keeps the tree working at each step. Definitions and re-exports usually move together; string references and persisted data usually need a compatibility window rather than a simultaneous cut. State where the tree is temporarily inconsistent and why that is unavoidable.

3. **Compatibility requirement** — if anything in the set is public API, persisted data, or a wire format, say what deprecation or expand-migrate-contract sequence is required. Do not describe a simultaneous cutover for data that already exists in production.

4. **The three references most likely to be missed** — from this specific set, with why each is easy to miss and how to confirm it was handled.

5. **Verification** — the exact command that proves the change is complete, plus the residue search that must return zero (or only explained hits).

6. **Confidence** — HIGH, MEDIUM, or LOW for the completeness of this reference set, justified by the search confidences and the cross-check. If any class reported LOW, this cannot be HIGH. State plainly what could still be missing.

Do not make any edit. This is the plan the editor will follow.`,
  { label: 'plan', phase: 'Plan', ...AS('ultra:prime') },
)

return {
  symbol,
  path,
  plan,
  crossCheck: critique,
  references: unique,
  stats: {
    total: unique.length,
    uncertain: uncertain.length,
    byClass: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
    lowConfidenceClasses: lowConfidence.map(s => s.class),
  },
}
