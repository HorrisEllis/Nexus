/**
 * idearium/lib/void.js — the spatial void: where James's ideas are born and worked (0.39.295 V2).
 * component_id: idearium.void
 * UUID: nexus-idearium-void-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-spatial-void-phasemap.spec
 *
 * James, 2026-10-02: "take the spacial void ad completely rebuild it for the new nexus … keep the style … i thought
 * maybe we replace, ideas, and brain storm. Just have the spacial void, with a slider that moves from: normal,
 * creative, outside the box, novel, outlier. then moves another switch from the opposit side: stable, shaky, risky,
 * dangerous, unstable. with those linked togethe" · "the ideas come from me though not agents".
 *
 * The rule this file keeps: an idea is only ever James's words. The agent answers an idea (an ECHO: questions, angles,
 * checks) and never writes one. The two dials say how it answers:
 *   creativity (0 normal … 4 outlier)  — how far it pushes his idea outward
 *   stability  (0 stable … 4 unstable) — how hard it checks his idea against what is real
 * Linked with slack: they move together unless one is held; the gap is the TENSION (creativity − stability).
 * The voices are the old Nexus's reasoning engines, rebuilt: EROSMANCER (end-states, cross-domain transfer) on the
 * creative side, HOSTILE TRUTH and DELTA RISK on the stability side, UNIFIED where the two dials meet.
 *
 * Pure — the API owns the store (idearium_void_echoes, the ideas) and the agent call.
 */

import { rollD20 } from './workshop.js';

export const MODULE_ID = 'nexus-idearium-void-v1-0000-2026-1002-jamesbrooks-001';
export const ECHO_TABLE = 'idearium_void_echoes';
export const CREATIVITY = Object.freeze(['normal', 'creative', 'outside the box', 'novel', 'outlier']);
export const STABILITY = Object.freeze(['stable', 'shaky', 'risky', 'dangerous', 'unstable']);
export const ECHO_KINDS = Object.freeze(['echo', 'd20', 'reverse', 'ground', 'collide']);

const lvl = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(4, Math.max(0, v)) : 0; };
const unit = (n, d) => { const v = Number(n); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d; };

/**
 * link({ creativity, stability, held }, { dial, to }) -> { creativity, stability, held }
 * Moving a dial carries the other with it — normal↔stable … outlier↔unstable. A hold (on either dial) is the slack:
 * while it is on, each dial moves alone, and the gap between them is the tension. Releasing the hold relinks them
 * from the next move.
 */
export function link(state = {}, { dial, to } = {}) {
  const s = { creativity: lvl(state.creativity), stability: lvl(state.stability), held: ['creativity', 'stability'].includes(state.held) ? state.held : null };
  if (dial !== 'creativity' && dial !== 'stability') return s;
  s[dial] = lvl(to);
  if (!s.held) s[dial === 'creativity' ? 'stability' : 'creativity'] = s[dial];
  return s;
}

/** tension(c, s): positive — wilder than it is unsteady (the rare ones); negative — a plain idea on shaky ground */
export function tension(creativity, stability) { return lvl(creativity) - lvl(stability); }
export function tensionLabel(t) {
  if (t === 0) return 'linked';
  const a = Math.abs(t);
  const size = a === 1 ? 'slight' : a === 2 ? 'pulling' : a === 3 ? 'strained' : 'at breaking point';
  return t > 0 ? `${size} — wild, held steady` : `${size} — plain, on unsteady ground`;
}

/** the voice of each dial position (the old engines, rebuilt as what the agent is told to do) */
export const CREATIVE_VOICE = Object.freeze([
  { name: 'CLARITY',    ask: 'Help him say it clearly: restate the core of his idea in one plain line, then ask what is still vague.' },
  { name: 'ANGLES',     ask: 'Offer other angles on his idea — other framings, who else it serves, where else it could live. Each an angle on HIS idea.' },
  { name: 'INVERSION',  ask: 'Ask the questions nobody asks about it. Flip one assumption it rests on and ask what happens.' },
  { name: 'EROSMANCER', ask: 'Cross-domain transfer: name a field whose mechanism fits his idea and say how that mechanism would change it. Find the hidden leverage.' },
  { name: 'EROSMANCER', ask: 'Reverse-engineer from the end-state: imagine his idea at its furthest, strangest finished form, then say what that end-state asks of it now.' },
]);
export const STABLE_VOICE = Object.freeze([
  { name: 'GROUND',        ask: 'Ground it: what of it can be built today with what exists, what he already has that it can stand on, and the first piece to build.' },
  { name: 'GROUND',        ask: 'Name the two or three things most likely to make it fail, plainly.' },
  { name: 'HOSTILE TRUTH', ask: 'Stress-test it: its single points of failure, what breaks first, the assumption that will not hold.' },
  { name: 'DELTA RISK',    ask: 'Map the cascades: if its weakest part fails, what fails after it, and after that.' },
  { name: 'UNCHECKED',     ask: 'Do not check whether it can work. Only flag, in one line, what would break.' },
]);

export function voiceOf(creativity, stability) {
  const c = CREATIVE_VOICE[lvl(creativity)], s = STABLE_VOICE[lvl(stability)];
  return { name: lvl(creativity) === lvl(stability) ? `UNIFIED · ${c.name} + ${s.name}` : `${c.name} + ${s.name}`, creative: c, stable: s };
}

/** shapeVoid(prev, patch) — the void state an idea carries: its dials, where it sits, and what it was born at */
export function shapeVoid(prev = null, patch = {}) {
  const now = Date.now();
  const base = prev && typeof prev === 'object' ? prev : null;
  const c = patch.creativity !== undefined ? lvl(patch.creativity) : base ? lvl(base.creativity) : 0;
  const s = patch.stability !== undefined ? lvl(patch.stability) : base ? lvl(base.stability) : 0;
  const v = {
    creativity: c, stability: s, tension: tension(c, s),
    held: patch.held !== undefined ? (['creativity', 'stability'].includes(patch.held) ? patch.held : null) : (base ? base.held || null : null),
    x: patch.x !== undefined ? unit(patch.x, 0.5) : base ? base.x : null,
    y: patch.y !== undefined ? unit(patch.y, 0.5) : base ? base.y : null,
    worked: (base ? base.worked || 0 : 0) + (patch.work ? 1 : 0),
    touchedAt: patch.touch === false ? (base ? base.touchedAt : now) : now,
    born: base && base.born ? base.born : { creativity: c, stability: s, tension: tension(c, s), at: now },
  };
  return v;
}

/** placeFor(uuid) — a stable spot in the field for an idea that has none (spread by its id, never the centre) */
export function placeFor(uuid) {
  let h = 2166136261; for (const ch of String(uuid)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const a = (h % 3600) / 3600 * Math.PI * 2, r = 0.18 + ((h >>> 12) % 1000) / 1000 * 0.24;
  return { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r * 0.82 };
}

/**
 * glow(idea, now) -> { glow 0.12..1, drift 0..1 } — brighter the more he has worked it; untouched ideas fade and
 * drift toward the edge of the field (his attention, made visible).
 */
export function glow(idea, now = Date.now()) {
  const v = idea.void || {};
  const touched = v.touchedAt || idea.updatedAt || idea.createdAt || now;
  const days = Math.max(0, (now - touched) / 86400000);
  const worked = v.worked || 0;
  const recency = Math.exp(-days / 30);
  const g = Math.min(1, 0.3 + 0.18 * Math.log2(1 + worked)) * (0.35 + 0.65 * recency);
  return { glow: Math.max(0.12, Math.round(g * 100) / 100), drift: Math.round(Math.min(1, days / 90) * 100) / 100 };
}

const RULE = [
  'James is the idea generator. The idea below is HIS, in his words.',
  'Do not write a new idea, do not rename his, do not rewrite it. Answer it: questions, angles, checks — each about his idea.',
  'Short lines, one thought per line. No preamble, no numbering, no closing remarks.',
].join('\n');

function _ideaBlock(idea) { return `His idea:\n"${String(idea.text || '').trim()}"`; }

/**
 * echoPrompt({ idea, creativity, stability, kind, other, context }) -> { prompt, voice, meta } | { error }
 *   kind 'echo'    — the dials' voices
 *   kind 'd20'     — Erosmancer with a rolled field (the workshop's twenty)
 *   kind 'reverse' — Erosmancer, the end-state walked back
 *   kind 'ground'  — the exit gate: stable, whatever the dials say
 *   kind 'collide' — two of his ideas: how they fit or clash, never a third idea
 * context: { repos: [names], library: [titles] } — what he already has, for grounding
 */
export function echoPrompt({ idea, creativity = 0, stability = 0, kind = 'echo', other = null, context = {}, roll = null } = {}) {
  if (!idea || !String(idea.text || '').trim()) return { error: 'no idea to answer' };
  if (!ECHO_KINDS.includes(kind)) return { error: `kind must be one of ${ECHO_KINDS.join(', ')}` };
  let c = lvl(creativity), s = lvl(stability);
  if (kind === 'ground') s = 0;
  const v = voiceOf(c, s);
  const have = [
    (context.repos || []).length ? `His repos: ${(context.repos || []).slice(0, 30).join(', ')}` : '',
    (context.library || []).length ? `His spec library: ${(context.library || []).slice(0, 30).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const dials = `Creativity: ${CREATIVITY[c]} (${c} of 4). Stability: ${STABILITY[s]} (${s} of 4).`;
  let ask, meta = { creativity: c, stability: s, tension: tension(c, s) };
  if (kind === 'echo') {
    ask = `${dials}\nPush it outward this far — ${v.creative.ask}\nCheck it this hard — ${v.stable.ask}`;
  } else if (kind === 'd20') {
    const r = roll || rollD20();
    meta = { ...meta, roll: r.roll, domain: r.domain, mechanism: r.mechanism };
    ask = `${dials}\nEROSMANCER — the d20 rolled ${r.roll}: ${r.domain}. Its mechanism: ${r.mechanism}.\nSay how that mechanism would change his idea — what it would do differently, which part of it it touches. Then, at this stability, ${v.stable.ask.charAt(0).toLowerCase()}${v.stable.ask.slice(1)}`;
  } else if (kind === 'reverse') {
    ask = `${dials}\nEROSMANCER — reverse causal chain. First line: "END: " and his idea at its furthest finished form (still his idea, grown — not a new one). Then each line "← " one thing that would have to exist for the line above, until you reach something he could build now.`;
  } else if (kind === 'ground') {
    ask = `This idea is about to leave the void for the spec workshop. Ground it, plainly: what of it can be built today, what he already has that it stands on, what is missing, and the first piece to build. Say if anything in it cannot be built yet.`;
  } else {
    if (!other || !String(other.text || '').trim()) return { error: 'a collision needs two ideas' };
    meta = { ...meta, otherUuid: other.uuid || null };
    ask = `${dials}\nHe has pushed two of his ideas together. Say how they fit and where they clash — what each gives the other, what breaks if they are one. Do not invent a third idea.\nHis other idea:\n"${String(other.text).trim()}"`;
  }
  return { prompt: `${RULE}\n\n${_ideaBlock(idea)}\n\n${have ? have + '\n\n' : ''}${ask}`, voice: kind === 'ground' ? 'GROUND' : kind === 'd20' || kind === 'reverse' ? `EROSMANCER + ${v.stable.name}` : v.name, meta };
}

/** echoLines(text) — the agent's answer as lines (a reverse chain keeps its END/← shape) */
export function echoLines(text) {
  return String(text || '').replace(/^```[a-z]*\n?|```$/gm, '').split(/\n+/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(l => l && !/^(here (are|is)|sure[,!]|certainly|of course)/i.test(l)).slice(0, 14);
}

/** makeEcho(...) — the stored answer: apart from the idea, until James takes from it */
export function makeEcho({ idea, kind, voice, meta = {}, text, by = null }) {
  return {
    uuid: `ve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, ideaUuid: idea.uuid, kind, voice,
    creativity: meta.creativity, stability: meta.stability, tension: meta.tension,
    ...(meta.domain ? { roll: meta.roll, domain: meta.domain, mechanism: meta.mechanism } : {}),
    ...(meta.otherUuid ? { otherUuid: meta.otherUuid } : {}),
    lines: echoLines(text), at: Date.now(), by, status: 'open', taken: [],
  };
}

/**
 * take(idea, echo, { words }) -> { text } | { error }
 * The only way an echo reaches an idea: James's own words for the part he keeps — added to his idea, never replacing it.
 */
export function take(idea, echo, { words } = {}) {
  const w = String(words || '').trim();
  if (!w) return { error: 'say what you keep from it, in your words' };
  if (echo.ideaUuid !== idea.uuid && echo.otherUuid !== idea.uuid) return { error: 'that echo belongs to another idea' };
  return { text: `${String(idea.text || '').replace(/\s+$/, '')}\n${w}` };
}

export default { CREATIVITY, STABILITY, ECHO_KINDS, ECHO_TABLE, link, tension, tensionLabel, voiceOf, shapeVoid, placeFor, glow,
  echoPrompt, echoLines, makeEcho, take, CREATIVE_VOICE, STABLE_VOICE };
