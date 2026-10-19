'use strict';
/**
 * clear-glass/src/page/page-session.js — PM5/PM6: the page map as actions on a window, and what Nerve feels from it.
 * comp_id: clear-glass.page.page-session
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM5_tools_routes_commands, PM6_nerve_feel)
 *
 * James, 2026-10-19: "interaction field, nexus nerve, hooking ollama in to feel with "nexus nerve", see with the interaction field
 * and scrips injected into each page." · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,,
 * web scraper."
 *
 * The driver's page actions are thin; the logic is here so it runs (and is tested) without Electron. Per window (agentId):
 *   map({ evalJs, ... })        read the blocks (blocks.pageScript in the page), visit page-memory (new/changed/gone), synthesize;
 *                               emits 'page.map' with the diff in WORDS — what attention keeps and Nerve carries to Ollama
 *   find({ intent })            ranked targets for an intent on the last map (read fresh when older than maxAgeMs)
 *   chunks({ query, maxChars }) the page's chunks, or the ones a query hits
 *   scrape({ format })          markdown (default) or JSON of blocks + chunks + map
 *   outcome({ intent, id, ok }) what happened when the agent acted on a target — page-memory learns it
 *   poke(agentId)               PM7 — the page changed (the DOM observer dom/archaeology.js injects into every page reports
 *                               dom.mutations): a window mapped before (live) is mapped again once its DOM has been quiet for
 *                               quietMs, at most once per minGapMs — so the map, Nerve and Ollama stay current without the agent
 *                               asking. A window whose read fails (closed, navigated away mid-read) stops being live, said.
 * words(diff, page) → "+2 (form "Apply", button "Next"), 1 changed, 3 gone" — the feel, as text.
 */
const BL = require('./blocks');
const PM = require('./page-map');

const MODULE_ID = 'clear-glass.page.page-session';
const VERSION = '1.0.0';

function words(diff, page) {
  if (!diff) return '';
  if (diff.first) return `first visit: ${(page.blocks || []).length} blocks`;
  const byId = new Map((page.blocks || []).map(b => [b.id, b]));
  const name = (id) => { const b = byId.get(id); return b ? `${b.role}${b.name ? ` "${String(b.name).slice(0, 40)}"` : ''}` : null; };
  const parts = [];
  if (diff.new.length) { const shown = diff.new.map(name).filter(Boolean).filter(s => !/^(paragraph|text|list)$/.test(s)).slice(0, 3); parts.push(`+${diff.new.length}${shown.length ? ` (${shown.join(', ')})` : ''}`); }
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  if (diff.gone.length) parts.push(`${diff.gone.length} gone`);
  return parts.length ? parts.join(', ') : `unchanged (${diff.stable} stable)`;
}

/**
 * createPageSession({ memory, emit, now, maxAgeMs }) — memory: page-memory createMemory(); emit(type, data): the bus.
 * Each call takes evalJs(script) → the in-page result for that window.
 */
function createPageSession({ memory, emit = () => {}, now = () => Date.now(), maxAgeMs = 10000, quietMs = 1500, minGapMs = 5000,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const last = new Map();   // agentId → { page, chunks, at, diff }
  const live = new Map();   // agentId → { evalJs, timer, lastRun } — §PM7 windows whose map follows the page
  async function map({ agentId = 'default', evalJs, maxBlocks, maxChars, live: follow = true, via = 'asked' } = {}) {
    if (typeof evalJs !== 'function') throw new Error('pageMap needs a window to read');
    if (follow) { const l = live.get(agentId); live.set(agentId, { evalJs, timer: l ? l.timer : null, lastRun: now() }); } else unwatch(agentId);
    const raw = await evalJs(BL.pageScript(maxBlocks ? { maxBlocks } : {}));
    const page = BL.normalize(raw, maxBlocks ? { maxBlocks } : {});
    const diff = memory ? memory.visit(page) : null;
    const chunks = PM.chunk(page, maxChars ? { maxChars } : {});
    const syn = PM.synthesize(page, { chunks });
    const feel = words(diff, page);
    const at = now();
    last.set(agentId, { page, chunks, at, diff });
    try { emit('page.map', { agentId, url: page.url, site: page.site, title: page.title, blocks: page.blocks.length, visits: diff ? diff.visits : null,
      new: diff ? diff.new.length : 0, changed: diff ? diff.changed.length : 0, gone: diff ? diff.gone.length : 0, feel, lines: syn.lines.slice(0, 6), via, live: live.has(agentId), ts: at }); } catch (_) {}
    return { site: page.site, url: page.url, title: page.title, stats: page.stats, ...(page.note ? { note: page.note } : {}),
      visits: diff ? diff.visits : null, diff: diff ? { new: diff.new.length, changed: diff.changed.length, gone: diff.gone.length, stable: diff.stable } : null, feel,
      lines: syn.lines, forms: syn.forms, fields: syn.fields, actions: syn.actions, regions: syn.regions, headings: syn.headings, chunks: chunks.length };
  }
  async function current({ agentId = 'default', evalJs, fresh = false } = {}) {
    const l = last.get(agentId);
    if (!fresh && l && now() - l.at <= maxAgeMs) return l;
    await map({ agentId, evalJs });
    return last.get(agentId);
  }
  async function find({ agentId = 'default', evalJs, intent, fresh, limit } = {}) {
    if (!intent || !String(intent).trim()) throw new Error('pageFind needs an intent ("type my email", "click apply")');
    const l = await current({ agentId, evalJs, fresh });
    const r = PM.find(l.page, String(intent), { memory: memory ? memory.forPage(l.page) : null, limit: limit || 5 });
    try { emit('page.find', { agentId, site: l.page.site, intent: r.intent, top: r.targets[0] ? r.targets[0].id : null, ts: now() }); } catch (_) {}
    return { site: l.page.site, url: l.page.url, ...r, next: r.targets.length ? `act on it (pointer at cx,cy · click/type its selector), then pageOutcome { intent, id, ok }` : 'nothing on this page matches — read pageMap or pageChunks' };
  }
  async function chunks({ agentId = 'default', evalJs, query, fresh, maxChars } = {}) {
    const l = await current({ agentId, evalJs, fresh });
    const cs = maxChars ? PM.chunk(l.page, { maxChars }) : l.chunks;
    if (!query) return { site: l.page.site, url: l.page.url, chunks: cs };
    const hits = PM.search(l.page, PM.index(l.page), String(query), { limit: 50 });
    const ids = new Set(hits.map(h => h.block.id));
    return { site: l.page.site, url: l.page.url, query, chunks: cs.filter(c => c.blocks.some(id => ids.has(id))) };
  }
  async function scrape({ agentId = 'default', evalJs, format = 'md', fresh = true } = {}) {
    const l = await current({ agentId, evalJs, fresh });
    return format === 'json' ? PM.toJSON(l.page, l.chunks) : { site: l.page.site, url: l.page.url, format: 'md', markdown: PM.toMarkdown(l.page, l.chunks) };
  }
  function outcome({ agentId = 'default', intent, id, ok } = {}) {
    const l = last.get(agentId);
    if (!l) return { ok: false, why: 'no page map read in this window yet — pageMap first' };
    if (!memory) return { ok: false, why: 'no page memory in this process' };
    const r = memory.outcome(l.page.site, intent, id, ok !== false);
    try { emit('page.outcome', { agentId, site: l.page.site, intent, id, ok: ok !== false, ts: now() }); } catch (_) {}
    return r;
  }
  function unwatch(agentId, why = null) {
    const l = live.get(agentId); if (!l) return false;
    if (l.timer) clearTimer(l.timer);
    live.delete(agentId);
    if (why) { try { emit('page.live.stopped', { agentId, why, ts: now() }); } catch (_) {} }
    return true;
  }
  function poke(agentId) {
    const l = live.get(agentId); if (!l) return false;
    if (l.timer) clearTimer(l.timer);
    const wait = Math.max(quietMs, (l.lastRun || 0) + minGapMs - now());
    l.timer = setTimer(async () => {
      l.timer = null;
      if (live.get(agentId) !== l) return;
      try { await map({ agentId, evalJs: l.evalJs, via: 'live' }); }
      catch (e) { unwatch(agentId, `the live map stopped: ${e.message}`); }
    }, wait);
    return true;
  }
  return { map, find, chunks, scrape, outcome, poke, unwatch, live: () => [...live.keys()], last: (id) => last.get(id) || null };
}

module.exports = { MODULE_ID, VERSION, createPageSession, words };
