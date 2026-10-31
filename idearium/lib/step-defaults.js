/**
 * idearium/lib/step-defaults.js — what a skip fills, step by step (AC7).
 * Spec: idearium/spec/agent-control.spec MOD-AC-SKIP · Map: docs/2026-10-31-agent-control-phasemap.spec AC7_skip_buttons
 *
 * James, 2026-10-31: "also its too back and fourth lke we are. I also want skip buttons which will autofill generic/default values in each
 * step of the pipeline." A skip never writes over what he typed, and every value it fills says it is a default (AC-002).
 *
 *   defaultsFor(step, ctx) → { step, values, source, marked: true } | { step, none: why }
 *   steps: 'workshop.sections' (each empty section gets a one-line default for its kind) · 'workshop.plan' (the no-agent plan: one phase
 *   per section, the pipeline's own "PLAN FROM THE SPEC NOW") · 'void.sliders' (normal · stable)
 */
export const MODULE_ID = 'nexus-idearium-step-defaults-v1-0000-2026-1031-jamesbrooks-001';
export const DEFAULT_MARK = '(default)';

// a generic first line for the sections specs usually have; anything else gets the plain fallback
const GENERIC = Object.freeze({
  purpose: 'what this is for, in one sentence, and who it serves.',
  goal: 'the end state: what is true when this is done.',
  scope: 'what is in, and what is out.',
  constraints: 'the rules it must keep (the axioms that apply).',
  interfaces: 'what it stands on and what reaches it: routes, commands, events.',
  schemas: 'the data it keeps, each with its fields.',
  modules: 'one module per file, each with its exports.',
  acceptance: 'how a stranger checks it works: a test or a command and what it shows.',
  tests: 'one test per acceptance line.',
  risks: 'what could break, and what catches it.',
  build_order: 'foundation first: config, then the server, then components, then the UI.',
});
const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function sectionDefault(title) {
  const key = slug(title), hit = GENERIC[key] || GENERIC[Object.keys(GENERIC).find(k => key.includes(k))];
  return `${DEFAULT_MARK} ${title}: ${hit || 'what this section holds, in a line — keep it or write over it.'}`;
}

export function defaultsFor(step, ctx = {}) {
  if (step === 'workshop.sections') {
    const sections = (ctx.session && ctx.session.sections) || [];
    const fill = sections.filter(s => !String(s.body || '').trim()).map(s => ({ id: s.id, body: sectionDefault(s.title), default: true }));
    if (!fill.length) return { step, none: 'every section already has his words — nothing to fill' };
    return { step, values: { sections: fill }, source: 'a generic line per section kind (step-defaults GENERIC); his text is never touched', marked: true };
  }
  if (step === 'workshop.plan') return { step, values: { plan: 'derive' }, source: "the pipeline's own no-agent plan: one phase per section", marked: true };
  if (step === 'void.sliders') return { step, values: { creativity: 0, stability: 0 }, source: 'normal · stable, the sliders\' first stops', marked: true };
  return { step, none: `no defaults for "${step}"` };
}

export default { MODULE_ID, DEFAULT_MARK, sectionDefault, defaultsFor };
