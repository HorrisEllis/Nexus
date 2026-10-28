'use strict';
/**
 * clear-glass/src/page/page-memory.js — PM3/PM4: what Clear Glass remembers about a kind of page, so the map learns over time.
 * comp_id: clear-glass.page.page-memory
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM3_synthesized_map_that_learns, PM4_intent_to_targets)
 *
 * James, 2026-10-19: "… synthesize a fucking map in relation to the weboage to use as a map or reference point for inputs from the
 * cli or the intent. learns over time."
 *
 * Learning here is counting, not training (decision D4): per site key (blocks.siteKey — /jobs/123 and /jobs/456 share one):
 *   visit(page)                        → { first, visits, new, changed, gone, stable } — each block's seen count and last text; a
 *                                        block seen on most visits is stable (selectors and addresses on it can be trusted)
 *   outcome(site, intent, blockId, ok) → an intent → block result: success +1, failure −1 (by the intent's words, so "apply now"
 *                                        and "click apply now" share)
 *   forPage(page)                      → { stability(id), learned(intent) } — what page-map.find() reads
 *   read(site) / sites()
 * Stored as one JSON file per site under <dir> (default ~/.clear-glass/page-maps) — data, never committed. A file that will not
 * parse is set aside as .bad and said, not overwritten silently.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'clear-glass.page.page-memory';
const VERSION = '1.0.0';
const DEFAULT_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'page-maps');
const MAX_BLOCKS = 4000;

const _intentKey = (s) => String(s || '').toLowerCase().replace(/\b(click|press|tap|type|enter|fill|go to|open|the|a|an|on|in|into|please)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const _file = (dir, site) => path.join(dir, `${String(site).replace(/^[a-z]+:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}-${crypto.createHash('sha1').update(String(site)).digest('hex').slice(0, 8)}.json`);

function createMemory({ dir = DEFAULT_DIR, now = () => Date.now(), warn = (m) => console.warn(m) } = {}) {
  const cache = new Map();
  function read(site) {
    if (cache.has(site)) return cache.get(site);
    let m = null; const f = _file(dir, site);
    try { if (fs.existsSync(f)) m = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { try { fs.renameSync(f, `${f}.bad`); } catch (_) {} warn(`[page-memory] ${f} did not parse (${e.message}) — kept as .bad, starting this site fresh`); m = null; }
    if (!m) m = { site, visits: 0, first: null, last: null, blocks: {}, intents: {} };
    cache.set(site, m); return m;
  }
  function save(m) {
    try { fs.mkdirSync(dir, { recursive: true }); const f = _file(dir, m.site); fs.writeFileSync(`${f}.tmp`, JSON.stringify(m)); fs.renameSync(`${f}.tmp`, f); return true; }
    catch (e) { warn(`[page-memory] could not save ${m.site}: ${e.message}`); return false; }
  }
  function visit(page) {
    const m = read(page.site); const t = now();
    const first = m.visits === 0; m.visits++; m.first = m.first || t; m.last = t; m.url = page.url; m.title = page.title;
    const here = new Set(); const out = { first, visits: m.visits, new: [], changed: [], gone: [], stable: 0 };
    for (const b of page.blocks || []) {
      here.add(b.id);
      const k = m.blocks[b.id]; const txt = String(b.text || b.name || '').slice(0, 120);
      if (!k) { m.blocks[b.id] = { seen: 1, firstVisit: m.visits, lastVisit: m.visits, role: b.role, name: b.name, address: b.address, text: txt }; if (!first) out.new.push(b.id); }
      else { k.seen++; k.lastVisit = m.visits; if (k.text !== txt) { out.changed.push(b.id); k.text = txt; } k.address = b.address; }
    }
    if (!first) for (const [id, k] of Object.entries(m.blocks)) if (!here.has(id) && k.lastVisit === m.visits - 1) out.gone.push(id);
    for (const id of here) if (stabilityOf(m, id) >= 0.5) out.stable++;
    const ids = Object.keys(m.blocks); if (ids.length > MAX_BLOCKS) for (const id of ids.sort((a, b) => m.blocks[a].lastVisit - m.blocks[b].lastVisit).slice(0, ids.length - MAX_BLOCKS)) delete m.blocks[id];
    save(m);
    return out;
  }
  function stabilityOf(m, id) { const k = m.blocks[id]; if (!k || m.visits < 2) return k ? 0 : null; return Math.min(1, (k.seen - 1) / Math.max(1, m.visits - k.firstVisit)); }
  function outcome(site, intent, blockId, ok) {
    const m = read(site); const key = _intentKey(intent); if (!key || !blockId) return { ok: false, why: 'an intent and a block id are needed' };
    const e = m.intents[key] || (m.intents[key] = {}); e[blockId] = (e[blockId] || 0) + (ok ? 1 : -1);
    save(m); return { ok: true, intent: key, blockId, score: e[blockId] };
  }
  function forPage(page) {
    const m = read(page.site);
    return { visits: m.visits, stability: (id) => stabilityOf(m, id), learned: (intent) => ({ ...(m.intents[_intentKey(intent)] || {}) }) };
  }
  // 0.60.222 — James, 2026-10-28: "detect the actual elements. like hook into the element picker, mayne use it for correcting or creating
  // macros/automation". What he pointed at with the picker, for a named part on a kind of page (key 'fiverr:pricing:basic.delivery'): used
  // before any detection next time. Replaced by a newer pick; dropped by forget().
  function target(site, key) { const m = read(site); return (m.targets && m.targets[key]) || null; }
  function setTarget(site, key, t) {
    if (!key || !t || !t.selector) return { ok: false, why: 'a key and a selector are needed' };
    const m = read(site); m.targets = m.targets || {};
    m.targets[key] = { selector: String(t.selector), xpath: t.xpath || null, by: t.by || 'picker', at: now() };
    save(m); return { ok: true, key, target: m.targets[key] };
  }
  function targets(site) { const m = read(site); return { ...(m.targets || {}) }; }
  function forget(site, key) { const m = read(site); if (!m.targets || !m.targets[key]) return { ok: false, why: `no target ${key}` }; delete m.targets[key]; save(m); return { ok: true }; }
  function sites() { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { site: j.site, visits: j.visits, blocks: Object.keys(j.blocks || {}).length, intents: Object.keys(j.intents || {}).length, last: j.last }; } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } }
  return { dir, read, visit, outcome, forPage, sites, target, setTarget, targets, forget };
}

let _shared = null;
function shared() { return _shared || (_shared = createMemory()); }

module.exports = { MODULE_ID, VERSION, DEFAULT_DIR, createMemory, shared, intentKey: _intentKey };
