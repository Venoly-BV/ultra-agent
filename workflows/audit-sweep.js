export const meta = {
  name: 'audit-sweep',
  description: 'Fan out a project audit across risk dimensions, adversarially verify every finding, and return one ranked report with honest coverage accounting',
  whenToUse: 'Auditing a repo or subsystem for security, correctness, completeness, and debt when a single-pass review would miss things or bury the real findings',
  phases: [
    { title: 'Recon', detail: 'map scale, stack, real commands, risk surface' },
    { title: 'Audit', detail: 'one agent per dimension, scoped to what recon found' },
    { title: 'Verify', detail: 'adversarial refutation of each finding' },
    { title: 'Synthesize', detail: 'dedupe, rank, coverage block' },
  ],
}

// Route stages to the Ultra specialists. Their scoped names resolve when the
// plugin is installed in plugin mode. Set to false to run every stage on the
// default workflow subagent instead — the prompts below stay self-sufficient
// either way, so this only changes which system prompt is layered underneath.
const USE_SPECIALISTS = true
const AS = t => (USE_SPECIALISTS ? { agentType: t } : {})

// ---------------------------------------------------------------- scope --
const scope = typeof args === 'string' ? args
  : (args && args.scope) || 'the whole repository'
const only = (args && args.dimensions) || null
const MAX_DIMENSIONS = (args && args.maxDimensions) || 8

const MAP_SCHEMA = {
  type: 'object',
  required: ['scale', 'stack', 'commands', 'riskSurface'],
  properties: {
    scale: { type: 'string', description: 'file count, monorepo or not, workspace layout' },
    stack: { type: 'string', description: 'languages, frameworks, database, auth mechanism' },
    commands: {
      type: 'object',
      description: 'real commands and where each was learned from',
      properties: {
        build: { type: 'string' }, test: { type: 'string' },
        lint: { type: 'string' }, typecheck: { type: 'string' },
        source: { type: 'string' },
      },
    },
    riskSurface: {
      type: 'array',
      description: 'the areas where a defect would cost the most, highest first',
      items: {
        type: 'object',
        required: ['area', 'path', 'why'],
        properties: {
          area: { type: 'string' }, path: { type: 'string' }, why: { type: 'string' },
        },
      },
    },
    absent: {
      type: 'array', items: { type: 'string' },
      description: 'dimensions with no presence in this repo at all (e.g. no frontend, no database)',
    },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['dimension', 'coverage', 'findings'],
  properties: {
    dimension: { type: 'string' },
    coverage: {
      type: 'object',
      required: ['audited', 'notAudited'],
      properties: {
        audited: { type: 'string', description: 'what you actually inspected' },
        sampled: { type: 'string', description: 'what you spot-checked, and the sample size' },
        notAudited: { type: 'string', description: 'what you skipped and why' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'location', 'impact', 'rootCause', 'evidence', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] },
          title: { type: 'string' },
          location: { type: 'string', description: 'path:line' },
          impact: { type: 'string', description: 'who is affected and how' },
          rootCause: { type: 'string' },
          evidence: { type: 'string', description: 'what you observed, verbatim' },
          fix: { type: 'string' },
          riskOfFix: { type: 'string' },
          verification: { type: 'string', description: 'how to confirm the fix works' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reasoning'],
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'UNPROVEN'] },
    reasoning: { type: 'string' },
    correctedSeverity: {
      type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
      description: 'set only if the original severity was miscalibrated',
    },
    failureScenario: { type: 'string', description: 'concrete input or state, then the wrong outcome' },
  },
}

// ------------------------------------------------------------- dimensions --
// Constitution §45. `probe` tells the auditor what "should exist" for that
// dimension, because the highest-yield findings are absences that produce no
// grep hit.
const ALL_DIMENSIONS = [
  { key: 'security', agent: 'ultra:sentinel',
    probe: 'Trace taint from every input boundary (route handlers, message consumers, uploads, CLI args) to every sink. Then enumerate the sensitive operations and verify each has its authz guard — the absence list is the finding. Cover injection, broken authz and IDOR, authn and session handling, path traversal, secrets in code/config/logs/history, unsafe deserialization, crypto misuse, and SSRF.' },
  { key: 'authorization', agent: 'ultra:sentinel',
    probe: 'For every protected operation ask the three questions: who are you, what may you do, may you do it to THIS resource. Hunt IDOR: client-supplied IDs used without an ownership check. Check that authz exists on the API and is not only enforced in the UI.' },
  { key: 'database', agent: 'ultra:dba',
    probe: 'Schema consistency, indexes on filter/join/sort columns, constraints, foreign keys, nullability, cascade behavior. N+1 patterns and unbounded result sets. Transaction boundaries, lock scope, read-modify-write races. Migration safety: forward compatibility during rolling deploy, lock profile on realistic table sizes, rollback availability.' },
  { key: 'api', agent: 'ultra:auditor',
    probe: 'Per endpoint: request/response schema, authn, authz, input validation, error semantics and status codes, idempotency, pagination bounds, rate limiting, versioning and backwards compatibility. Client-side validation is never a security boundary.' },
  { key: 'routing', agent: 'ultra:auditor',
    probe: 'Walk the §61 chain: navigation → route → page → component → state → API → backend → database → response → UI state. Find dead routes, orphaned pages, unreachable components, missing navigation, route collisions, missing 404 handling, broken deep links, and missing loading/empty/error/permission-denied states.' },
  { key: 'error-handling', agent: 'ultra:auditor',
    probe: 'Silent failures, swallowed exceptions, generic errors where actionable ones are possible, sensitive stack traces reaching production, misleading success responses, resources never cleaned up, uncontrolled retry loops, and retries on non-idempotent operations.' },
  { key: 'testing', agent: 'ultra:auditor',
    probe: 'Is testing proportional to risk? Find untested security-sensitive boundaries and untested critical workflows. Identify tests that would pass against broken code — assertion-free tests, over-mocked tests, tests asserting on the mock. Coverage numbers are not the metric.' },
  { key: 'infrastructure', agent: 'ultra:operator',
    probe: 'Environment variables declared vs. read vs. set. Secret sourcing, build-time vs. run-time secrets. Health/readiness/liveness distinctions, resource limits, graceful shutdown. CI/CD correctness. Rollback path and deploy/migration ordering. Structured logs, error rates, audit events — and whether anything sensitive is being logged.' },
  { key: 'performance', agent: 'ultra:optimizer',
    probe: 'Only report what you can evidence: N+1 queries, missing indexes, work inside loops, unbounded result sets, synchronous I/O on hot paths, over-fetch-then-filter, oversized critical-path dependencies. Do not report speculative micro-optimizations — §26 forbids optimizing without measurement.' },
  { key: 'dependencies', agent: 'ultra:auditor',
    probe: 'Unmaintained or known-vulnerable packages, duplicated functionality across dependencies, dependencies pulled in for something the stdlib or an existing dep already does, license implications, and lockfile/manifest drift.' },
  { key: 'architecture', agent: 'ultra:auditor',
    probe: 'Circular dependencies, hidden global state, duplicated business logic, massive utility files, leaked boundaries, framework hacks without justification. Report structural problems that cost real maintenance, not stylistic preference — §25 forbids refactoring architecture you merely dislike.' },
  { key: 'documentation', agent: 'ultra:auditor',
    probe: 'Documentation that the code now contradicts — stale commands, renamed paths, removed flags, wrong env vars. A confidently wrong doc is worse than a missing one. Also flag missing setup/deploy/runbook material where its absence blocks work.' },
]

// -------------------------------------------------------------- phase 1 --
phase('Recon')
log(`Auditing: ${scope}`)

const map = await agent(
  `Map this repository to plan an audit of: ${scope}

Establish, cheaply and without reading whole files:
- Scale: file count, monorepo or single package, workspace layout.
- Stack: languages, frameworks, database, auth mechanism, deployment target.
- The REAL build/test/lint/typecheck commands. Read the CI config — those commands have to work, so they are ground truth. Manifest scripts are a fallback and must be marked unverified. Record where you learned each.
- Risk surface: rank the areas where a defect would cost the most (auth, payment, data handling, admin, external input), each with a path and why.
- Absent dimensions: name anything from this list with no presence in this repo at all, so the audit does not waste agents on it: ${ALL_DIMENSIONS.map(d => d.key).join(', ')}.

Do not audit anything yet. Return the map.`,
  { label: 'recon', phase: 'Recon', schema: MAP_SCHEMA, ...AS('ultra:cartographer') },
)

if (!map) {
  log('Recon failed — cannot plan an audit without it. Stopping.')
  return { error: 'recon failed', scope }
}

// Drop dimensions recon says do not exist here, honor an explicit list, and cap.
const absent = new Set((map.absent || []).map(s => String(s).toLowerCase()))
let dimensions = ALL_DIMENSIONS.filter(d => !absent.has(d.key))
if (only && only.length) {
  const want = new Set(only.map(s => String(s).toLowerCase()))
  dimensions = dimensions.filter(d => want.has(d.key))
}
const dropped = dimensions.length - MAX_DIMENSIONS
if (dropped > 0) {
  log(`CAP: auditing ${MAX_DIMENSIONS} of ${dimensions.length} dimensions. Dropped: ${dimensions.slice(MAX_DIMENSIONS).map(d => d.key).join(', ')}`)
  dimensions = dimensions.slice(0, MAX_DIMENSIONS)
}
if (absent.size) log(`Skipped as absent from this repo: ${[...absent].join(', ')}`)
log(`Dimensions: ${dimensions.map(d => d.key).join(', ')}`)

const context = `Repository context, established by recon:
- Scale: ${map.scale}
- Stack: ${map.stack}
- Commands: ${JSON.stringify(map.commands)}
- Highest-risk areas: ${(map.riskSurface || []).map(r => `${r.area} (${r.path}) — ${r.why}`).join('; ')}`

// ---------------------------------------------------- phases 2 and 3 --
// Pipelined, not barriered: a dimension's findings go to verification the
// moment that dimension finishes, while slower dimensions are still auditing.
const audited = await pipeline(
  dimensions,

  dim => agent(
    `Audit this repository for the **${dim.key}** dimension. Scope: ${scope}

${context}

What to look for:
${dim.probe}

Method:
- Budget by risk. Spend your effort on the high-risk areas above; sample low-risk surface and say you sampled.
- Trace paths, not files. Defects and gaps live on the path from input to storage, not inside single files.
- Hunt negative space: enumerate what SHOULD exist for this dimension, then verify each. Missing guards produce no grep hit, and they are the highest-yield findings.
- Every finding needs a concrete location (path:line) and observed evidence. A suspicion is not a finding.

Calibration (this matters more than volume):
- Severity reflects real exploitability and impact. Inflated severity teaches the reader to ignore the report.
- Twenty real findings beat two hundred lint-grade observations that bury them. Do not pad.
- Report coverage honestly: what you audited, what you sampled, what you skipped. Never imply completeness you did not achieve.
- If this dimension is genuinely clean, return zero findings and say what you checked. That is a valid and useful result.`,
    { label: `audit:${dim.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA, ...AS(dim.agent) },
  ),

  (result, dim) => {
    if (!result || !result.findings || !result.findings.length) return { dim, result, verified: [] }
    return parallel(result.findings.map(f => () =>
      agent(
        `Adversarially verify this audit finding. Your default is REFUTED — make the finding earn CONFIRMED.

FINDING (${dim.key})
Severity:   ${f.severity}
Title:      ${f.title}
Location:   ${f.location}
Impact:     ${f.impact}
Root cause: ${f.rootCause}
Evidence:   ${f.evidence}

Attack it:
1. Re-read the cited code yourself. Does it actually say what the finding claims? Auditors misread code under time pressure.
2. Is the path reachable? An "unauthenticated endpoint" behind a gateway that authenticates, or dead code no route reaches, is not a finding.
3. Is there a guard the auditor missed — middleware, a decorator, a framework default, a check one frame up the call stack?
4. Is the severity calibrated to who can actually trigger it and what they actually gain? Correct it if not.
5. If it holds, produce the concrete failure scenario: specific input or state, then the wrong outcome.

Verdicts:
- CONFIRMED — you tried the attacks above and the finding survived. Say which attacks you ran.
- REFUTED — it does not hold. Say exactly why, with evidence.
- UNPROVEN — you could not check it with available means. Say what is missing and what check would settle it.

Do not soften a verdict to be agreeable and do not invent a defect to seem rigorous. Both corrupt the signal.`,
        { label: `verify:${dim.key}:${String(f.title).slice(0, 40)}`, phase: 'Verify', schema: VERDICT_SCHEMA, ...AS('ultra:adversary') },
      ).then(v => ({ ...f, dimension: dim.key, verdict: v })),
    )).then(verified => ({ dim, result, verified: verified.filter(Boolean) }))
  },
)

// ------------------------------------------------------------- phase 4 --
phase('Synthesize')

const rows = audited.filter(Boolean)
const all = rows.flatMap(r => r.verified)
const confirmed = all.filter(f => f.verdict && f.verdict.verdict === 'CONFIRMED')
const unproven = all.filter(f => f.verdict && f.verdict.verdict === 'UNPROVEN')
const refuted = all.filter(f => f.verdict && f.verdict.verdict === 'REFUTED')
const failedDims = dimensions.filter(d => !rows.some(r => r.dim.key === d.key && r.result))

log(`${confirmed.length} confirmed, ${unproven.length} unproven, ${refuted.length} refuted across ${rows.length} dimensions`)

const coverage = rows.map(r => ({
  dimension: r.dim.key,
  audited: r.result && r.result.coverage ? r.result.coverage.audited : 'unknown',
  sampled: r.result && r.result.coverage ? r.result.coverage.sampled : '',
  notAudited: r.result && r.result.coverage ? r.result.coverage.notAudited : 'unknown',
}))

const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }
const effective = f => (f.verdict && f.verdict.correctedSeverity) || f.severity
confirmed.sort((a, b) => (severityRank[effective(a)] ?? 9) - (severityRank[effective(b)] ?? 9))

if (!confirmed.length && !unproven.length) {
  log('No findings survived verification.')
  return {
    scope,
    summary: 'No findings survived adversarial verification within the audited scope.',
    coverage,
    refutedCount: refuted.length,
    dimensionsFailed: failedDims.map(d => d.key),
    note: 'This states that nothing was identified within the reviewed scope — not that the project is free of defects.',
  }
}

const report = await agent(
  `Write the final audit report for: ${scope}

${context}

CONFIRMED FINDINGS (survived adversarial verification), highest severity first:
${JSON.stringify(confirmed, null, 1)}

UNPROVEN FINDINGS (could not be verified either way):
${JSON.stringify(unproven, null, 1)}

COVERAGE, per dimension, as reported by the auditors:
${JSON.stringify(coverage, null, 1)}
${failedDims.length ? `\nDIMENSIONS THAT FAILED TO COMPLETE (no coverage at all): ${failedDims.map(d => d.key).join(', ')}` : ''}
${refuted.length ? `\n${refuted.length} finding(s) were refuted during verification and are deliberately excluded.` : ''}

Produce, in this order:

1. **Executive summary** — the worst findings first, plus the one-line story of this project's health. An engineer who reads only this paragraph should know what to do Monday morning.

2. **Coverage** — mandatory, in this exact shape:
   AUDITED:     <dimensions genuinely inspected, and what was inspected>
   SAMPLED:     <dimensions spot-checked, with sample sizes>
   NOT AUDITED: <dimensions skipped or failed, and why>
   Never imply completeness that was not achieved. If dimensions failed or were capped, they belong in NOT AUDITED.

3. **Findings by severity**, each as:
   [SEVERITY] Title
   Location / Impact / Root cause / Evidence / Recommended fix / Risk of fix / Verification / Status

4. **Unproven** — separately, each with what is missing to settle it. Do not promote these to findings.

5. **Technical debt register** — classify as critical/high/medium/low/cosmetic.

6. **Remediation order** — what to fix first and roughly what each costs. Order by risk reduced per unit of effort, not by severity alone.

Rules: merge duplicates that describe the same defect from different dimensions, keeping the clearest statement. Never claim the project is secure or defect-free — the accurate phrasing is "no issues identified within the reviewed scope". Do not inflate severity. Do not pad.`,
  { label: 'synthesize', phase: 'Synthesize', ...AS('ultra:scribe') },
)

return {
  scope,
  report,
  stats: {
    dimensions: dimensions.length,
    confirmed: confirmed.length,
    unproven: unproven.length,
    refuted: refuted.length,
    dimensionsFailed: failedDims.map(d => d.key),
  },
  coverage,
}
