'use strict';
/**
 * clear-glass/src/page/page-map.js — PM2–PM4: blocks → an index and chunks → a synthesized map → intent → the blocks to act on.
 * comp_id: clear-glass.page.page-map
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM2_index_and_chunks, PM3_synthesized_map_that_learns,
 * PM4_intent_to_targets)
 *
 * James, 2026-10-19: "parse the dom, index each element as blocks, then download into a index to chunk, then synthesize a fucking
 * map in relation to the weboage to use as a map or reference point for inputs from the cli or the intent. learns over time." ·
 * "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,, web scraper."
 *
 * All pure, no model, no network (deterministic first): the same page gives the same map.
 *   chunk(page, { maxChars })      → [{ id, title, address, blocks: [id], text, chars }] — one per landmark / section heading,
 *                                    split when over budget; every block in exactly one chunk
 *   index(page)                    → { terms: Map(term → [[blockIdx, weight]]), n } — names weigh more than text
 *   search(page, idx, query, opts) → [{ block, score, hits }]
 *   synthesize(page, { chunks })   → { site, url, title, regions, forms, actions, nav, counts, lines } — `lines` is the map as
 *                                    short text a 3B model reads ("form "Apply" — 4 fields (Email*, …) → button "Submit"")
 *   find(page, intent, { memory }) → ranked targets for an intent, each with selector, address, centre (cx, cy) and why — the
 *                                    words, the block's kind against the intent's verb (type → field, click → action), whether it
 *                                    is on top (z 0), how stable it is on this site, and what worked here before (page-memory)
 *   toMarkdown(page, chunks) / toJSON(page, chunks) — the scraper's output
 */
const MODULE_ID = 'clear-glass.page.page-map';
const VERSION = '1.0.0';

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'is', 'it', 'my', 'me', 'i', 'this', 'that', 'with', 'please', 'into', 'from', 'by', 'be', 'your', 'you']);
const terms = (s) => String(s || '').toLowerCase().split(/[^a-z0-9@.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => w.length > 1 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '') || w;

/** the verbs an intent says, and the kind of block each wants */
const VERB = [
  [/\b(type|enter|fill|write|input|search for|put)\b/, ['field']],
  [/\b(click|press|tap|submit|send|apply|open|choose|select|pick|toggle|check)\b/, ['action', 'link', 'field']],
  [/\b(go to|navigate|visit|follow)\b/, ['link', 'action']],
  [/\b(read|find|show|what|where|get|copy|scrape)\b/, ['content', 'heading', 'container']],
];

function chunk(page, { maxChars = 1800 } = {}) {
  const blocks = page.blocks || [];
  const out = []; let cur = null;
  const open = (b) => { cur = { id: `c${out.length + 1}`, title: b ? (b.name || b.text || b.role).slice(0, 80) : '(top)', address: b ? b.address : '', blocks: [], text: '', chars: 0 }; out.push(cur); };
  for (const b of blocks) {
    const breaks = b.kind === 'landmark' || (b.kind === 'heading' && (b.level || 2) <= 3);
    const t = [b.kind === 'heading' ? `${'#'.repeat(Math.min(b.level || 2, 6))} ` : '', b.text || b.name].join('').trim();
    if (!cur || breaks || (cur.chars + t.length > maxChars && cur.blocks.length)) open(breaks ? b : null);
    cur.blocks.push(b.id);
    if (t) { cur.text += (cur.text ? '\n' : '') + t; cur.chars += t.length + 1; }
  }
  return out;
}

function index(page) {
  const map = new Map();
  (page.blocks || []).forEach((b, i) => {
    const add = (s, w) => { for (const t of terms(s)) { const k = stem(t); if (!map.has(k)) map.set(k, new Map()); const m = map.get(k); m.set(i, Math.max(m.get(i) || 0, w)); } };
    add(b.name, 3); add(b.role, 1.5); add(b.text, 1); add(b.attrs && (b.attrs.placeholder || b.attrs.name || b.attrs.type), 2);
    const region = String(b.address || '').split(' › ').slice(0, -1).join(' '); add(region, 0.5);
  });
  const terms_ = new Map(); for (const [k, m] of map) terms_.set(k, [...m.entries()]);
  return { terms: terms_, n: (page.blocks || []).length };
}

function search(page, idx, query, { limit = 10 } = {}) {
  const q = [...new Set(terms(query).map(stem))];
  const score = new Map(), hits = new Map();
  for (const t of q) {
    const posting = idx.terms.get(t) || [];
    const idf = posting.length ? Math.log(1 + idx.n / posting.length) : 0;
    for (const [i, w] of posting) { score.set(i, (score.get(i) || 0) + w * idf); if (!hits.has(i)) hits.set(i, []); hits.get(i).push(t); }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([i, s]) => ({ block: page.blocks[i], score: +s.toFixed(3), hits: hits.get(i) }));
}

function synthesize(page, { chunks = null } = {}) {
  const blocks = page.blocks || [];
  const byI = new Map(blocks.map(b => [b.i, b]));
  const under = (b, pred) => { for (let p = byI.get(b.parent); p; p = byI.get(p.parent)) if (pred(p)) return p; return null; };
  const regions = blocks.filter(b => b.kind === 'landmark' || b.kind === 'container').map(r => {
    const inside = blocks.filter(b => under(b, p => p.i === r.i));
    return { id: r.id, role: r.role, name: r.name, address: r.address, blocks: inside.length,
      fields: inside.filter(b => b.kind === 'field').length, actions: inside.filter(b => b.kind === 'action').length, links: inside.filter(b => b.kind === 'link').length };
  });
  const forms = blocks.filter(b => b.role === 'form' || b.role === 'search').map(f => {
    const inside = blocks.filter(b => under(b, p => p.i === f.i));
    const fields = inside.filter(b => b.kind === 'field').map(b => ({ id: b.id, role: b.role, name: b.name, required: (b.states || []).includes('required'), selector: b.selector }));
    const submit = inside.filter(b => b.kind === 'action').map(b => ({ id: b.id, name: b.name, selector: b.selector }));
    return { id: f.id, name: f.name, address: f.address, fields, submit };
  });
  const inForm = new Set(forms.flatMap(f => [...f.fields.map(x => x.id), ...f.submit.map(x => x.id)]));
  const loose = blocks.filter(b => b.kind === 'field' && !inForm.has(b.id)).map(b => ({ id: b.id, role: b.role, name: b.name, selector: b.selector }));
  const actions = blocks.filter(b => b.kind === 'action' && !inForm.has(b.id) && b.name).map(b => ({ id: b.id, name: b.name, selector: b.selector, z: b.z }));
  const nav = blocks.filter(b => b.kind === 'link' && under(b, p => p.role === 'navigation' || p.role === 'banner')).length;
  const headings = blocks.filter(b => b.kind === 'heading').map(b => ({ id: b.id, level: b.level || null, name: b.name }));
  const counts = {}; for (const b of blocks) counts[b.kind] = (counts[b.kind] || 0) + 1;
  const lines = [`${page.title || '(untitled)'} — ${page.site || page.url || ''} · ${blocks.length} blocks (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')})`];
  for (const h of headings.slice(0, 8)) lines.push(`${'#'.repeat(Math.min(h.level || 2, 4))} ${h.name}`);
  for (const r of regions.filter(r => r.role !== 'form').slice(0, 10)) lines.push(`${r.role}${r.name ? ` "${r.name}"` : ''} — ${r.blocks} blocks${r.fields ? `, ${r.fields} fields` : ''}${r.actions ? `, ${r.actions} actions` : ''}${r.links ? `, ${r.links} links` : ''}`);
  for (const f of forms) lines.push(`form${f.name ? ` "${f.name}"` : ''} — ${f.fields.length} field(s) (${f.fields.slice(0, 6).map(x => `${x.name || x.role}${x.required ? '*' : ''}`).join(', ')})${f.submit.length ? ` → button "${f.submit[f.submit.length - 1].name}"` : ''}`);
  if (loose.length) lines.push(`fields outside a form: ${loose.slice(0, 6).map(x => x.name || x.role).join(', ')}`);
  if (actions.length) lines.push(`actions: ${actions.slice(0, 10).map(a => `"${a.name}"${a.z > 0 ? ' (covered)' : ''}`).join(', ')}`);
  if (nav) lines.push(`navigation: ${nav} link(s)`);
  if (chunks) lines.push(`${chunks.length} chunk(s) of text`);
  return { site: page.site, url: page.url, title: page.title, regions, forms, fields: loose, actions, headings, nav, counts, lines };
}

/**
 * find(page, intent, { memory, idx, limit }) — memory: { stability(blockId) → 0..1, learned(intent) → { blockId: +n/-n } }
 * (page-memory.js forPage()). A covered block (z > 0) sinks; off-screen (z -1) sinks less (it can be scrolled to).
 */
function find(page, intent, { memory = null, idx = null, limit = 5 } = {}) {
  const ix = idx || index(page);
  const verbKinds = []; for (const [re, ks] of VERB) if (re.test(String(intent).toLowerCase())) verbKinds.push(...ks);
  const learned = memory && memory.learned ? memory.learned(intent) : {};
  const hits = search(page, ix, intent, { limit: 50 });
  const pool = new Map(hits.map(h => [h.block.id, h]));
  for (const id of Object.keys(learned)) if (!pool.has(id)) { const b = (page.blocks || []).find(x => x.id === id); if (b) pool.set(id, { block: b, score: 0, hits: [] }); }
  const ranked = [...pool.values()].map(h => {
    const b = h.block, why = [];
    let s = h.score; if (h.hits.length) why.push(`words: ${h.hits.join(', ')}`);
    if (verbKinds.length && verbKinds.includes(b.kind)) { s *= 1.6 - 0.15 * verbKinds.indexOf(b.kind); why.push(`a ${b.kind} for "${intent}"`); }
    else if (verbKinds.length) s *= 0.5;
    if (b.z > 0) { s *= 0.4; why.push(`covered (${b.z} layer(s) on top)`); } else if (b.z === -1) { s *= 0.8; why.push('off-screen'); }
    const st = memory && memory.stability ? memory.stability(b.id) : null;
    if (st != null) { s *= 0.8 + 0.4 * st; if (st >= 0.5) why.push(`stable here (${Math.round(st * 100)}%)`); }
    const l = learned[b.id] || 0;
    if (l) { s = l > 0 ? (s + 1) * (1 + l) : s / (1 + -l); why.push(l > 0 ? `worked for this before (${l}×)` : `failed for this before (${-l}×)`); }
    const c = b.box ? { cx: Math.round(b.box.x + b.box.w / 2), cy: Math.round(b.box.y + b.box.h / 2) } : {};
    return { id: b.id, score: +s.toFixed(3), kind: b.kind, role: b.role, name: b.name, address: b.address, selector: b.selector, ...c, z: b.z, why };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return { intent, verbs: [...new Set(verbKinds)], targets: ranked };
}

function toMarkdown(page, chunks) {
  const cs = chunks || chunk(page);
  return [`# ${page.title || page.url || 'page'}`, page.url ? `<${page.url}>` : '', ...cs.map(c => `\n## ${c.title}\n\n${c.text}`)].filter(Boolean).join('\n');
}
function toJSON(page, chunks) {
  const cs = chunks || chunk(page);
  return { url: page.url, title: page.title, site: page.site, blocks: page.blocks, chunks: cs, map: synthesize(page, { chunks: cs }) };
}

module.exports = { MODULE_ID, VERSION, terms, chunk, index, search, synthesize, find, toMarkdown, toJSON };
