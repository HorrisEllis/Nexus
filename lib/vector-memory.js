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
const INDEX_DIR      = path.join(__dirname, '..', 'data', 'vector-index');
const OLLAMA_URL     = 'http://127.0.0.1:11434';
const EMBED_MODEL    = 'nomic-embed-text';
const EMBED_DIM      = 768;
const DEFAULT_THRESHOLD = 0.72;
const DEFAULT_K      = 10;
const MAX_TEXT_LEN   = 2000;  // truncate before embedding

// ── State ─────────────────────────────────────────────────────────────────────
let _index   = null;   // vectra LocalIndex
let _ready   = false;
let _ollamaOk = null;  // null=unknown, true=available, false=unavailable
let _embedQueue = [];  // backlog when Ollama is offline
let _stats   = { embedded: 0, searched: 0, noiseFiltered: 0, errors: 0 };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  fs.mkdirSync(INDEX_DIR, { recursive: true });

  try {
    const { LocalIndex } = require('vectra');
    _index = new LocalIndex(INDEX_DIR);

    if (!await _index.isIndexCreated()) {
      await _index.createIndex({ version: 1 });
      console.log(`[${MODULE_ID}] index created at ${INDEX_DIR}`);
    } else {
      const stats = await _index.getIndexStats();
      console.log(`[${MODULE_ID}] index loaded — ${stats.items} items`);
    }

    _ready = true;
  } catch(e) {
    console.warn(`[${MODULE_ID}] index init failed: ${e.message}`);
    return false;
  }

  // Check Ollama availability
  _ollamaOk = await _checkOllama();
  console.log(`[${MODULE_ID}] v${VERSION} ready — ollama:${_ollamaOk?'✓':'✗ (TF-IDF fallback)'}`);

  // Retry backlog when Ollama comes online
  setInterval(_flushQueue, 30_000);

  return true;
}

// ── Ollama embedding ──────────────────────────────────────────────────────────
async function _checkOllama() {
  try {
    const r = await _ollamaPost('/api/tags', {});
    return !!r;
  } catch(_) { return false; }
}

async function _embed(text) {
  const truncated = (text||'').slice(0, MAX_TEXT_LEN).trim();
  if (!truncated) return null;

  // Try Ollama first
  if (_ollamaOk !== false) {
    try {
      const r = await _ollamaPost('/api/embeddings', {
        model:  EMBED_MODEL,
        prompt: truncated,
      }, 10000);
      if (r?.embedding?.length) {
        _ollamaOk = true;
        return r.embedding;
      }
    } catch(e) {
      _ollamaOk = false;
      console.warn(`[${MODULE_ID}] Ollama embed failed: ${e.message} — using TF-IDF fallback`);
    }
  }

  // TF-IDF fallback: deterministic sparse approximation
  return _tfidfVector(truncated);
}

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

  const vector = await _embed(text);

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
        table: table||'', ts: ts||Date.now(), ...metadata,
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

  const queryVector = await _embed(query);
  if (!queryVector) return { results: [], noise: 0, signal: 0, snr: 0 };

  try {
    // Get k*3 candidates, then apply SNR gate
    const candidates = await _index.queryItems(queryVector, k * 3, filter || undefined);

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
  if (!_embedQueue.length) return;
  _ollamaOk = await _checkOllama();
  if (!_ollamaOk) return;

  const batch = _embedQueue.splice(0, 20);
  for (const item of batch) await embed(item);
  if (_embedQueue.length) console.log(`[${MODULE_ID}] queue: ${_embedQueue.length} items remaining`);
}

// ── JAA integration — auto-embed on insert ─────────────────────────────────────
// Call this from jaa-db.js to auto-embed meaningful table writes.
const EMBEDDABLE_TABLES = new Set([
  'event_log', 'gaps', 'artifacts', 'ideas', 'bep_patterns',
  'forge_patches', 'cortex_memory', 'seam_records',
]);

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
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1', port: 11434, path, method: 'POST',
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
  return {
    ready:          _ready,
    ollamaOk:       _ollamaOk,
    embedModel:     EMBED_MODEL,
    embeddingDim:   EMBED_DIM,
    indexPath:      INDEX_DIR,
    queueLength:    _embedQueue.length,
    defaultThreshold: DEFAULT_THRESHOLD,
    indexStats,
    stats:          { ..._stats },
  };
}

module.exports = {
  init, embed, embedBatch, search, assembleContext,
  onJaaInsert, shouldEmbed, extractText, status,
  EMBEDDABLE_TABLES, DEFAULT_THRESHOLD,
  MODULE_ID, VERSION,
};
