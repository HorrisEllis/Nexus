'use strict';
/**
 * cortex/self-heal/failure-report.js — FMR3: a .failure_mode read as a report, each section from where it lives.
 * comp_id: cortex.self-heal.failure-report
 * Map: docs/2026-10-17-failure-mode-report-phasemap.spec (FMR3_the_report)
 *
 * James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env. nexus nerve, spotlight and
 * interaction field for debugging." · "do it."
 *
 * A projection, never a second store (§7.6, like lib/change-record.js): nothing here is saved. Every section says where it
 * came from, and a section with nothing behind it is a HOLE, named, never filled (§1.2):
 *   what_failed   the evidence the failure arrived with (a COS run's debug report, a flight, a phase fault, a gate)
 *   chain         forensics' root and conditions (failure-mode-forensics.js); none → a hole saying why (no causedBy to walk)
 *   compound      ripple · wave · tidal, or why it was unavailable
 *   sigma         the system-wide sigma before and at the failure (observed correlation, never asserted as the cause)
 *   field         the CFR field stamped when it arrived (truth)
 *   recurrence    occurrences, first and last seen; and fixes recorded for a matching signature (cortex/memory/fix-map.js)
 *   hypotheses    CK-185 differential diagnosis: each candidate cause with the one experiment that separates it — only
 *                 for failure modes that have known candidates; otherwise a hole, never invented
 *   on_screen     Nerve's windows when it arrived — VIEW, labelled so: by Nerve's own invariant it never picks a cause
 *   environment   Nexus version, node, platform
 *   macro         the .debug_macro, or why there is none yet (FMR4 makes it)
 *
 *   report(failureMode, { fixes }) → { uuid, faultClass, where, sections: [{ id, title, from, value, hole }] }
 *   lines(report)                  → what a person reads
 */
const MODULE_ID = 'cortex.self-heal.failure-report';
const VERSION = '1.0.0';

// CK-185 — candidate causes for failure modes Nexus already names (lib/phase-faults.js modes), each with the experiment that
// separates it from the others. A mode not listed gets no hypotheses: said, not guessed.
const HYPOTHESES = {
  timeout: [
    { cause: 'the agent takes longer than the caller waits', experiment: 'replay with the agent answering slower and faster than the caller\'s limit (tests/sim/fake-tab.js MODE=slow SLOW_MS above and below it): only this cause flips with the limit' },
    { cause: 'the provider never received the prompt', experiment: 'read the job\'s acks (accepted, submitted): no "submitted" separates this from a slow agent' },
    { cause: 'the reply came but was not read', experiment: 'read the chat transcript (guardian/lib/chat-transcripts.js) for that chat: a reply there with no completion separates this' },
  ],
  'wrote-nothing': [
    { cause: 'the brief did not name the file to write', experiment: 'check the prompt for the target path: absent separates this' },
    { cause: 'the agent answered in prose, not a code block', experiment: 'read the reply for a fenced block with a path: none separates this' },
  ],
  'missed-files': [
    { cause: 'the phase names files the agent was not shown', experiment: 'compare the phase\'s files with the files in the prompt\'s context' },
    { cause: 'the reply was cut off', experiment: 'check the reply for truncation (mid-block end, done reason length)' },
  ],
  'provider-down': [
    { cause: 'the provider\'s tab is not connected', experiment: 'guardian\'s NCP connections at that time: none for the provider separates this' },
    { cause: 'the provider is up but signed out', experiment: 'the tab\'s URL is a sign-in page' },
  ],
  'test-failed': [
    { cause: 'the change broke the behaviour the test holds', experiment: 'run the test at the commit before the change: it passes there and fails after' },
    { cause: 'the test depends on something outside the change (time, network, order)', experiment: 'run it three times at the same commit: a flake changes result without a change' },
  ],
};

function _section(id, title, from, value, hole = null) { return { id, title, from, value: value == null ? null : value, hole: value == null ? (hole || 'nothing recorded') : null }; }

function _fixesFor(fm, fixes) {
  if (typeof fixes === 'function') { try { return fixes(`${fm.faultClass} ${fm.where || ''} ${fm.summary || ''}`) || []; } catch (_) { return []; } }
  try { return require('../memory/fix-map.js').lookupFix(`${fm.faultClass} ${fm.where || ''} ${fm.summary || ''}`, 3); } catch (_) { return []; }
}

async function report(fm, { fixes = null } = {}) {
  if (!fm) return null;
  const conditions = Array.isArray(fm.conditions) ? fm.conditions : [];
  const chain = fm.root || conditions.length ? { root: fm.root || null, conditions } : null;
  const chainHole = fm.enrichedAt
    ? (fm.anchor ? 'the anchor names a ledger row, but nothing on it names its cause (causedBy): see `system causality`' : 'no chain: this failure arrived with no anchor (ledger row) to walk from, and nothing upstream names its cause')
    : 'not traced yet (forensics runs just after the failure is written)';
  const compound = fm.compound && fm.compound.status === 'analyzed' ? { class: fm.compound.class, peakSigma: fm.compound.peakSigma, rootUuid: fm.compound.rootUuid } : null;
  const sigma = fm.sigmaBefore != null || fm.sigmaAtEntry != null ? { before: fm.sigmaBefore, atEntry: fm.sigmaAtEntry, delta: fm.sigmaDelta, note: 'system-wide, in the window around the failure: a correlation, never the cause' } : null;
  const mode = fm.faultClass && HYPOTHESES[fm.faultClass] ? fm.faultClass : (fm.evidence && fm.evidence.mode && HYPOTHESES[fm.evidence.mode] ? fm.evidence.mode : null);
  const found = _fixesFor(fm, fixes);
  const sections = [
    _section('what_failed', 'What failed', fm.via === 'intake' ? `posted by ${fm.source || '?'} to cortex POST /api/failure-modes` : 'the self-heal ladder (cortex/self-heal/index.js level 4)',
      fm.summary || fm.evidence ? { summary: fm.summary || null, evidence: fm.evidence || null } : null, 'the failure arrived with no evidence'),
    _section('chain', 'The conditions that led to it', 'cortex/self-heal/failure-mode-forensics.js (diagnostic-causal → relational-field)', chain, chainHole),
    _section('compound', 'Ripple, wave or tidal', 'orchestrator GET /cfr/compound (intelligence/causal/compound.js)', compound,
      fm.compound && fm.compound.reason ? `unavailable: ${fm.compound.reason}` : 'not analysed'),
    _section('sigma', 'Sigma around it', 'sigma_records (orchestrator/lib/sigma-writer.js)', sigma, 'no sigma records in the window'),
    _section('field', 'The CFR field when it arrived', 'cortex\'s field, stamped at intake', fm.cfrAtEntry || null, fm.via === 'intake' ? 'not stamped' : 'the ladder does not stamp the field'),
    _section('recurrence', 'How often, and fixes on record', 'failure_modes occurrences · cortex/memory/fix-map.js',
      { occurrences: fm.occurrences || 1, firstSeenAt: fm.firstSeenAt || fm.enteredAt || null, lastSeenAt: fm.lastSeenAt || fm.enteredAt || null,
        investigation: (fm.occurrences || 1) >= 2, fixes: found }),
    _section('hypotheses', 'Candidate causes, and the experiment that separates them (CK-185)', 'cortex/self-heal/failure-report.js HYPOTHESES',
      mode ? HYPOTHESES[mode] : null, `no candidates are on record for '${fm.faultClass}': the chain above is the lead`),
    _section('on_screen', 'On screen when it happened — view, not evidence', 'Nexus Nerve (lib/nerve) windows, stamped at intake', fm.viewAtEntry || null,
      'no view stamped (the ladder does not stamp one, or Nerve was not running)'),
    _section('environment', 'Environment', 'stamped at intake', fm.env || null, 'not stamped'),
    _section('macro', 'The macro that reproduces it', '.debug_macro (failure-mode-forensics.js generateDebugMacro)', fm.debugMacroUuid ? { uuid: fm.debugMacroUuid } : null,
      chain ? 'not composed yet' : 'none: there is no chain to compose one from (FMR4 composes it from the snapshot, the clip, the agents and the UI steps)'),
  ];
  return { uuid: fm.uuid, faultClass: fm.faultClass, where: fm.where || fm.source || null, system: fm.system || null, status: fm.status || 'open',
    occurrences: fm.occurrences || 1, sections, holes: sections.filter(s => s.hole).map(s => s.id), madeBy: MODULE_ID, version: VERSION };
}

const _when = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : '?');
function lines(r) {
  if (!r) return ['no such failure mode'];
  const out = [`${r.faultClass} · ${r.where || '?'}${r.system ? ` (${r.system})` : ''} · ${r.status} · seen ${r.occurrences}×`];
  for (const s of r.sections) {
    if (s.hole) { out.push(`${s.title}: — ${s.hole}`); continue; }
    const v = s.value;
    if (s.id === 'what_failed') out.push(`${s.title}: ${v.summary || ''}`);
    else if (s.id === 'chain') out.push(`${s.title}: ${v.root ? `root ${typeof v.root === 'string' ? v.root : JSON.stringify(v.root).slice(0, 120)} · ` : ''}${v.conditions.length} condition(s)`);
    else if (s.id === 'compound') out.push(`${s.title}: ${v.class}`);
    else if (s.id === 'sigma') out.push(`${s.title}: before ${v.before ?? '?'} · at ${v.atEntry ?? '?'} (correlation)`);
    else if (s.id === 'field') out.push(`${s.title}: ${v.regime || '?'} · friction ${v.friction ?? '?'} · coherence ${v.coherence ?? '?'}`);
    else if (s.id === 'recurrence') out.push(`${s.title}: ${v.occurrences}× (first ${_when(v.firstSeenAt)}, last ${_when(v.lastSeenAt)})${v.investigation ? ' — recurring: an investigation (§17.7)' : ''}${v.fixes.length ? ` · ${v.fixes.length} fix(es) on record` : ''}`);
    else if (s.id === 'hypotheses') { out.push(`${s.title}:`); for (const h of v) out.push(`  - ${h.cause} — ${h.experiment}`); }
    else if (s.id === 'on_screen') out.push(`${s.title}: ${(v.windows || []).length} window(s)${(v.windows || []).filter(w => !w.idle).length ? `, ${(v.windows || []).filter(w => !w.idle).length} active` : ''}`);
    else if (s.id === 'environment') out.push(`${s.title}: Nexus ${v.nexus || '?'} · node ${v.node || '?'} · ${v.platform || '?'}`);
    else if (s.id === 'macro') out.push(`${s.title}: ${v.uuid}`);
  }
  return out;
}

module.exports = { MODULE_ID, VERSION, HYPOTHESES, report, lines };
