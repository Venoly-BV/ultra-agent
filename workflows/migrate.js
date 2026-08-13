export const meta = {
  name: 'migrate',
  description: 'Run a mechanical migration across many files: discover the sites, transform them in disjoint batches, then residue-check and verify the tree back to green',
  whenToUse: 'A well-specified change that must be applied to dozens or hundreds of files — an API migration, a library swap, a pattern replacement — where one agent would run out of context long before it ran out of files',
  phases: [
    { title: 'Discover', detail: 'enumerate sites and separate the exceptional ones' },
    { title: 'Pilot', detail: 'transform a few sites first to prove the spec' },
    { title: 'Transform', detail: 'disjoint batches in parallel' },
    { title: 'Verify', detail: 'residue check, typecheck, tests' },
  ],
}

const USE_SPECIALISTS = true
const AS = t => (USE_SPECIALISTS ? { agentType: t } : {})

const change = typeof args === 'string' ? args : (args && args.change)
const root = (args && args.path) || '.'
const BATCH = (args && args.batchSize) || 6
const MAX_BATCHES = (args && args.maxBatches) || 10

if (!change) {
  return {
    error: 'migrate needs a change description. Example: /ultra:migrate replace every call to legacyFetch(url, opts) with httpClient.request({url, ...opts})',
  }
}

const SITES_SCHEMA = {
  type: 'object',
  required: ['sites', 'searchesRun', 'sharedFiles'],
  properties: {
    sites: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'occurrences', 'exceptional'],
        properties: {
          file: { type: 'string' },
          occurrences: { type: 'number' },
          exceptional: { type: 'boolean', description: 'true if this site does not fit the mechanical pattern' },
          why: { type: 'string', description: 'for exceptional sites, what makes it different' },
        },
      },
    },
    sharedFiles: {
      type: 'array', items: { type: 'string' },
      description: 'files many other sites import from (barrels, shared types) — these must be edited once, alone, not concurrently',
    },
    searchesRun: { type: 'array', items: { type: 'string' } },
    specQuestions: {
      type: 'array', items: { type: 'string' },
      description: 'ambiguities in the change spec that produce materially different code depending on the reading',
    },
    verifyCommand: { type: 'string', description: 'the cheapest whole-tree correctness check, learned from CI config' },
    residueSearch: { type: 'string', description: 'the search that should return zero hits when the migration is complete' },
  },
}

const EDIT_SCHEMA = {
  type: 'object',
  required: ['edited', 'skipped'],
  properties: {
    edited: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'occurrences'],
        properties: {
          file: { type: 'string' },
          occurrences: { type: 'number' },
          note: { type: 'string' },
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'reason'],
        properties: { file: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    interpretations: {
      type: 'array', items: { type: 'string' },
      description: 'places you had to choose a reading, and which you chose',
    },
  },
}

// ------------------------------------------------------------- phase 1 --
phase('Discover')
log(`Migration: ${change}`)

const found = await agent(
  `Enumerate every site that needs this change. Do not edit anything.

CHANGE: ${change}
ROOT:   ${root}

1. Search broadly, then narrow. Use several patterns — the call form, the import, the identifier alone — because one pattern reliably misses a variant. Exclude generated and vendored directories and say which.
2. For each file, count occurrences.
3. Mark a site **exceptional** when it does not fit the mechanical pattern: an unusual call shape, use inside a template or docstring example, a partially-migrated file, a test asserting on the old form, a re-export. These reveal spec problems and must be handled before the bulk.
4. Identify **shared files** that many other sites import from — barrels, shared type definitions, base classes. Concurrent edits to these conflict, so they are listed separately and edited alone.
5. Read the CI config to learn the real typecheck/build/test commands. Return the cheapest whole-tree correctness check as verifyCommand, and the search that must return zero hits when this is done as residueSearch.
6. If the change spec is ambiguous anywhere — two readings that produce materially different code — return them in specQuestions rather than resolving them yourself. A wrong guess replicated across forty files is far worse than asking.

Return the complete work list. It becomes the contract: every entry must end up edited or explicitly skipped.`,
  { label: 'discover', phase: 'Discover', schema: SITES_SCHEMA, ...AS('ultra:cartographer') },
)

if (!found || !found.sites || !found.sites.length) {
  log('No sites found.')
  return { change, sites: 0, note: 'Discovery found no matching sites. Check the change description, or the code may already be migrated.', searchesRun: found ? found.searchesRun : [] }
}

if (found.specQuestions && found.specQuestions.length) {
  log(`SPEC AMBIGUITY — stopping before any edit. ${found.specQuestions.length} question(s) need answering.`)
  return {
    change,
    stopped: 'spec ambiguity',
    questions: found.specQuestions,
    sites: found.sites,
    note: 'Discovery found readings of the spec that produce materially different code. Answer these and re-run — resolving them by guess would replicate the wrong choice across every site.',
  }
}

const shared = new Set(found.sharedFiles || [])
const exceptional = found.sites.filter(s => s.exceptional && !shared.has(s.file))
const sharedSites = found.sites.filter(s => shared.has(s.file))
const mechanical = found.sites.filter(s => !s.exceptional && !shared.has(s.file))

log(`${found.sites.length} sites: ${mechanical.length} mechanical, ${exceptional.length} exceptional, ${sharedSites.length} shared`)

const editRules = `
Rules for every edit:
- Match each file's local style, even where files differ from one another. A migration that also reformats hides the real change from every reviewer of the diff. Do not reformat.
- Change only what the migration requires. No drive-by fixes, no improved comments, no unrelated cleanup. Note anything you notice and move on.
- Read enough of each file to avoid the characteristic bulk-edit failures: editing inside a docstring or example block, creating a duplicate import, leaving a comment that now describes the old behavior, or matching the pattern inside a string that is not a call.
- If a site turns out not to need the change, skip it and record why. Skipping with a reason is correct; silently leaving it is not.`

// ------------------------------------------------------------- phase 2 --
// The exceptional sites and shared files go first, serialized. They are where
// the spec breaks, and finding that out costs least before the bulk lands.
phase('Pilot')

const pilotResults = []

if (sharedSites.length) {
  log(`Editing ${sharedSites.length} shared file(s) alone — concurrent edits here would conflict`)
  const r = await agent(
    `Apply this migration to the shared files below. They are edited alone because many other files import from them.

CHANGE: ${change}

FILES:
${sharedSites.map(s => `  ${s.file}  (${s.occurrences} occurrence(s))`).join('\n')}
${editRules}

These files define the surface everything else uses, so getting them right determines whether the rest of the migration compiles. If changing one would break importers in a way the migration spec does not address, stop and report it instead of editing.`,
    { label: 'pilot:shared', phase: 'Pilot', schema: EDIT_SCHEMA, ...AS('ultra:surgeon') },
  )
  if (r) pilotResults.push(r)
}

if (exceptional.length) {
  log(`Editing ${exceptional.length} exceptional site(s) before the bulk`)
  const r = await agent(
    `Apply this migration to the sites below. Each was flagged as NOT fitting the mechanical pattern.

CHANGE: ${change}

SITES:
${exceptional.map(s => `  ${s.file}  (${s.occurrences} occurrence(s)) — ${s.why || 'flagged exceptional'}`).join('\n')}
${editRules}

These are the sites most likely to reveal that the migration spec is incomplete. If one of them cannot be migrated as specified, do not improvise a variant — skip it, record exactly what the spec fails to cover, and let the bulk proceed without it.`,
    { label: 'pilot:exceptional', phase: 'Pilot', schema: EDIT_SCHEMA, ...AS('ultra:surgeon') },
  )
  if (r) pilotResults.push(r)
}

// ------------------------------------------------------------- phase 3 --
phase('Transform')

const batches = []
for (let i = 0; i < mechanical.length; i += BATCH) {
  batches.push(mechanical.slice(i, i + BATCH))
}
let cappedFiles = 0
if (batches.length > MAX_BATCHES) {
  cappedFiles = batches.slice(MAX_BATCHES).reduce((n, b) => n + b.length, 0)
  log(`CAP: ${MAX_BATCHES} of ${batches.length} batches this run — ${cappedFiles} file(s) left unmigrated. Re-run to continue, or raise maxBatches.`)
  batches.length = MAX_BATCHES
}

// Batches touch disjoint file sets, so they run concurrently without worktree
// isolation — isolation would cost a repo copy per agent and then require
// merging the results back, which is strictly worse for non-overlapping edits.
log(`Transforming ${batches.reduce((n, b) => n + b.length, 0)} file(s) in ${batches.length} batch(es)`)

const batchResults = (await parallel(batches.map((batch, i) => () =>
  agent(
    `Apply this migration to the files below, and only these files.

CHANGE: ${change}

FILES (batch ${i + 1} of ${batches.length}):
${batch.map(s => `  ${s.file}  (${s.occurrences} expected occurrence(s))`).join('\n')}
${editRules}

Other agents are migrating other files concurrently. Touch nothing outside your list — not shared modules, not imports in neighbouring files, not the barrel that re-exports them. If your files need a change elsewhere to work, report it rather than making it.

When done, re-read one of your edited files end to end and confirm the result is correct in context, not just locally plausible.`,
    { label: `batch ${i + 1}/${batches.length}`, phase: 'Transform', schema: EDIT_SCHEMA, ...AS('ultra:surgeon') },
  ),
))).filter(Boolean)

const results = [...pilotResults, ...batchResults]
const edited = results.flatMap(r => r.edited || [])
const skipped = results.flatMap(r => r.skipped || [])
const interpretations = results.flatMap(r => r.interpretations || [])

log(`${edited.length} file(s) edited, ${skipped.length} skipped`)

// ------------------------------------------------------------- phase 4 --
phase('Verify')

const verification = await agent(
  `Verify this migration and drive the tree back to green.

CHANGE: ${change}

EDITED (${edited.length}): ${edited.map(e => e.file).join(', ') || 'none'}
SKIPPED (${skipped.length}): ${skipped.map(s => `${s.file} (${s.reason})`).join(', ') || 'none'}
${cappedFiles ? `NOT ATTEMPTED THIS RUN: ${cappedFiles} file(s), capped by maxBatches.` : ''}
${interpretations.length ? `\nINTERPRETATIONS MADE:\n${interpretations.map(s => `  - ${s}`).join('\n')}` : ''}

Do this in order:

1. **Residue check.** Run: ${found.residueSearch || 'the search that identifies un-migrated sites'}
   Every remaining hit is either an intentional skip listed above, or a miss. Fix the misses now. Report the final hit list with a reason for each survivor. Zero unexplained residue is the exit criterion.

2. **Correctness check.** Run: ${found.verifyCommand || 'the cheapest whole-tree typecheck, build, or lint'}
   If it fails, read the FIRST error rather than the loudest, fix the cause, and re-run. Cascading errors bury the real one.

3. **Tests.** Run the tests covering the migrated area — narrowest first, then widen. Never weaken, skip, or delete a test to make the suite pass. If a test fails because it asserts on the old form and the migration legitimately changes that form, say so explicitly and show the assertion rather than quietly rewriting it.

4. **Spot-read.** Read two or three edited files end to end. Bulk edits fail in ways that look correct locally — a doubled import, an edit inside an example block, a comment now describing the old behavior.

Report: the exact commands you ran and their verbatim results, split into VERIFIED and NOT VERIFIED. If you could not get the tree green, say precisely where it stands and what remains — a partially-migrated tree honestly reported is recoverable; one reported as done is not.`,
  { label: 'verify', phase: 'Verify', ...AS('ultra:mechanic') },
)

return {
  change,
  verification,
  stats: {
    discovered: found.sites.length,
    edited: edited.length,
    skipped: skipped.length,
    notAttempted: cappedFiles,
    batches: batches.length,
  },
  editedFiles: edited,
  skippedFiles: skipped,
  interpretations,
  residueSearch: found.residueSearch,
  verifyCommand: found.verifyCommand,
}
