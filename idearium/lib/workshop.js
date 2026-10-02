/**
 * idearium/lib/workshop.js — the spec workshop: where a spec is made, by hand or with the agent (0.39.294 SW1).
 * component_id: idearium.workshop
 * UUID: nexus-idearium-workshop-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-workshop-codex-rewind-phasemap.spec (SW1) · docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (SW1)
 *
 * James, 2026-10-01: "Maybe we have a spec workshop, for building and editing, specs. using the spec builder. ai
 * assited or manual, The spacial void. adjustable, levels of ambitoiun higher is more outside the box. the user is the
 * idea generator, you can help improve creatitive with open loops, outside the box questions, what ifs, d20 cross
 * domain dice for ideation. A random invention to reverse causal chain like for example: a workbench that
 * automatically clears off, and sets up the placement for your tools. like shit like that, or inspiration from nexus,
 * like inspire myself using what ive built."
 * James, 2026-10-02: "need the spec workshop, completely destroy the spec builder, and build the spec workshop" ·
 * "the workshop and maybe it hooks into the spec field".
 *
 * A session is one spec being made: its sections (written by James, or accepted from the agent), the ambition dial
 * (1 grounded … 5 outside the box), and the agent's proposals. James stays the idea generator: the agent only
 * PROPOSES — a proposal is a separate record, and nothing reaches a section until he accepts it (decide()).
 * The hook into the Spec field: a session reads its sections from a repo's spec/<name>.spec and saves back there
 * (the API owns the repo write); specText() is that file.
 *
 * Pure except ask(): this file never touches the store — api/index.js owns loadTable/syncTable and hands rows in.
 */

export const TABLE = 'idearium_workshops';
export const MODULE_ID = 'nexus-idearium-workshop-v1-0000-2026-1002-jamesbrooks-001';

export const AMBITION = Object.freeze({
  1: { label: 'grounded', guide: 'Stay inside what this spec already says and what already exists. Propose only what could be built next, plainly.' },
  2: { label: 'practical', guide: 'Small, safe extensions of what is here. Each one buildable without new infrastructure.' },
  3: { label: 'stretch', guide: 'Push one step past the obvious. New capabilities are fine if the path to them is clear.' },
  4: { label: 'bold', guide: 'Rethink parts of it. Borrow from other fields. Say what would make this remarkable, not just complete.' },
  5: { label: 'outside the box', guide: 'Reach across domains and past what exists today. Unexpected is the point — but say each idea so a builder could start on it.' },
});

export const FEEDS = Object.freeze({
  'open-loops':    { label: 'Open loops', icon: '◌', ask: 'List what this spec leaves unanswered or undecided — the loops it opens and never closes. One per line, each phrased as the decision that is missing.' },
  'questions':     { label: 'Outside-the-box questions', icon: '?', ask: 'Ask the questions nobody has asked about this yet — the ones that could change what it is. One per line.' },
  'what-ifs':      { label: 'What ifs', icon: '⤳', ask: 'Give "what if …" variations that would change this spec in an interesting way. One per line, each ending with what it would change.' },
  'd20':           { label: 'd20 cross-domain roll', icon: '⬡', ask: null },   // built from the roll, see feedPrompt
  'reverse-chain': { label: 'Reverse causal chain', icon: '↶', ask: null },   // built from an invented end-state
  'inspiration':   { label: 'Inspiration from your work', icon: '✦', ask: null },   // built from James's own library + repos
  'section':       { label: 'Draft this section', icon: '✎', ask: null },
});
export const FEED_IDS = Object.freeze(Object.keys(FEEDS));
export const PROPOSAL_STATUS = Object.freeze(['open', 'accepted', 'dismissed']);

// the d20: twenty fields, each with one mechanism worth stealing (James: "d20 cross domain dice for ideation")
export const DOMAINS = Object.freeze([
  { domain: 'biology', mechanism: 'immune memory — meet a threat once, recognise it forever after' },
  { domain: 'music', mechanism: 'call and response — one part states, another answers and changes it' },
  { domain: 'logistics', mechanism: 'cross-docking — nothing is stored, everything is routed on arrival' },
  { domain: 'games', mechanism: 'fog of war — you only see what your units can see' },
  { domain: 'ecology', mechanism: 'succession — each stage prepares the ground for the next' },
  { domain: 'architecture', mechanism: 'load paths — every weight has a route to the ground' },
  { domain: 'cooking', mechanism: 'mise en place — everything prepared and placed before the first move' },
  { domain: 'aviation', mechanism: 'checklists — the same steps in the same order, every time, out loud' },
  { domain: 'finance', mechanism: 'double-entry — every change is recorded twice, so the books always balance' },
  { domain: 'linguistics', mechanism: 'morphology — small parts combine by rules into meaning' },
  { domain: 'medicine', mechanism: 'triage — the most urgent first, decided fast, by a fixed rule' },
  { domain: 'theatre', mechanism: 'blocking — where each actor stands is decided before the lines' },
  { domain: 'sport', mechanism: 'set plays — rehearsed patterns triggered by a signal' },
  { domain: 'geology', mechanism: 'strata — the past is kept in layers you can read in order' },
  { domain: 'law', mechanism: 'precedent — a decision made once binds the next like it' },
  { domain: 'manufacturing', mechanism: 'kanban — work is pulled by need, never pushed' },
  { domain: 'astronomy', mechanism: 'parallax — distance known by looking from two places' },
  { domain: 'textiles', mechanism: 'warp and weft — a fixed frame and a moving thread make the fabric' },
  { domain: 'cartography', mechanism: 'projection — every map distorts something, on purpose' },
  { domain: 'chemistry', mechanism: 'catalysis — something that makes a change happen without being used up' },
]);

const _id = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const _slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const IMPORT_TAG_RE = /^<!--\s*imported[^>]*-->\s*\n?\n?/;

export function clampAmbition(n) { const v = Math.round(Number(n)); return v >= 1 && v <= 5 ? v : 3; }

/** rollD20(rand) -> { roll 1..20, domain, mechanism } */
export function rollD20(rand = Math.random) {
  const roll = Math.min(20, Math.max(1, Math.floor(rand() * 20) + 1));
  return { roll, ...DOMAINS[roll - 1] };
}

/** a section id from a title, unique among the session's sections */
export function sectionId(title, sections = []) {
  const base = _slug(title) || 'section';
  const taken = new Set(sections.map(s => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** makeSession({ title, source, sections, ambition }) -> session (not stored) */
export function makeSession({ title, source = { kind: 'blank' }, sections = [], ambition = 3, repoUuid = null, specPath = null, ideaUuid = null } = {}) {
  const t = String(title || '').trim();
  if (!t) return { error: 'a workshop needs a title' };
  const now = Date.now();
  const secs = [];
  for (const s of sections) {
    const body = String(s.body == null ? '' : s.body).replace(IMPORT_TAG_RE, '');
    secs.push({ id: sectionId(s.id || s.title, secs), title: String(s.title || s.id || 'section'), body, updatedAt: now, by: s.by || 'source' });
  }
  if (!secs.length) secs.push({ id: 'purpose', title: 'Purpose', body: '', updatedAt: now, by: 'james' });
  return {
    session: {
      uuid: _id('ws'), title: t, source, ambition: clampAmbition(ambition), sections: secs, removed: [], proposals: [],
      repoUuid, specPath, ideaUuid, station: 'workshop', savedAt: null, createdAt: now, updatedAt: now,
      history: [{ at: now, what: `opened from ${source.kind}${source.title ? `: ${source.title}` : ''}` }],
    },
  };
}

/**
 * sectionsFromSpecText(text, yaml) -> [{ id, title, body }]
 * Reads the shapes a repo's spec folder holds: the workshop/library form (spec: meta + sections: [...]); any other YAML
 * (each top-level key a section, its value as YAML); Markdown (## headings); else the whole text as one section.
 */
export function sectionsFromSpecText(text, yaml = null) {
  const src = String(text || '');
  if (yaml) {
    let doc = null; try { doc = yaml.load(src); } catch (_) { doc = null; }
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      if (Array.isArray(doc.sections)) return doc.sections.filter(s => s && typeof s === 'object').map(s => ({ id: s.id || s.title, title: s.title || s.id || 'section', body: String(s.body == null ? '' : s.body) }));
      const root = doc.spec && typeof doc.spec === 'object' && Object.keys(doc).length === 1 ? doc.spec : doc;
      const keys = Object.keys(root);
      if (keys.length) return keys.map(k => ({ id: k, title: k.replace(/_/g, ' '), body: typeof root[k] === 'string' ? root[k] : yaml.dump(root[k], { lineWidth: -1, noRefs: true }).trimEnd() }));
    }
  }
  const parts = src.split(/^##\s+(.+)$/m);
  if (parts.length >= 3) {
    const out = [];
    if (parts[0].trim()) out.push({ id: 'preamble', title: 'Preamble', body: parts[0].trim() });
    for (let i = 1; i < parts.length; i += 2) out.push({ id: parts[i], title: parts[i].trim(), body: (parts[i + 1] || '').trim() });
    return out;
  }
  return src.trim() ? [{ id: 'document', title: 'Document', body: src.trim() }] : [];
}

/** specText(session, yaml) — the session as the .spec file it saves into the repo's spec folder */
export function specText(session, yaml) {
  const doc = {
    spec: {
      name: session.title, ambition: `${session.ambition} — ${AMBITION[session.ambition].label}`,
      workshop: session.uuid, source: session.source && session.source.kind !== 'blank' ? `${session.source.kind}${session.source.title ? `: ${session.source.title}` : ''}` : 'blank',
      updated: new Date(session.updatedAt || Date.now()).toISOString(),
    },
    sections: session.sections.map(s => ({ id: s.id, title: s.title, body: s.body })),
  };
  return `# ${session.title} — made in the spec workshop (idearium)\n` + yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

function _touch(session, what) { session.updatedAt = Date.now(); if (what) session.history.push({ at: session.updatedAt, what }); if (session.history.length > 200) session.history.splice(0, session.history.length - 200); return session; }

/** editSection(session, { id, title?, body?, add?, remove? }) — James's own writing; removal archives (§0.3) */
export function editSection(session, { id = null, title = null, body = null, add = false, remove = false, after = null } = {}) {
  if (add) {
    const t = String(title || 'New section').trim();
    const s = { id: sectionId(t, session.sections), title: t, body: String(body || ''), updatedAt: Date.now(), by: 'james' };
    const at = after ? session.sections.findIndex(x => x.id === after) : -1;
    if (at >= 0) session.sections.splice(at + 1, 0, s); else session.sections.push(s);
    _touch(session, `added section ${s.title}`);
    return { session, section: s };
  }
  const i = session.sections.findIndex(s => s.id === id);
  if (i < 0) return { error: `no section ${id}` };
  if (remove) {
    const [gone] = session.sections.splice(i, 1);
    session.removed.push({ ...gone, removedAt: Date.now() });
    _touch(session, `removed section ${gone.title} (kept in removed)`);
    return { session, removed: gone };
  }
  const s = session.sections[i];
  if (title != null) s.title = String(title).trim() || s.title;
  if (body != null) s.body = String(body);
  s.updatedAt = Date.now(); s.by = 'james';
  _touch(session, null);
  return { session, section: s };
}

/** restoreSection(session, id) — a removed section back where it was asked */
export function restoreSection(session, id) {
  const i = session.removed.findIndex(s => s.id === id);
  if (i < 0) return { error: `no removed section ${id}` };
  const [s] = session.removed.splice(i, 1);
  delete s.removedAt; s.id = sectionId(s.id, session.sections);
  session.sections.push(s);
  _touch(session, `restored section ${s.title}`);
  return { session, section: s };
}

function _specDigest(session, { focus = null, limit = 6000 } = {}) {
  const lines = [`Spec: ${session.title}`];
  for (const s of session.sections) {
    const body = String(s.body || '').trim();
    lines.push(`\n## ${s.title}${focus && s.id === focus ? '  (← this section)' : ''}\n${body || '(empty)'}`);
  }
  const t = lines.join('\n');
  return t.length > limit ? `${t.slice(0, limit)}\n… (${t.length - limit} more characters of the spec not shown)` : t;
}

/**
 * feedPrompt(session, kind, { sectionId, roll, endState, inspiration }) -> { prompt, meta } | { error }
 * The agent's instructions are plain and fixed: it proposes, James decides. One idea per line, no preamble.
 */
export function feedPrompt(session, kind, { sectionId: sid = null, roll = null, inspiration = [] } = {}) {
  if (!FEED_IDS.includes(kind)) return { error: `unknown feed "${kind}" — one of ${FEED_IDS.join(', ')}` };
  const amb = AMBITION[session.ambition];
  const head = [
    `You are helping James make a spec in his spec workshop. James is the idea generator; you only propose. He accepts or dismisses each line.`,
    `Ambition ${session.ambition} of 5 (${amb.label}): ${amb.guide}`,
    `Answer with one proposal per line. No preamble, no numbering, no closing remarks.`,
  ].join('\n');
  const spec = _specDigest(session, { focus: sid });
  let ask, meta = {};
  if (kind === 'd20') {
    const r = roll || rollD20();
    meta = { roll: r.roll, domain: r.domain, mechanism: r.mechanism };
    ask = `The d20 rolled ${r.roll}: ${r.domain}. Its mechanism: ${r.mechanism}.\nMap that mechanism onto this spec. Give 3–5 concrete ways it could change what this spec does or how it works, each naming the part of the spec it touches.`;
  } else if (kind === 'reverse-chain') {
    ask = `Invent one end-state for this spec — a finished, surprising version of it, the way "a workbench that automatically clears off, and sets up the placement for your tools" is an end-state for a workbench. State it on the first line, starting "END: ".\nThen walk backwards: each following line one thing that would have to exist for the line above it, starting "← ". Stop when you reach something this spec already has or could build next.`;
  } else if (kind === 'inspiration') {
    const own = (inspiration || []).slice(0, 40).map(x => `- ${x.title}${x.summary ? ` — ${String(x.summary).slice(0, 140)}` : ''}${x.kind ? ` (${x.kind})` : ''}`).join('\n');
    meta = { from: (inspiration || []).length };
    ask = own
      ? `These are things James has already built or specified:\n${own}\n\nName connections between them and this spec: what this spec could borrow, combine with, or become because of them. Each line names the piece of his work it comes from.`
      : `James has no library or repos to draw on yet. Say so on one line, then give 3 ideas from the spec itself.`;
  } else if (kind === 'section') {
    const s = session.sections.find(x => x.id === sid);
    if (!s) return { error: 'pick the section to draft' };
    meta = { sectionId: s.id };
    ask = `Draft the "${s.title}" section of this spec${s.body.trim() ? ', improving what is there' : ''}. Write it as the section's text, plain. It will be shown to James as one proposal.`;
  } else {
    ask = FEEDS[kind].ask;
  }
  return { prompt: `${head}\n\n${spec}\n\n${ask}`, meta };
}

/** parseLines(text, kind) — the model's reply as proposal lines (a section draft stays one proposal) */
export function parseLines(text, kind) {
  const t = String(text || '').replace(/^```[a-z]*\n?|```$/gm, '').trim();
  if (!t) return [];
  if (kind === 'section') return [t];
  if (kind === 'reverse-chain') return [t.split('\n').map(l => l.trim()).filter(Boolean).join('\n')];   // one chain, kept whole
  return t.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(l => l && !/^(here (are|is)|sure[,!]|certainly)/i.test(l)).slice(0, 12);
}

/** addProposals(session, kind, lines, meta) — stored apart from the sections; nothing is written into the spec */
export function addProposals(session, kind, lines, meta = {}) {
  const now = Date.now();
  const added = lines.map(text => ({ uuid: _id('wp'), kind, text, status: 'open', at: now, sectionId: meta.sectionId || null, ambition: session.ambition,
    ...(meta.domain ? { domain: meta.domain, roll: meta.roll } : {}), ...(meta.by ? { by: meta.by } : {}) }));
  session.proposals.push(...added);
  _touch(session, `${FEEDS[kind].label}: ${added.length} proposal(s)${meta.domain ? ` (d20 ${meta.roll}: ${meta.domain})` : ''}`);
  return { session, added };
}

/**
 * decide(session, proposalUuid, { action: 'accept'|'dismiss'|'reopen', sectionId, mode: 'append'|'replace'|'new' })
 * The only way a proposal's text reaches a section. 'replace' keeps the old body in the section's prior[] (§0.3).
 */
export function decide(session, puid, { action, sectionId: sid = null, mode = 'append', title = null } = {}) {
  const p = session.proposals.find(x => x.uuid === puid);
  if (!p) return { error: `no proposal ${puid}` };
  if (action === 'dismiss' || action === 'reopen') { p.status = action === 'dismiss' ? 'dismissed' : 'open'; p.decidedAt = Date.now(); _touch(session, null); return { session, proposal: p }; }
  if (action !== 'accept') return { error: `action must be accept, dismiss or reopen` };
  if (p.status === 'accepted') return { error: 'already accepted' };
  let s;
  if (mode === 'new') {
    const t = String(title || (p.kind === 'section' ? 'Section' : FEEDS[p.kind].label)).trim();
    s = { id: sectionId(t, session.sections), title: t, body: p.text, updatedAt: Date.now(), by: 'agent, accepted by james' };
    session.sections.push(s);
  } else {
    s = session.sections.find(x => x.id === (sid || p.sectionId));
    if (!s) return { error: 'pick the section to put it in (or accept it as a new section)' };
    if (mode === 'replace') { s.prior = [...(s.prior || []), { body: s.body, at: Date.now() }].slice(-20); s.body = p.text; }
    else s.body = s.body.trim() ? `${s.body.replace(/\s+$/, '')}\n\n${p.kind === 'section' ? '' : '- '}${p.text}` : p.text;
    s.updatedAt = Date.now(); s.by = 'agent, accepted by james';
  }
  p.status = 'accepted'; p.decidedAt = Date.now(); p.into = s.id;
  _touch(session, `accepted into ${s.title}`);
  return { session, proposal: p, section: s };
}

/** summary(session) — the listing row */
export function summary(s) {
  return { uuid: s.uuid, title: s.title, source: s.source, ambition: s.ambition, sections: s.sections.length,
    open: s.proposals.filter(p => p.status === 'open').length, repoUuid: s.repoUuid, specPath: s.specPath, savedAt: s.savedAt, updatedAt: s.updatedAt };
}

// ── the agent ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The workshop asks the same agents the repos use: copilot's /api/prompt (lib/repo-agent.js routes the person's default
// provider — Ollama or a guardian agent). setAsk() swaps it (tests); the API supplies the real one.
let _ask = null;
export function setAsk(fn) { _ask = typeof fn === 'function' ? fn : null; }
export async function ask(prompt, opts = {}) {
  if (!_ask) return { ok: false, error: 'no agent connected to the workshop' };
  try { return await _ask(prompt, opts); } catch (e) { return { ok: false, error: e.message }; }
}

/** feed(session, kind, opts) — prompt → the agent → proposals. A failed agent call is said, never filled in. */
export async function feed(session, kind, opts = {}) {
  const fp = feedPrompt(session, kind, opts);
  if (fp.error) return { error: fp.error };
  const r = await ask(fp.prompt, { kind, sessionUuid: session.uuid });
  if (!r || !r.ok) return { error: `the agent did not answer: ${(r && r.error) || 'no reply'}`, meta: fp.meta };
  const lines = parseLines(r.text, kind);
  if (!lines.length) return { error: 'the agent answered with nothing usable', meta: fp.meta, raw: String(r.text || '').slice(0, 400) };
  const out = addProposals(session, kind, lines, { ...fp.meta, by: r.by || null });
  return { ...out, meta: fp.meta };
}

export default { TABLE, AMBITION, FEEDS, FEED_IDS, DOMAINS, rollD20, makeSession, sectionsFromSpecText, specText, editSection, restoreSection,
  feedPrompt, parseLines, addProposals, decide, summary, setAsk, ask, feed, clampAmbition, sectionId };
