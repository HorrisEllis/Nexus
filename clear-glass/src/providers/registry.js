'use strict';
/**
 * src/providers/registry.js — NCP Provider Registry: a CACHE of Guardian's agent facts (GA1, map invariant E13).
 * UUID: cg-provider-registry-v1-0000-0000-000000000012
 *
 * §GA1 2026-10-02 — "Guardian is the source of truth for the Clear Glass agents." This file used to BE the source of
 * truth for "which provider, which URL, which userscript, which hostnames" — and it disagreed with Guardian (it alone had
 * deepseek). Now the facts are Guardian's provider nodes, served at GET :7820/api/providers with their hash
 * (guardian/lib/agent-facts.js), and this registry is a cache of them:
 *   - at load: the cache file (<data>/clear-glass/providers-cache.json), its stamp checked against its own content
 *     (lib/agent-facts-hash.js — the one hash Guardian uses). A cache edited by hand no longer matches its stamp: that
 *     is a GAP (verify() says so, 'agent.cache.stale' is emitted on refresh) — never a silent second truth.
 *   - refresh() at boot: fetch Guardian's facts; a different hash replaces the cache and the live table.
 *   - Guardian down: run on the stamped cache; no cache yet: on SEED below, stamped too, and said (from: 'seed').
 * The exports are unchanged (NCP_PROVIDERS stays one live object), so host.js, selector-assign.js, the options store
 * and main/index.js read it as before.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const H = require('../../../lib/agent-facts-hash.js');

// SEED — the facts as they stood when Guardian took them over (they are guardian/data/nodes/provider/*.provider now).
// Used only until the first refresh from Guardian, and said when it is.
const SEED = Object.freeze({
  claude: {
    id:             'claude',
    name:           'Claude',
    url:            'https://claude.ai',
    hosts:          ['claude.ai'],
    userscriptFile: 'userscript-claude.js',
    color:          '#cc785c',
  },
  chatgpt: {
    id:             'chatgpt',
    name:           'ChatGPT',
    url:            'https://chatgpt.com',
    hosts:          ['chatgpt.com', 'chat.openai.com'],
    userscriptFile: 'userscript-chatgpt.js',
    color:          '#19c37d',
  },
  gemini: {
    id:             'gemini',
    name:           'Gemini',
    url:            'https://gemini.google.com',
    hosts:          ['gemini.google.com', 'aistudio.google.com'],
    userscriptFile: 'userscript-gemini.js',
    color:          '#4285f4',
  },
  perplexity: {
    id:             'perplexity',
    name:           'Perplexity',
    url:            'https://www.perplexity.ai',
    hosts:          ['www.perplexity.ai', 'perplexity.ai'],
    userscriptFile: 'userscript-perplexity.js',
    color:          '#20b2aa',
  },
  // §0.39.265 — James: "should we get deep seek working". guardian/userscript-
  // deepseek.js (NCP v10, same protocol as Perplexity's) and guardian's own
  // routing (provider-routing.js, dispatcher.js) were already there; this
  // registry was the one place that did not know it, so no provider tab could
  // ever host it and every deepseek job fell through to the local-Ollama path.
  deepseek: {
    id:             'deepseek',
    name:           'DeepSeek',
    url:            'https://chat.deepseek.com',
    hosts:          ['chat.deepseek.com'],
    userscriptFile: 'userscript-deepseek.js',
    color:          '#4d6bfe',
  },
});

// §0.39.265 — which provider tabs open when Clear Glass starts. ChatGPT and
// DeepSeek; the others open on their first real dispatch (guardian asks for
// them — James: "only have chatgpt open. the other 3 event driven", and
// DeepSeek "open in the background in clearglass").
const DEFAULT_AUTOSTART = Object.freeze({ claude: false, chatgpt: true, gemini: false, perplexity: false, deepseek: true });

/**
 * autoBootList(envValue, autoStartOnBoot) -> 'none' | 'all' | 'a,b,…'
 * CG_AUTOBOOT_PROVIDERS, when set at all (even to ''), wins outright. Otherwise
 * the Provider tabs page's "Start … with Clear Glass" toggles (NexusOptions
 * autoStartOnBoot), with DEFAULT_AUTOSTART for any provider never toggled.
 * Before this, main/index.js read only the env var, so those toggles did nothing.
 */
function autoBootList(envValue, autoStartOnBoot = {}) {
  if (envValue !== undefined && envValue !== null) return String(envValue).trim();
  const auto = autoStartOnBoot || {};
  // §GA1 — a person's toggle wins; then Guardian's autostart fact; then the old default
  const on = listProviders().filter(p => (auto[p.id] === undefined ? (p.autostart !== undefined ? !!p.autostart : !!DEFAULT_AUTOSTART[p.id]) : auto[p.id] === true)).map(p => p.id);
  return on.length ? on.join(',') : 'none';
}

function _cacheFile() { return path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', '..', '..', 'data'), 'clear-glass', 'providers-cache.json'); }

// the live table — one object, rebuilt in place, so every module that imported NCP_PROVIDERS sees a refresh
const NCP_PROVIDERS = {};
let _state = null;   // { providers, hash, from: 'guardian'|'seed', at, stale?, reason? }

function _apply(providers) {
  for (const k of Object.keys(NCP_PROVIDERS)) delete NCP_PROVIDERS[k];
  for (const p of providers) NCP_PROVIDERS[p.id] = { ...p };
}

/** _load() — the cache file if there is one (its stamp checked), else the stamped SEED */
function _load() {
  let c = null;
  try { c = JSON.parse(fs.readFileSync(_cacheFile(), 'utf8')); } catch (_) { c = null; }
  if (c && Array.isArray(c.providers) && c.providers.length) {
    const actual = H.hash(c.providers);
    const stale = actual !== c.hash;
    _state = { providers: c.providers.map(H.canonical), hash: c.hash, from: c.from || 'guardian', at: c.at || null,
      ...(stale ? { stale: true, reason: `the cache's content does not match its stamp (${String(c.hash).slice(0, 12)} stamped, ${actual.slice(0, 12)} now) — edited outside Guardian` } : {}) };
  } else {
    const seed = Object.values(SEED).map(H.canonical);
    _state = { providers: seed, hash: H.hash(seed), from: 'seed', at: null };
  }
  _apply(_state.providers);
  return _state;
}

/** verify() → { ok, from, hash, stale, reason } — a stale cache is a gap */
function verify() { const st = _state || _load(); return { ok: !st.stale, from: st.from, hash: st.hash, count: st.providers.length, ...(st.stale ? { stale: true, reason: st.reason } : {}) }; }

function _getJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve({ status: r.statusCode, json: JSON.parse(d) }); } catch (e) { resolve({ status: r.statusCode, error: `not JSON: ${e.message}` }); } }); });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: `no answer in ${timeoutMs}ms` }); });
  });
}

/**
 * refresh({ guardianUrl?, timeoutMs?, get?, emit? }) → { ok, changed, from, hash, error? }
 * Guardian's facts replace the cache when their hash differs. Unreachable → { ok:false, usingCache:true } and the
 * stamped cache (or seed) stays. A stale cache found at load is reported through emit('agent.cache.stale').
 */
async function refresh({ guardianUrl = process.env.GUARDIAN_URL || `http://127.0.0.1:${process.env.GUARDIAN_PORT || 7820}`, timeoutMs = 4000, get = _getJson, emit = null } = {}) {
  const before = _state || _load();
  if (before.stale && emit) { try { emit('agent.cache.stale', { reason: before.reason, hash: before.hash, file: _cacheFile() }); } catch (_) {} }
  const r = await get(`${guardianUrl}/api/providers`, timeoutMs);
  if (r.error || r.status !== 200 || !r.json || !r.json.ok || !Array.isArray(r.json.providers)) {
    return { ok: false, usingCache: true, from: before.from, hash: before.hash, error: `guardian's agent facts not read — ${r.error || (r.json && r.json.error) || `HTTP ${r.status}`}` };
  }
  const providers = r.json.providers.map(H.canonical);
  const h = H.hash(providers);
  if (r.json.hash && r.json.hash !== h) return { ok: false, usingCache: true, from: before.from, hash: before.hash, error: `guardian's facts do not match the hash it sent (${String(r.json.hash).slice(0, 12)} vs ${h.slice(0, 12)})` };
  if (h === before.hash && before.from === 'guardian' && !before.stale) return { ok: true, changed: false, from: 'guardian', hash: h };
  const cache = { providers, hash: h, from: 'guardian', at: Date.now() };
  try { fs.mkdirSync(path.dirname(_cacheFile()), { recursive: true }); fs.writeFileSync(_cacheFile(), JSON.stringify(cache, null, 2)); }
  catch (e) { return { ok: false, usingCache: true, from: before.from, hash: before.hash, error: `could not write the cache: ${e.message}` }; }
  _state = cache; _apply(providers);
  return { ok: true, changed: true, from: 'guardian', hash: h, count: providers.length };
}

function getProvider(id) {
  if (!_state) _load();
  const p = NCP_PROVIDERS[id];
  if (!p) throw new Error(`Unknown NCP provider: ${id}`);
  return p;
}

function listProviders() {
  if (!_state) _load();
  return Object.values(NCP_PROVIDERS);
}

_load();

module.exports = { NCP_PROVIDERS, SEED, getProvider, listProviders, DEFAULT_AUTOSTART, autoBootList, refresh, verify, _cacheFile, _reload: _load };
