'use strict';
/**
 * lib/vector-memory.js — NEXUS Vector Memory (SNR-Gated Semantic Search)
 * UUID: nexus-vector-memory-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Signal-to-noise engine for semantic memory retrieval.
 *
 * The pipeline:
 *
 *   WRITE:
 *     text → embed(Ollama: nomic-embed-text) → 768-dim vector
 *          → LocalIndex (file-backed, disk-persistent)
 *          → metadata stored: uuid, table, type, source, ts, text snippet
 *
 *   READ:
 *     query → embed → query vector
 *           → k-nearest search in LocalIndex
 *           → cosine similarity scoring (IS the SNR — 0.0 to 1.0)
 *           → SNR gate (similarity < threshold → filtered as noise)
 *           → ranked signal results
 *
 * SNR interpretation:
 *   > 0.90  almost identical meaning
 *   > 0.80  strongly related
 *   > 0.70  related (default threshold)
 *   > 0.65  loosely related
 *   < 0.65  noise — filtered out
 *
 * Embedding model: Ollama nomic-embed-text (768 dims, runs locally)
 * Fallback: TF-IDF approximation when Ollama unavailable (degrades gracefully)
 * Index:    vectra LocalIndex (file-backed, no new process, pure JS)
 *
 * What gets embedded:
 *   - event_log entries (type + payload text)
 *   - gaps (type + body + description)
 *   - artifacts (content snippet + intent)
 *   - ideas (text + tags)
 *   - bep_patterns (description + signature)
 *   - forge_patches (description + context)
 *
 * §1.1  Nothing trusted until proven — similarity scores are explicit
 * §1.2  Embedding failures logged, never silently dropped
 * §2.1  Index persisted to disk on every write
 * §5.1  Every indexed item carries its source UUID
 *
 * Usage:
 *   const vm = require('./lib/vector-memory');
 *   await vm.init();
 *   await vm.embed({ uuid, text, type, source, table });
 *   const results = await vm.search('rate limiting strategy', { k:5, threshold:0.72 });
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

const MODULE_ID = 'vector-memory';
const VERSION   = '1.0.0';

// ── Config ────────────────────────────────────────────────────────────────────
const INDEX_DIR      = process.env.NEXUS_VECTOR_INDEX_DIR || path.join(__dirname, '..', 'data', 'vector-index');   // 0.60.73: overridable, so a test never touches the real index
// 0.60.73 — the host Ollama really listens on: the same OLLAMA_HOST the bridge reads (ollama/config.js), not a hardcoded 127.0.0.1:11434.
// James, 2026-10-16: "good embedded check isnt working, need to fix that for good."
const OLLAMA_URL     = (() => { try { return require('../ollama/config.js').OLLAMA_HOST; } catch (_) { const raw = process.env.OLLAMA_HOST || '127.0.0.1:11434'; return raw.startsWith('http') ? raw : `http://${raw}`; } })();
const _OU            = new URL(OLLAMA_URL);
const _OHTTP         = _OU.protocol === 'https:' ? require('https') : http;
const _OPORT         = Number(_OU.port) || (_OU.protocol === 'https:' ? 443 : 80);
const RECHECK_MS     = 30_000;   // how often a down Ollama is looked at again (and a tf-idf item upgraded once it is back)
const PROBE_EMBED_MS = 30_000;   // a cold model load is slow; the probe waits for it instead of declaring Ollama dead
const EMBED_MODEL    = 'nomic-embed-text';
const EMBED_DIM      = 768;
const DEFAULT_THRESHOLD = 0.72;
const DEFAULT_K      = 10;
const MAX_TEXT_LEN   = 2000;  // truncate before embedding

// ── State ─────────────────────────────────────────────────────────────────────
let _index   = null;   // vectra LocalIndex
let _ready   = false;
let _ollamaOk = null;  // null=unknown, true=available, false=unavailable
let _ollamaWhy = null; // the reason it is not available, in words (null when it is)
let _ollamaCheckedAt = null;
let _embedQueue = [];  // backlog when Ollama is offline
let _stats   = { embedded: 0, searched: 0, noiseFiltered: 0, errors: 0 };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  fs.mkdirSync(INDEX_DIR, { recursive: true });

  try {
    // §23.14 — was a hard require('vectra') with no fallback; "Cannot find
    // module 'vectra'" took semantic search out entirely. Prefers real
    // vectra if it's actually installed (more optimized at large scale),
    // falls back to the dependency-free replacement otherwise — same
    // 6-method API, see lib/local-vector-index.js for why that's
    // sufficient at this system's actual scale.
    let LocalIndex, usingFallback = false;
    try {
      LocalIndex = require('vectra').LocalIndex;
    } catch (_) {
      LocalIndex = require('./local-vector-index').LocalIndex;
      usingFallback = true;
    }
    _index = new LocalIndex(INDEX_DIR);

    if (!await _index.isIndexCreated()) {
      await _index.createIndex({ version: 1 });
      console.log(`[${MODULE_ID}] index created at ${INDEX_DIR}${usingFallback ? ' (dependency-free fallback — vectra not installed)' : ''}`);
    } else {
      const stats = await _index.getIndexStats();
      console.log(`[${MODULE_ID}] index loaded — ${stats.items} items${usingFallback ? ' (dependency-free fallback — vectra not installed)' : ''}`);
    }

    _ready = true;
  } catch(e) {
    console.warn(`[${MODULE_ID}] index init failed: ${e.message}`);
    return false;
  }

  // Check Ollama availability
  _ollamaOk = await _checkOllama();
  console.log(`[${MODULE_ID}] v${VERSION} ready — ollama:${_ollamaOk?'✓':`✗ (TF-IDF fallback) — ${_ollamaWhy}`}`);

  // 0.60.73 — Ollama is looked at AGAIN on a timer, whatever the queue holds. Before this, only a non-empty queue ever re-checked, and the queue never filled
  // (the fallback vector is non-null), so one failed check at boot, or one 10 s timeout while the model was loading, kept semantic memory on TF-IDF until a restart.
  const t = setInterval(() => { _recheck().catch(e => console.warn(`[${MODULE_ID}] recheck failed: ${e.message}`)); }, RECHECK_MS); if (t.unref) t.unref();

  return true;
}

// ── Ollama embedding ──────────────────────────────────────────────────────────
// §0.39.267 — was _ollamaPost('/api/tags'). Ollama serves /api/tags on GET
// only; a POST gets a plain-text 404/405, JSON.parse throws, and this
// returned false with Ollama up. _embed() skips Ollama once _ollamaOk is
// false and TF-IDF vectors never queue, so _flushQueue never re-checked:
// every boot logged "ollama:✗" and semantic memory stayed on TF-IDF for good.
// Also requires the embed model to be pulled, so a missing nomic-embed-text
// reads as unavailable instead of failing on every embed.
async function _checkOllama() {
  const r = await _probeOllama(); _ollamaWhy = r.ok ? null : r.why; _ollamaCheckedAt = Date.now(); return r.ok;
}
// 0.60.73 — "is Ollama up and the model listed" is not "can it embed". Three steps, each with its own reason: reachable, model pulled, and a real one-word embed of the right size.
async function _probeOllama() {
  let tags; try { tags = await _getJson('/api/tags', 3000); } catch (e) { return { ok: false, why: `Ollama did not answer at ${OLLAMA_URL} (${e.message})` }; }
  const models = ((tags && tags.models) || []).map(m => m.name || m.model || '');
  if (!models.some(n => n === EMBED_MODEL || n.startsWith(EMBED_MODEL + ':'))) return { ok: false, why: `Ollama is up but ${EMBED_MODEL} is not pulled — run: ollama pull ${EMBED_MODEL}` };
  try {
    const r = await _ollamaPostRaw('/api/embeddings', { model: EMBED_MODEL, prompt: 'ping' }, PROBE_EMBED_MS);
    if (r && r.error) return { ok: false, why: `Ollama could not run ${EMBED_MODEL}: ${String(r.error).slice(0, 160)}` };
    if (!r || !Array.isArray(r.embedding) || !r.embedding.length) return { ok: false, why: `${EMBED_MODEL} answered with no embedding` };
    if (r.embedding.length !== EMBED_DIM) return { ok: false, why: `${EMBED_MODEL} returned ${r.embedding.length} dimensions, the index expects ${EMBED_DIM}` };
    return { ok: true };
  } catch (e) { return { ok: false, why: `${EMBED_MODEL} is listed but did not embed (${e.message}); when memory is short Ollama can fail to load it` }; }
}
function _getJson(p, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = _OHTTP.get({ hostname: _OU.hostname, port: _OPORT, path: p }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`)); try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(new Error('not JSON')); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); }); req.on('error', reject);
  });
}

// _embedKind(text) → { vector, kind } — kind is 'neural' (Ollama) or 'tfidf' (the fallback). The two are different spaces: never compared with each other (see search).
async function _embedKind(text) {
  const truncated = (text||'').slice(0, MAX_TEXT_LEN).trim();
  if (!truncated) return null;

  // Try Ollama first
  if (_ollamaOk !== false) {
    try {
      const r = await _ollamaPost('/api/embeddings', {
        model:  EMBED_MODEL,
        prompt: truncated,
      }, 20000);
      if (r?.embedding?.length === EMBED_DIM) {
        _ollamaOk = true; _ollamaWhy = null;
        return { vector: r.embedding, kind: 'neural' };
      }
      _ollamaOk = false; _ollamaWhy = r && r.error ? `Ollama could not run ${EMBED_MODEL}: ${String(r.error).slice(0, 160)}` : `${EMBED_MODEL} answered without a ${EMBED_DIM}-dimension embedding`;
    } catch(e) {
      _ollamaOk = false; _ollamaWhy = `Ollama embed failed (${e.message})`;
      console.warn(`[${MODULE_ID}] Ollama embed failed: ${e.message} — using TF-IDF fallback until the next check (${RECHECK_MS / 1000} s)`);
    }
  }

  // TF-IDF fallback: deterministic sparse approximation
  return { vector: _tfidfVector(truncated), kind: 'tfidf' };
}
async function _embed(text) { const r = await _embedKind(text); return r ? r.vector : null; }

// ── TF-IDF fallback vector (768-dim, deterministic) ───────────────────────────
// Not as good as neural embeddings but:
//   - Consistent: same text always produces same vector
//   - Meaningful: word frequency × inverse document weighting
//   - Fast: no network call
//   - Still catches exact and near-exact matches well
function _tfidfVector(text) {
  const tokens  = text.toLowerCase().match(/\b[a-z][a-z0-9]*\b/g) || [];
  const freq    = {};
  for (const t of tokens) freq[t] = (freq[t]||0)+1;

  const vec = new Array(EMBED_DIM).fill(0);
  for (const [word, count] of Object.entries(freq)) {
    // Hash word to multiple bucket positions (mimics random projection)
    const positions = _wordPositions(word, 6);
    const tfidf     = count / tokens.length * Math.log(1 + 1 / (count + 1));
    for (const pos of positions) {
      vec[pos] = (vec[pos] || 0) + tfidf * (pos % 2 === 0 ? 1 : -1);
    }
  }

  // L2 normalize
  const mag = Math.sqrt(vec.reduce((s,v) => s + v*v, 0));
  return mag > 0 ? vec.map(v => v/mag) : vec;
}

function _wordPositions(word, n) {
  const positions = [];
  let hash = 0;
  for (let i=0; i<word.length; i++) {
    hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
  }
  for (let i=0; i<n; i++) {
    hash = ((hash << 5) - hash + i*2654435761) | 0;
    positions.push(Math.abs(hash) % EMBED_DIM);
  }
  return positions;
}

// ── Write ─────────────────────────────────────────────────────────────────────
async function embed(item) {
  if (!_ready) return false;
  const { uuid, text, type, source, table, ts, metadata = {} } = item;
  if (!uuid || !text) return false;

  // Check if already indexed
  try {
    const existing = await _index.getItem(uuid);
    if (existing) return true; // already indexed
  } catch(_) {}

  const emb = await _embedKind(text); const vector = emb && emb.vector;

  if (!vector) {
    // Queue for later if Ollama is offline
    _embedQueue.push(item);
    if (_embedQueue.length > 500) _embedQueue.shift(); // cap queue
    _stats.errors++;
    return false;
  }

  try {
    await _index.insertItem({
      id:       uuid,
      vector,
      metadata: {
        uuid, text: text.slice(0, 200), type: type||'', source: source||'',
        table: table||'', ts: ts||Date.now(), vec: emb.kind, ...metadata,
      },
    });
    _stats.embedded++;
    return true;
  } catch(e) {
    // Item may already exist under a different ID
    _stats.errors++;
    return false;
  }
}

// Batch embed multiple items
async function embedBatch(items) {
  const results = [];
  for (const item of items) {
    results.push(await embed(item));
    // Yield to event loop between embeds
    await new Promise(r => setImmediate(r));
  }
  return results;
}

// ── Search — the SNR gate ─────────────────────────────────────────────────────
async function search(query, opts = {}) {
  if (!_ready) return { results: [], noise: 0, signal: 0, snr: 0 };

  const {
    k         = DEFAULT_K,
    threshold = DEFAULT_THRESHOLD,  // this IS the SNR threshold
    filter    = null,               // metadata filter: { table: 'gaps' } etc.
    explain   = false,              // include similarity scores in output
  } = opts;

  _stats.searched++;

  const qe = await _embedKind(query);
  if (!qe) return { results: [], noise: 0, signal: 0, snr: 0 };
  const queryVector = qe.vector; let otherKind = 0;

  try {
    // Get k*3 candidates, then apply SNR gate
    // 0.60.73 — a neural query is only compared with neural items, a tf-idf query with tf-idf items (they are different spaces; their cosine means nothing).
    // An item with no tag was written before this and is treated as neural, as it always was.
    const all = await _index.queryItems(queryVector, k * 6, filter || undefined);
    const candidates = all.filter(c => { const v = c.item && c.item.metadata && c.item.metadata.vec; if (v && v !== qe.kind) { otherKind++; return false; } return true; });

    const signal = [];
    let   noise  = 0;

    for (const item of candidates) {
      const similarity = item.score; // vectra returns cosine similarity as score

      if (similarity >= threshold) {
        signal.push({
          ...item.item.metadata,
          similarity,
          snr: similarity,  // similarity IS the SNR for this result
          signal: similarity >= 0.85 ? 'strong' : similarity >= 0.75 ? 'clear' : 'weak',
        });
      } else {
        noise++;
      }
    }

    _stats.noiseFiltered += noise;

    const snrRatio = candidates.length > 0
      ? (signal.length / candidates.length)
      : 0;

    return {
      results:   signal.slice(0, k),
      noise,
      signal:    signal.length,
      snr:       Math.round(snrRatio * 100) / 100,
      threshold,
      query:     query.slice(0, 100),
      kind:      qe.kind,
      ...(otherKind ? { skippedOtherKind: otherKind } : {}),
      ...(qe.kind === 'tfidf' ? { note: `Ollama is not available (${_ollamaWhy || 'not checked'}): this is a word-overlap match, not a semantic one` } : {}),
    };
  } catch(e) {
    _stats.errors++;
    return { results: [], noise: 0, signal: 0, snr: 0, error: e.message };
  }
}

// ── Context assembly — most relevant N items for a prompt ─────────────────────
// This is the high-value use case: instead of injecting last-N events,
// inject semantically relevant events. Signal over recency.
async function assembleContext(prompt, opts = {}) {
  const {
    k         = 8,
    threshold = 0.70,
    tables    = null,   // filter to specific tables: ['gaps', 'artifacts']
    maxTokens = 2000,   // approximate token budget
  } = opts;

  const filter = tables ? { table: { '$in': tables } } : null;
  const { results } = await search(prompt, { k, threshold, filter });

  if (!results.length) return { context: '', items: [], tokenEstimate: 0 };

  // Build context string, grouped by type
  const byType = {};
  for (const r of results) {
    const t = r.type || r.table || 'other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  let context = '';
  let tokenEst = 0;

  for (const [type, items] of Object.entries(byType)) {
    const header = `\n## ${type.replace(/_/g,' ').toUpperCase()} (${items.length} relevant)\n`;
    context += header;
    tokenEst += header.length / 4;

    for (const item of items) {
      if (tokenEst > maxTokens) break;
      const line = `[${item.signal||'?'} match ${Math.round((item.snr||0)*100)}%] ${item.text}\n`;
      context += line;
      tokenEst += line.length / 4;
    }
  }

  return {
    context: context.trim(),
    items:   results,
    tokenEstimate: Math.round(tokenEst),
    snr:     results.reduce((s,r) => s + (r.snr||0), 0) / results.length,
  };
}

// ── Queue flush ────────────────────────────────────────────────────────────────
async function _flushQueue() {
  if (!_embedQueue.length || _ollamaOk !== true) return;
  const batch = _embedQueue.splice(0, 20);
  for (const item of batch) await embed(item);
  if (_embedQueue.length) console.log(`[${MODULE_ID}] queue: ${_embedQueue.length} items remaining`);
}

// 0.60.73 — every RECHECK_MS: if Ollama is not known to be up, ask again (the real probe); once it is, turn the tf-idf items into real embeddings and flush the queue.
async function _recheck() {
  if (!_ready) return { checked: false };
  if (_ollamaOk !== true) {
    const was = _ollamaOk; _ollamaOk = await _checkOllama();
    if (_ollamaOk && was === false) console.log(`[${MODULE_ID}] Ollama is back — semantic embedding resumed, upgrading tf-idf items`);
  }
  let upgraded = 0; if (_ollamaOk === true) { upgraded = await _upgradeTfidf(20); await _flushQueue(); }
  return { checked: true, ollamaOk: _ollamaOk, why: _ollamaWhy, upgraded };
}

// An item stored while Ollama was down carries vec:'tfidf'. Re-embed it for real. Only its 200-character snippet is kept in the index, so the new vector comes from the snippet (vecFrom:'snippet'): said, not hidden.
async function _upgradeTfidf(max = 20) {
  if (!_index || typeof _index.listItems !== 'function' || typeof _index.deleteItem !== 'function') return 0;
  let todo; try { todo = (await _index.listItems()).filter(i => i.metadata && i.metadata.vec === 'tfidf').slice(0, max); } catch (_) { return 0; }
  let n = 0;
  for (const it of todo) {
    const e = await _embedKind(it.metadata.text || ''); if (!e || e.kind !== 'neural') break;   // Ollama went away again: stop, the next check resumes
    try { await _index.deleteItem(it.id); await _index.insertItem({ id: it.id, vector: e.vector, metadata: { ...it.metadata, vec: 'neural', vecFrom: 'snippet', upgradedAt: Date.now() } }); n++; } catch (_) { _stats.errors++; }
  }
  return n;
}

// ── JAA integration — auto-embed on insert ─────────────────────────────────────
// Call this from jaa-db.js to auto-embed meaningful table writes.
const EMBEDDABLE_TABLES = new Set([
  'event_log', 'gaps', 'artifacts', 'ideas', 'bep_patterns',
  'forge_patches', 'cortex_memory', 'seam_records',
]);
// §CHECKED, NOT ADDED 2026-09-02 — chat_log was the obvious next
// candidate (James named "chat logs" explicitly as a real context
// source), but checking its real writers first (§8.4) found it's
// ALREADY embedded: lib/chat-logger.js's own log() calls vm.embed()
// directly, with its own richer text extraction (role + intentExt +
// truncated content), immediately after every real cortex-routed
// chat_log insert. Adding chat_log here too would double-embed the
// same message through two different paths with two different text
// extractions and two different uuid schemes — a real bug, not
// coverage. Left out on purpose. guardian/server.js's own separate,
// SECOND chat_log writer (its own local JaaStore instance, physically
// separate from cortex's) is NOT covered by either path — a real,
// separate gap, not fixed here.

function shouldEmbed(table) { return EMBEDDABLE_TABLES.has(table); }

function extractText(table, row) {
  // Extract the most meaningful text from each table's schema
  switch(table) {
    case 'event_log':     return [row.type, row.payload ? JSON.stringify(row.payload).slice(0,200) : ''].filter(Boolean).join(' — ');
    case 'gaps':          return [row.type, row.body, row.description].filter(Boolean).join(' — ');
    case 'artifacts':     return [row.intent||row.name, row.content ? row.content.slice(0,500) : ''].filter(Boolean).join('\n');
    case 'ideas':         return [row.text, (row.tags||[]).join(' ')].filter(Boolean).join(' ');
    case 'bep_patterns':  return [row.description, row.signature].filter(Boolean).join(' — ');
    case 'forge_patches': return [row.description, row.context].filter(Boolean).join(' — ');
    case 'cortex_memory': return [row.key, row.value].filter(Boolean).join(': ');
    case 'seam_records':  return [row.intent, row.prompt ? row.prompt.slice(0,300) : ''].filter(Boolean).join(' — ');
    default:              return JSON.stringify(row).slice(0, 300);
  }
}

// Hook to call from jaa-db after insert
async function onJaaInsert(table, row) {
  if (!_ready || !shouldEmbed(table)) return;
  const text = extractText(table, row);
  if (!text || text.length < 10) return;
  // Fire-and-forget — don't block JAA writes
  embed({ uuid: row.uuid, text, type: row.type||table, source: row.source||table, table, ts: row.ts }).catch(()=>{});
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function _ollamaPost(path, body, timeoutMs = 10000) {
  // §0.39.266 — an embedding call loads a model too (nomic-embed-text): recorded like every other model call.
  // /api/tags is a health check, not a model call — not recorded.
  if (path !== '/api/tags') {
    const OA = require('./ollama-activity.js');
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      _ollamaPostRaw(path, body, timeoutMs).then(
        (v) => { OA.record({ caller: 'lib/vector-memory', op: path.replace('/api/', ''), model: body && body.model, promptChars: String((body && (body.prompt || body.input)) || '').length, ms: Date.now() - t0, ok: true }); resolve(v); },
        (e) => { OA.record({ caller: 'lib/vector-memory', op: path.replace('/api/', ''), model: body && body.model, ms: Date.now() - t0, ok: false, error: e.message }); reject(e); });
    });
  }
  return _ollamaPostRaw(path, body, timeoutMs);
}
function _ollamaPostRaw(path, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = _OHTTP.request({
      hostname: _OU.hostname, port: _OPORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── Stats + status ─────────────────────────────────────────────────────────────
async function status() {
  let indexStats = {};
  if (_ready && _index) {
    try { indexStats = await _index.getIndexStats(); } catch(_) {}
  }
  let vecCounts = null; try { if (_ready && _index && typeof _index.listItems === 'function') { vecCounts = { neural: 0, tfidf: 0, untagged: 0 }; for (const i of await _index.listItems()) { const v = i.metadata && i.metadata.vec; if (v === 'neural') vecCounts.neural++; else if (v === 'tfidf') vecCounts.tfidf++; else vecCounts.untagged++; } } } catch (_) {}
  return {
    ready:          _ready,
    ollamaOk:       _ollamaOk,
    ollamaWhy:      _ollamaWhy,            // why it is not available, in words (null when it is)
    ollamaCheckedAt: _ollamaCheckedAt,
    ollamaUrl:      OLLAMA_URL,
    vectors:        vecCounts,             // { neural, tfidf, untagged }: tfidf ones are upgraded by the next check once Ollama is back
    embedModel:     EMBED_MODEL,
    embeddingDim:   EMBED_DIM,
    indexPath:      INDEX_DIR,
    queueLength:    _embedQueue.length,
    defaultThreshold: DEFAULT_THRESHOLD,
    indexStats,
    stats:          { ..._stats },
  };
}

// ── Component registry embedding ────────────────────────────────────────────
// §ADDED 2026-09-02 — James: "component registry for synthesizing
// components." Real, distinct from onJaaInsert's per-row hook — a
// system's own registry-components.js is a static JS file, not a
// jaaDB table, so it has no insert() event to hook. This is a real,
// one-time (or periodically re-run) scan instead — confirmed all 14
// real registry-components.js files across the tree share the same
// exported shape ({systemId, components: [{id, description, tags,
// grammar}, ...]}) before writing this, not assumed uniform.
// §0.60.105 — 'eravos' out: ERAVOS was deleted in 0.60.83 (James: "Delete it outright."), and his 0.60.93 boot log said
// "[vector-memory] could not load eravos/registry-components.js" every start.
const REGISTRY_SYSTEMS = [
  'cortex', 'idearium', 'guardian', 'loom', 'ollama', 'intelligence',
  'clear-glass', 'emerge', 'versionium', 'architect',
  'copilot', 'nexus-healer',
];

async function embedComponentRegistries(opts = {}) {
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const systems = opts.systems || REGISTRY_SYSTEMS;
  let embedded = 0, failed = 0, skipped = 0;

  for (const sys of systems) {
    let registry;
    try {
      registry = require(path.join(ROOT, sys, 'registry-components.js'));
    } catch (e) {
      failed++;
      console.warn(`[${MODULE_ID}] could not load ${sys}/registry-components.js (non-fatal): ${e.message}`);
      continue;
    }
    const components = Array.isArray(registry.components) ? registry.components : [];
    for (const c of components) {
      if (!c || !c.id) { skipped++; continue; }
      const text = [c.description, (c.tags || []).join(' '), (c.grammar || []).join(' ')].filter(Boolean).join(' — ');
      if (!text || text.length < 5) { skipped++; continue; }
      try {
        await embed({ uuid: `component:${c.id}`, text, type: 'component', source: sys, table: 'component_registry', ts: Date.now() });
        embedded++;
      } catch (e) {
        failed++;
        console.warn(`[${MODULE_ID}] failed to embed component ${c.id} (non-fatal): ${e.message}`);
      }
    }
  }
  return { embedded, failed, skipped, systemsScanned: systems.length };
}

module.exports = {
  init, embed, embedBatch, search, assembleContext,
  onJaaInsert, shouldEmbed, extractText, status, recheck: _recheck,
  embedComponentRegistries, REGISTRY_SYSTEMS,
  EMBEDDABLE_TABLES, DEFAULT_THRESHOLD,
  MODULE_ID, VERSION,
};
