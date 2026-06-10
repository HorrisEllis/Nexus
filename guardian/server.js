'use strict';

const http       = require('http');
// NCP — NEXUS Channel Protocol (replaces WebSocket entirely)
// Zero external dependencies. SSE server→browser, fetch() browser→server.
// See lib/ncp.js for protocol spec.
const { createNCPServer }    = require('../lib/ncp');
const { createCFRLedger } = require('../lib/cfr/ledger');
const { Detector }          = require('./lib/detector');
const GapHunter             = require('./lib/gap-hunter');
const { SEAMQueue, STATE }  = require('./lib/seam-queue');
const { parseSpec, parseSpecFile, extractPrerequisite } = require('./lib/spec-parser');
const { createQueue }       = require('../lib/queue');
const { createBaseline }    = require('../lib/baseline');

// Per-kernel baseline monitor — establishes runtime baseline from first 20 events
// Sigma deviations → gap.found in JAA
const _baseline = createBaseline({
  name:           'guardian',
  ledgerDir:      require('path').join(__dirname, '../data/guardian/ledger'),
  failuresDir:    require('path').join(__dirname, '../data/guardian/failures'),
  invariantDir:   require('path').join(__dirname, '../data/guardian/invariant'),
  baselineN:      20,
  sigmaThreshold: 0.3,
  onGap: (gap) => {
    // Surface as JAA gap
    try {
      jaa.insert('gaps', {
        uuid: gap.uuid, type: 'baseline_deviation', path: 'guardian/baseline',
        body: `Guardian baseline deviation: sigma=${gap.sigma} frictions=${JSON.stringify(gap.frictions)}`,
        severity: gap.sigma > 0.7 ? 'high' : 'medium',
        status: 'open', source: 'guardian-baseline',
        causedBy: null, createdAt: Date.now(), attempts: 0, ts: Date.now(),
      });
    } catch(_) {}
    bus.emit('guardian.baseline.deviation', gap);
  },
});

// Guardian's physical queue — survives restarts
const _physQueue = createQueue({
  inputDir:    require('path').join(__dirname, '../data/guardian/input'),
  outputDir:   require('path').join(__dirname, '../data/guardian/output'),
  failuresDir: require('path').join(__dirname, '../data/guardian/failures'),
  logsDir:     require('path').join(__dirname, '../data/guardian/conversations'),
  queueDir:    require('path').join(__dirname, '../data/guardian/queue'),
});

// Replay any pending items from before restart (§LAW II physical redundancy)
const _replayed = _physQueue.replay();
if (_replayed.length) {
  console.log('[guardian] replayed', _replayed.length, 'interrupted queue items');
}

// ── Watch input/ folder — process .pending files as they arrive ───────────
// .spec files  → SEAMQueue dispatch
// .md/.txt     → simple job dispatch
// .json        → structured dispatch (prompt or spec field)
// File must exist before processing (§LAW II) — queue.watchInput atomically
// renames .pending → .processing before running
_physQueue.watchInput(async (data, filename) => {
  const parts    = filename.split('.');
  const ext      = parts[parts.length - 1];
  const queueUid = parts[0];

  // Spec files → SEAMQueue
  if (ext === 'spec') {
    const specText = typeof data === 'string' ? data :
      (data._raw || data.content || JSON.stringify(data));
    const provider = data._meta?.provider || data.provider || 'claude';
    console.log('[guardian queue] spec arrived:', filename.slice(0, 40));
    try {
      const { SEAMQueue } = require('./lib/seam-queue');
      const { parseSpec }  = require('./lib/spec-parser');
      const plan = parseSpec(specText, { maxChunkSize: 3500 });
      const queue = new SEAMQueue(queueUid, specText, {
        provider, plan, source: 'file-queue',
      });
      _activeQueues.set(queue.uuid, queue);
      if (ncp.isConnected(provider)) queue.start();
      else bus.emit('guardian.tab.needed', { provider, jobId: queueUid });
    } catch(e) {
      console.error('[guardian queue] spec dispatch failed:', e.message);
    }

  // Text/markdown → simple job
  } else if (ext === 'md' || ext === 'txt') {
    const raw     = typeof data === 'string' ? data : (data._raw || data.content || '');
    const prompt  = raw.replace(/^---[^]*?---\n/, '').trim();
    if (!prompt) return;
    const provider = 'claude';
    console.log('[guardian queue] text job arrived:', filename.slice(0, 40));
    const job = createJob(provider, 'queue', prompt);
    jobs.set(job.id, job);
    bus.emit('guardian.job.queued', { jobId: job.id, provider, filename });
    if (ncp.isConnected(provider)) dispatchJob(job);
    else bus.emit('guardian.tab.needed', { provider, url: null, jobId: job.id });

  // JSON → route by content
  } else if (ext === 'json') {
    const body     = typeof data === 'object' ? (data.data || data) : {};
    const provider = body.provider || 'claude';
    if (body.spec) {
      _physQueue.enqueue({ content: body.spec, ext: 'spec', provider,
        uuid: queueUid + '-s', source: 'queue-json' });
    } else if (body.prompt) {
      const job = createJob(provider, body.command || 'queue', body.prompt);
      jobs.set(job.id, job);
      if (ncp.isConnected(provider)) dispatchJob(job);
    }
  }
});

// Active SEAM queues — keyed by queueId
// §LAW II — queue state persisted to JAA, this is a performance index only
const _activeQueues = new Map();
const { randomUUID } = require('crypto');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execSync } = require('child_process');

// ── Optional deps ─────────────────────────────────────────────────────────────
let express, multer;
try { express = require('express'); multer = require('multer'); } catch (_) {}

// ── Jaa pure-JS store (zero native deps) ────────────────────────────────────────────
const { JaaStore } = require('./jaa-store.js');

// ── config ────────────────────────────────────────────────────────────────────

const HTTP_PORT     = process.env.GUARDIAN_HTTP_PORT  || 7820;
const ORCH_PORT     = process.env.ORCHESTRATOR_PORT   || 9000;

// nexus-connect: unified cross-system I/O with §1.2 gating
const nc = (() => { try { return require('../nexus-connect'); } catch(_) { return null; } })();
function _postLedger(system, type, payload) {
  if (nc) nc.postLedger(system, type, payload).catch(() => {});
}
function _postEvent(type, payload, opts) {
  if (nc) nc.postEvent(type, payload, opts).catch(() => {});
}
const DROPZONE_PORT = process.env.GUARDIAN_DROPZONE_PORT || 7822;
const NEXUS_URL     = process.env.NEXUS_URL || 'http://127.0.0.1:3748';

const DB_FILE   = path.join(__dirname, 'guardian.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// ── self-signed cert generation ───────────────────────────────────────────────


function generateCertWithNode() {
  // Use selfsigned npm package if available — throws if it can't generate.
  // Caller (ensureCert) catches and the WSS boot phase handles it.
  let selfsigned;
  try { selfsigned = require('selfsigned'); } catch(_) {
    throw new Error('selfsigned package not installed — run: npm install selfsigned');
  }
  const attrs = [{ name: 'commonName', value: '127.0.0.1' }];
  const opts  = {
    keySize: 2048, days: 825,
    extensions: [{ name: 'subjectAltName', altNames: [
      { type: 7, ip: '127.0.0.1' }, { type: 2, value: 'localhost' },
    ]}],
  };
  const pems = selfsigned.generate(attrs, opts);
  fs.writeFileSync(KEY_FILE,  pems.private);
  fs.writeFileSync(CERT_FILE, pems.cert);
  console.log('[guardian] TLS cert generated via selfsigned ✓');
}

// ── TLS cert is only needed for WSS (:7821, userscripts)
// The HTTP server (:7820) boots without it.
// ensureCert() is called lazily inside startWSS(), not at module scope.
let tlsOpts = null;


// ── provider registry ─────────────────────────────────────────────────────────


const PROVIDER_ALIASES = {
  'claude.ai':         'claude',
  'chat.openai.com':   'chatgpt',
  'chatgpt.com':       'chatgpt',
  'gemini.google.com': 'gemini',
  'localhost':         'ollama',
  '127.0.0.1':         'ollama',
};

// ── job store ─────────────────────────────────────────────────────────────────

const jobs = new Map();
const responseLog = [];
const LOG_MAX = 200;

function logResponse(entry) {
  responseLog.push({ ...entry, ts: Date.now() });
  if (responseLog.length > LOG_MAX) responseLog.shift();
}

// ── helpers ───────────────────────────────────────────────────────────────────

// send() — kept for any remaining legacy code; routes through NCP if provider present
function _legacySend(ws, obj) {  // legacy WebSocket send — not used by NCP path
  if (obj?.type && obj?.provider && ncp.isConnected(obj.provider)) {
    ncp.push(obj.provider, obj);
  }
  // If ws is a real ws socket (shouldn't happen now) try direct send
  try { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)); } catch(_) {}
}

function broadcast(obj) {
  ncp.broadcast(obj);
}

function normaliseProvider(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (PROVIDER_ALIASES[r]) return PROVIDER_ALIASES[r];
  if (PROVIDERS.hasOwnProperty(r)) return r;
  for (const key of Object.keys(PROVIDERS)) {
    if (r.includes(key)) return key;
  }
  return null;
}

function parseCommand(raw) {
  const str   = (raw || '').trim();
  const match = str.match(/^\/(\w+)\s+(\w[\w.-]*)\s*([\s\S]*)$/);
  if (!match) return null;
  const [, command, providerRaw, rest] = match;
  const provider = normaliseProvider(providerRaw);
  const prompt   = rest.trim().replace(/^["']|["']$/g, '');
  return { command: command.toLowerCase(), provider, prompt, raw: str };
}

// ── NEXUS write ───────────────────────────────────────────────────────────────

async function writeToNexus(job) {
  // §1.2: gated — failure is logged, never silent
  if (!nc) {
    console.warn('[guardian] nexus-connect not available — cortex write skipped');
    return;
  }
  const payload = {
    jobId: job.id, command: job.command, provider: job.provider,
    promptLen: (job.prompt||'').length, chars: (job.response||'').length,
    durationMs: Date.now() - job.ts, complete: true,
  };
  // §LAW II — event-ledger writes first (already done via bus.emit intercept)
  await nc.postEvent('guardian.response.received', payload, { causedBy: job.id, source: 'guardian' });
  await nc.postBridge('guardian.job.complete', payload);
  await nc.postLedger('guardian', 'guardian.job.complete', payload);
  // Write completed response to cortex_memory so Cortex recall can find it
  try {
    nc._req('cortex', 'POST', '/api/event', {
      type:    'guardian.job.complete',
      payload: { jobId: job.id, provider: job.provider,
        chars: (job.response||'').length,
        promptLen: (job.prompt||'').length,
        completedAt: Date.now(),
        // Store first 2000 chars of response for recall context
        responsePreview: (job.response||'').slice(0, 2000),
      },
      source:  'guardian',
      causedBy: job.id,
    }, 3000).catch(() => {});
  } catch(_) {}
}

// ── job lifecycle ─────────────────────────────────────────────────────────────

function createJob({ command, provider, prompt, content }) {
  const id  = randomUUID();
  const job = { id, command, provider, prompt, content: content || null,
    status: 'pending', response: '', ts: Date.now(), updatedAt: Date.now() };
  jobs.set(id, job);
  console.log(`[guardian] job created: ${id} → ${provider} /${command}`);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

// Jobs waiting for provider to connect
const pendingQueue = new Map(); // provider → job[]

function dispatchJob(job) {
  // NCP: push job via SSE channel instead of WebSocket
  if (!ncp.isConnected(job.provider)) {
    // Queue it — will flush when provider connects via GET /channel
    if (!pendingQueue.has(job.provider)) pendingQueue.set(job.provider, []);
    pendingQueue.get(job.provider).push(job);
    updateJob(job.id, { status: 'queued', queuedAt: Date.now(),
      queueReason: `waiting for ${job.provider} NCP channel` });
    console.log(`[guardian] queued ${job.id} — waiting for ${job.provider} userscript`);
    bus.emit('guardian.job.queued', { jobId: job.id, provider: job.provider });
    // Emit tab.needed — Forge cockpit SSE listeners will open the tab
    // CLI watcher will print the URL for the operator to open
    const provUrls = {
      claude:   'https://claude.ai/new',
      chatgpt:  'https://chatgpt.com/',
      ollama:   null,  // local — no tab needed
    };
    const url = provUrls[job.provider];
    if (url) {
      bus.emit('guardian.tab.needed', { provider: job.provider, url, jobId: job.id });
      // Broadcast to all connected SSE clients (Forge, nexus-chat) so they can open it
      cockpitBroadcast({ type: 'GUARDIAN_TAB_NEEDED', provider: job.provider, url, jobId: job.id });
      console.log(`[guardian] tab needed: ${url} — job ${job.id} will flush when connected`);
    }
    return false;
  }
  // Push via SSE — userscript's EventSource.onmessage receives it
  ncp.push(job.provider, {
    type: 'GUARDIAN_JOB', jobId: job.id, command: job.command,
    provider: job.provider, prompt: job.prompt, content: job.content,
  });
  updateJob(job.id, { status: 'delivered', deliveredAt: Date.now() });
  console.log(`[guardian] dispatched ${job.id} → ${job.provider} via NCP`);
  bus.emit('guardian.job.dispatched', { jobId: job.id, provider: job.provider });
  return true;
}

// ── NCP message handler — replaces wss.on('connection', ws.on('message')) ────
function _handleNCPMessage(msg) {
  const { type, jobId, provider, tabId, text, content, lang, hash,
          gaps, error, gate, chatUrl, account } = msg;

  // ── §5.2 Cortex write — every significant userscript event reaches cortex ──
  // Fire-and-forget: timeout 2s, never block the NCP response.
  function _toCortex(eventType, payload) {
    if (!nc) return;
    nc._req('cortex', 'POST', '/api/event', {
      type:     eventType,
      payload:  { ...payload, _provider: provider, _chatUrl: chatUrl, _account: account },
      source:   'guardian-ncp',
      causedBy: jobId || null,
      ts:       Date.now(),
    }, 2000).catch(() => {});
  }

  // Chunk accumulator — flush to cortex every 5 chunks or ≥500 chars
  // Avoids per-token writes while keeping cortex alive with stream data
  if (!_handleNCPMessage._buf)   _handleNCPMessage._buf   = {};
  if (!_handleNCPMessage._count) _handleNCPMessage._count = {};

  switch(type) {

    case 'GUARDIAN_REGISTER':
    case 'NCP_REGISTER': {
      // Provider registered via GET /channel — already handled by NCP onConnect
      // Just broadcast ready confirmation
      ncp.push(provider, { type: 'GUARDIAN_READY', provider, ts: Date.now() });
      bus.emit('guardian.provider.registered', { provider, tabId });
      break;
    }

    case 'GUARDIAN_DELIVERED':
    case 'NCP_DELIVERED': {
      if (jobId) {
        updateJob(jobId, { status: 'delivered_confirmed', confirmedAt: Date.now() });
        bus.emit('guardian.job.confirmed', { jobId, provider });
      }
      break;
    }

    case 'GUARDIAN_CHUNK':
    case 'NCP_CHUNK': {
      if (jobId && text) {
        const full = msg.full || null;
        updateJob(jobId, { status: 'streaming', lastChunk: Date.now() });
        bus.emit('guardian.job.chunk', { jobId, text, full, provider });
        cockpitBroadcast({ type: 'job.chunk', jobId, text, full, provider, ts: Date.now() });

        // ── Stream to cortex: batch before writing ────────────────────────
        _handleNCPMessage._buf[jobId]   = (_handleNCPMessage._buf[jobId]   || '') + text;
        _handleNCPMessage._count[jobId] = (_handleNCPMessage._count[jobId] || 0)  + 1;
        const bufLen   = _handleNCPMessage._buf[jobId].length;
        const chunkCnt = _handleNCPMessage._count[jobId];
        if (bufLen >= 500 || chunkCnt % 5 === 0) {
          const batch = _handleNCPMessage._buf[jobId];
          _handleNCPMessage._buf[jobId] = '';
          _toCortex('guardian.job.stream', {
            jobId, provider, text: batch.slice(0, 2000), chars: batch.length,
            chunkIndex: chunkCnt, fullLen: full ? full.length : bufLen,
          });
        }
      }
      break;
    }

    case 'GUARDIAN_COMPLETE':
    case 'NCP_COMPLETE': {
      if (jobId) {
        const finalText = text || content || '';
        const job = jobs.get(jobId);
        // Store response text on job so /response/:jobId can serve it
        if (job) { job.responseText = finalText.slice(0, 100000); job.status = 'complete'; }

        // Feed event to baseline monitor
        const latencyMs = job?.startedAt ? Date.now() - job.startedAt : 0;
        _baseline.observe({ type: 'GUARDIAN_COMPLETE', latencyMs, error: false, ts: Date.now() });

        // §LAW II — log conversation turn before artifact processing
        if (currentJobId || jobId) {
          const sessionId = chatId || chatUrl || jobId || 'unknown';
          _physQueue.logConversation(sessionId.slice(0, 40), {
            role:      'assistant',
            content:   (finalText || '').slice(0, 10000),
            jobId,
            provider:  provider || 'unknown',
            ts:        Date.now(),
          });
        }

        // §LAW II — write artifact files to disk before JAA insert
        // Chunks and synthesized output written as real files
        const codeBlocks = extractCodeBlocks(finalText, provider || 'ai');
        if (codeBlocks.length > 0) {
          const outDir = require('path').join(
            __dirname, '..', 'data', 'output',
            new Date().toISOString().slice(0, 10),
            jobId.slice(0, 8)
          );
          require('fs').mkdirSync(outDir, { recursive: true });
          for (const block of codeBlocks) {
            const filepath = require('path').join(outDir, block.filename);
            require('fs').writeFileSync(filepath, block.content, 'utf8');
          }
          bus.emit('guardian.artifacts.written', {
            jobId, outDir, count: codeBlocks.length,
            files: codeBlocks.map(b => b.filename),
          });
        }

        // Server-side gap analysis — §LAW II: write before acting
        const gaps = GapHunter.analyze(finalText);
        const gapDrift = GapHunter.drift(gaps);
        if (gaps.length > 0) {
          for (const g of gaps) {
            jaa.insert('gaps', { uuid: require('crypto').randomUUID(),
              jobId, provider, type: g.type, domain: g.domain,
              reason: g.reason, description: g.description,
              score: g.score, evidence: g.evidence, ts: Date.now() });
          }
          bus.emit('guardian.gaps', { jobId, gaps, drift: gapDrift, provider });
        }

        // Server-side detector — only if we have a SEAM chunk to compare against
        let detection = null;
        if (job?.seam_chunk_content) {
          const profile = Detector.profile(job.seam_chunk_content);
          detection = Detector.evaluate(finalText, job.seam_chunk_content, profile, job.axioms || []);
          bus.emit('guardian.detection', { jobId, ...detection });
        }

        updateJob(jobId, {
          status: 'complete', response: finalText, completedAt: Date.now(),
          gaps: gaps.length, gapDrift, detection,
        });
        jaa.insert('artifacts', {
          uuid: require('crypto').randomUUID(), jobId, provider: provider || 'unknown',
          content: finalText.slice(0, 10000), ts: Date.now(), chatUrl, account,
          gaps: gaps.length, gapDrift,
        });
        bus.emit('guardian.job.complete', { jobId, provider, chars: finalText.length,
          gaps: gaps.length, gapDrift });
        cockpitBroadcast({ type: 'job.complete', jobId, provider,
          chars: finalText.length, gaps: gaps.length, gapDrift, ts: Date.now() });

        // ── §2.1 Write full response + gaps + artifacts to cortex ─────────
        // Clear chunk buffer for this job
        delete _handleNCPMessage._buf[jobId];
        delete _handleNCPMessage._count[jobId];

        if (nc) {
          // 1. Full response to cortex (cortex_memory + agent_messages via WELL_KNOWN router)
          nc._req('cortex', 'POST', '/api/event', {
            type:    'guardian.job.complete',
            payload: {
              jobId, provider, chars: finalText.length,
              response:    finalText.slice(0, 8000),
              gaps:        gaps.length, gapDrift, detection: detection || null,
              chatUrl, account, completedAt: Date.now(),
            },
            source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
          }, 3000).catch(() => {});

          // 2. Each gap → cortex gaps table
          for (const g of gaps) {
            nc._req('cortex', 'POST', '/api/event', {
              type:    'cortex.gap.found',
              payload: {
                jobId, provider, type: g.type, domain: g.domain,
                reason: g.reason, description: g.description,
                score: g.score, evidence: g.evidence, source: 'guardian-gaphunter',
              },
              source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
            }, 1500).catch(() => {});
          }

          // 3. Each extracted code block → cortex artifacts table
          for (const block of codeBlocks.slice(0, 8)) {
            nc._req('cortex', 'POST', '/api/event', {
              type:    'guardian.artifact.extracted',
              payload: {
                jobId, provider, filename: block.filename,
                lang: block.lang || null, chars: (block.content || '').length,
                content: (block.content || '').slice(0, 4000), chatUrl,
              },
              source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
            }, 1500).catch(() => {});
          }
        }
      }
      break;
    }

    case 'GUARDIAN_ARTIFACT':
    case 'NCP_ARTIFACT': {
      if (jobId && content) {
        const artId = require('crypto').randomUUID();
        jaa.insert('artifacts', {
          uuid: artId, jobId, provider: provider || 'unknown',
          content: content.slice(0, 4000), lang: lang || 'text',
          hash, ts: Date.now(), chatUrl,
        });
        ncp.push(provider, { type: 'GUARDIAN_ARTIFACT_SAVED', jobId, artifactId: artId, ts: Date.now() });
        bus.emit('guardian.artifact', { jobId, artifactId: artId, provider });
        // Write to cortex artifacts table
        _toCortex('guardian.artifact', {
          jobId, artifactId: artId, lang: lang || 'text', hash,
          chars: (content || '').length, content: (content || '').slice(0, 4000), chatUrl,
        });
      }
      break;
    }

    case 'GUARDIAN_GAPS':
    case 'NCP_GAPS': {
      if (gaps?.length) {
        bus.emit('guardian.gaps', { jobId, gaps, provider });
        cockpitBroadcast({ type: 'job.gaps', jobId, gaps, ts: Date.now() });
        // Write each gap to cortex gaps table
        for (const g of gaps) {
          _toCortex('cortex.gap.found', {
            jobId, provider, type: g.type, domain: g.domain,
            reason: g.reason, description: g.description,
            score: g.score, source: 'userscript-detector',
          });
        }
      }
      break;
    }

    case 'GUARDIAN_ERROR':
    case 'NCP_ERROR': {
      if (jobId) {
        updateJob(jobId, { status: 'error', error, errorGate: gate, errorAt: Date.now() });
        bus.emit('guardian.job.error', { jobId, error, gate, provider });
        cockpitBroadcast({ type: 'job.error', jobId, error, ts: Date.now() });
      }
      break;
    }

    case 'GUARDIAN_LEDGER_WRITE': {
      // §LAW II — this is the ledger-as-source-of-truth write
      // Comes BEFORE action in the userscript. Write to JAA immediately.
      const entry = {
        uuid:     require('crypto').randomUUID(),
        jobId:    jobId || null,
        category: msg.category || 'EVENT',
        msg:      msg.msg || '',
        meta:     JSON.stringify(msg.meta || {}),
        provider: msg.meta?.provider || provider || 'unknown',
        chatUrl:  msg.meta?.chatUrl || chatUrl || '',
        ts:       msg.meta?.ts || Date.now(),
      };
      jaa.insert('ledger', entry);
      bus.emit('guardian.ledger.write', entry);
      _evLedger?.record('GUARDIAN_LEDGER_WRITE', entry, { source: 'userscript' });
      break;
    }

    case 'GUARDIAN_LEDGER_EVENT':
    case 'NCP_LEDGER': {
      jaa.insert('ledger', { uuid: require('crypto').randomUUID(),
        category: msg.level || 'EVENT', msg: msg.msg, meta: msg.meta,
        provider, chatUrl, account, ts: Date.now() });
      break;
    }

    case 'GUARDIAN_HEARTBEAT':
    case 'NCP_HEARTBEAT': {
      // Handled directly by ncp.handleHeartbeat() — ACK returned in response body
      break;
    }

    case 'GUARDIAN_CORTEX_RESULT': {
      // Cortex query result from userscript — store in job context
      if (jobId) {
        updateJob(jobId, { cortexResult: msg.result, cortexQuery: msg.query });
        bus.emit('guardian.cortex.result', { jobId, query: msg.query, result: msg.result, provider });
      }
      break;
    }

    case 'GUARDIAN_CLAIM_ACK': {
      // Tab acknowledged a claim request — update provider registry
      const key = `${provider}:${tabId}`;
      if (_activeQueues.size) bus.emit('guardian.tab.claimed', { provider, tabId });
      break;
    }

    case 'GUARDIAN_EVENT': {
      // Generic event from userscript — log to ledger
      if (msg.event) {
        bus.emit('guardian.tab.event', { provider, tabId, event: msg.event, data: msg.data });
      }
      break;
    }

    case 'GUARDIAN_SESSION_NAMED': {
      if (msg.chatId && msg.sessionName) {
        bus.emit('guardian.session.named', { chatId: msg.chatId, sessionName: msg.sessionName, provider });
        _toCortex('guardian.session.named', {
          chatId: msg.chatId, sessionName: msg.sessionName, provider,
        });
      }
      break;
    }

    default:
      // Unknown but don't spam the bus — log at debug level only
      if (type && !type.startsWith('GUARDIAN_LEDGER')) {
        console.log(`[guardian] unhandled message type: ${type} from ${provider}`);
      }
  }
}

function flushQueuedJobs(provider) {
  const queued = pendingQueue.get(provider) || [];
  if (!queued.length) return;
  pendingQueue.delete(provider);
  // Start any pending SEAM queues for this provider
  const seamItems = queued.filter(j => j._seamQueue);
  const jobItems  = queued.filter(j => !j._seamQueue);
  for (const item of seamItems) {
    _activeQueues.set(item._seamQueue.uuid, item._seamQueue);
    item._seamQueue.start();
  }
  // Re-add regular jobs
  if (jobItems.length) pendingQueue.set(provider, jobItems);
  const remaining = jobItems;
  console.log(`[guardian] flushing ${queued.length} queued jobs → ${provider}`);
  for (const job of queued) {
    const fresh = jobs.get(job.id);
    if (fresh && fresh.status === 'queued') dispatchJob(fresh);
  }
}

// ── artifact helpers ──────────────────────────────────────────────────────────

const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
  markdown: 'md', md: 'md', bash: 'sh', shell: 'sh', sh: 'sh',
  rust: 'rs', go: 'go', cpp: 'cpp', c: 'c', java: 'java',
  yaml: 'yaml', toml: 'toml', sql: 'sql', graphql: 'graphql',
  jsx: 'jsx', tsx: 'tsx', svelte: 'svelte', vue: 'vue',
};

function extractCodeBlocks(text, provider = 'ai') {
  const blocks = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    const lang    = (m[1] || '').toLowerCase();
    const content = m[2].trimEnd();
    if (!content.trim()) continue;
    const ext      = LANG_EXT[lang] || lang || 'txt';
    const ts       = Date.now();
    const filename = `${provider}-${ts}-${++n}.${ext}`;
    blocks.push({ filename, content, lang, ext });
  }
  return blocks;
}

function autoUploadBlocks(text, provider, jobId) {
  if (!dropzone?.autoUpload) return [];
  const blocks  = extractCodeBlocks(text, provider);
  const results = [];
  for (const b of blocks) {
    // v9: pass lang + jobId so spec-namer gets full context
    const r = dropzone.autoUpload(b.filename, b.content, {
      lang: b.lang, jobId, provider, source: 'auto-block',
    });
    if (r) results.push({ ...r, lang: b.lang, jobId });
  }
  if (results.length) {
    console.log(`[guardian] auto-uploaded ${results.length} code block(s) from job ${jobId}`);
  }
  return results;
}

// ── WSS server (userscripts) ──────────────────────────────────────────────────

// ── NCP server — replaces httpsServer + wss entirely ────────────────────────
// Providers (browser tabs with userscripts) connect via SSE GET /channel
// and send results via fetch() POST /result. No ws package. No TLS required.
const ncp = createNCPServer({
  onMessage: (msg) => _handleNCPMessage(msg),
  onConnect: ({ provider, tabId }) => {
    console.log(`[guardian] NCP connected: provider=${provider} tab=${tabId}`);
    bus.emit('guardian.provider.connected', { provider, tabId });
    flushQueuedJobs(provider);
  },
  onDisconnect: ({ provider, tabId }) => {
    console.log(`[guardian] NCP disconnected: provider=${provider} tab=${tabId}`);
    bus.emit('guardian.provider.disconnected', { provider, tabId });
  },
  busEmit: (type, data) => bus.emit(type, data),
});

// Compatibility shims — code that used PROVIDERS[x] now uses ncp.isConnected(x)
const PROVIDERS = new Proxy({}, {
  get: (_, provider) => ncp.isConnected(provider) ? { _ncp: true } : null,
  set: () => true,  // ignore direct sets — NCP manages connections
});

// httpsServer + wss → null (no longer needed)
let httpsServer = null;
let wss         = null;  // kept for module.exports compatibility
function onWss() {}      // no-op shim — WSS replaced by NCP; calls are harmless
function startWSS() { return { ok: true, note: 'WSS replaced by NCP' }; }





// ── WSS boot happens inside the HTTP server's boot sequence (SOFT) ──────────
// See server.listen(HTTP_PORT) callback below — startWSS() is called there.



// ── Main HTTP server (:7820) ─────────────────────────────────────────────────
const server = require('http').createServer();

const _lip = (() => {
  try {
    const ifaces = require('os').networkInterfaces();
    for (const [,addrs] of Object.entries(ifaces)) {
      for (const a of addrs) { if (a.family==='IPv4' && !a.internal) return a.address; }
    }
  } catch(_) {}
  return null;
})();

// ── _selfProbe — used by boot phases (module-level) ─────────────────────────
async function _selfProbe(path_) {
  return new Promise(resolve => {
    const req = require('http').get('http://127.0.0.1:' + HTTP_PORT + path_, { timeout:3000 }, res => {
      let b=''; res.on('data', d=>b+=d); res.on('end', ()=>{
        try { resolve({ ok:res.statusCode===200, data:JSON.parse(b) }); }
        catch { resolve({ ok:res.statusCode===200 }); }
      });
    });
    req.on('error',   () => resolve({ ok:false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok:false }); });
  });
}

server.listen(HTTP_PORT, '127.0.0.1', async () => {
  const { BootSequence } = require('../lib/boot-sequence');
  const nc2 = require('../nexus-connect');

  const seq = new BootSequence({
    systemId: 'guardian', port: HTTP_PORT, version: '3.5.0',
    label: 'Nexus Guardian', maxRetries: 1,
  });


  // ── PHASE 1: No external npm deps ──────────────────────────────────────────
  seq.phase({ name:'packages.required', type:'HARD',
    label:'Zero external dependencies (NCP/SSE — no npm packages needed)',
    fn: async () => {
      try { require('http'); require('fs'); require('path'); require('crypto'); } catch(e) { return { ok:false, msg:e.message }; }
      console.log('[guardian NCP] userscript: new EventSource("http://127.0.0.1:' + HTTP_PORT + '/channel?provider=claude&tabId=X")');
      return { ok: true };
    }
  });

  // ── PHASE 2: HTTP server bound ────────────────────────────────────────────
  seq.phase({ name:'http.bound', type:'HARD',
    label:'HTTP :' + HTTP_PORT + ' bound and /health responds',
    fn: async () => {
      const r = await _selfProbe('/health');
      if (!r.ok) return { ok:false, msg:'HTTP :' + HTTP_PORT + ' not responding' };
      return { ok: true };
    }
  });

  // ── PHASE 3: Interaction contract ────────────────────────────────────────
  seq.phase({ name:'contract.present', type:'HARD',
    label:'interaction-contract.json present',
    fn: async () => {
      const cp = require('path').join(__dirname, 'interaction-contract.json');
      if (!require('fs').existsSync(cp)) return { ok:false, msg:'interaction-contract.json missing' };
      try { JSON.parse(require('fs').readFileSync(cp,'utf8')); } catch(e) { return { ok:false, msg:'contract invalid: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 4: JAA memory store writable ───────────────────────────────────
  seq.phase({ name:'jaa.writable', type:'HARD',
    label:'JAA memory store open + writable (§LAW II)',
    fn: async () => {
      try {
        const testKey = '_boot_' + Date.now();
        jaa.setSetting(testKey, '1');
        const v = jaa.getSetting(testKey);
        if (v === null || v === undefined) return { ok:false, msg:'JAA write/read failed' };
        return { ok: true };
      } catch(e) { return { ok:false, msg:'JAA: '+e.message }; }
    }
  });

  // ── PHASE 5: Physical queue writable ─────────────────────────────────────
  seq.phase({ name:'queue.writable', type:'HARD',
    label:'Physical queue dirs writable (data/guardian/)',
    fn: async () => {
      const fs   = require('fs');
      const rp   = require('path');
      const dirs = ['input','output','queue','failures','conversations']
        .map(d => rp.join(__dirname,'..','data','guardian',d));
      for (const d of dirs) {
        try { fs.mkdirSync(d,{recursive:true}); } catch(e) { return { ok:false, msg:d.split('/').pop()+' not writable: '+e.message }; }
      }
      const t = rp.join(dirs[0],'_boot_test.tmp');
      try { fs.writeFileSync(t,'ok'); fs.unlinkSync(t); } catch(e) { return { ok:false, msg:'input dir not writable: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 6: Core modules load ───────────────────────────────────────────
  seq.phase({ name:'modules.load', type:'HARD',
    label:'Core modules load (seam-queue, spec-parser, detector)',
    fn: async () => {
      const errors = [];
      for (const m of ['./lib/seam-queue','./lib/spec-parser','./lib/detector']) {
        try { require(m); } catch(e) { errors.push(m.split('/').pop()+': '+e.message); }
      }
      if (errors.length) return { ok:false, msg: errors.join(' | ') };
      return { ok: true };
    }
  });

  // ── PHASE 7: NCP channel ─────────────────────────────────────────────────
  seq.phase({ name:'ncp.ready', type:'SOFT',
    label:'NCP channel :' + HTTP_PORT + '/channel (no TLS needed)',
    fn: async () => {
      const r = await _selfProbe('/providers');
      if (!r.ok) return { ok:false, msg:'/providers not responding' };
      return { ok: true };
    }
  });

  // ── PHASE 8: Artifact output writable ────────────────────────────────────
  seq.phase({ name:'artifacts.writable', type:'SOFT',
    label:'Artifact output path writable',
    fn: async () => {
      const fs  = require('fs');
      const rp  = require('path');
      const dir = rp.join(__dirname,'..','data','guardian','output');
      try { fs.mkdirSync(dir,{recursive:true}); const t=rp.join(dir,'_boot.tmp'); fs.writeFileSync(t,'ok'); fs.unlinkSync(t); }
      catch(e) { return { ok:false, msg:'output dir: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 9: Userscript version check ────────────────────────────────────
  seq.phase({ name:'userscript.versions', type:'SOFT',
    label:'Userscript versions present',
    fn: async () => {
      const fs  = require('fs');
      const rp  = require('path');
      const readVer = f => { try { const c=fs.readFileSync(rp.join(__dirname,f),'utf8'); const m=c.match(/@version\s+([\d.]+)/); return m?m[1]:null; } catch { return null; } };
      const cv = readVer('userscript-claude.js'), gv = readVer('userscript-chatgpt.js');
      if (!cv) return { ok:false, msg:'userscript-claude.js: @version missing' };
      if (!gv) return { ok:false, msg:'userscript-chatgpt.js: @version missing' };
      console.log('[guardian versions] claude=' + cv + ' chatgpt=' + gv);
      return { ok: true };
    }
  });

  // ── PHASE 10: Register with orchestrator ─────────────────────────────────
  seq.phase({ name:'orchestrator.register', type:'SOFT',
    label:'Register with orchestrator (§AXIOM)',
    fn: async () => {
      const r = await nc2.registerWithOrchestrator('guardian', HTTP_PORT);
      if (!r || !r.ok) return { ok:true, msg:'standalone — orchestrator offline' };
      return { ok: true };
    }
  });

  // ── PHASE 11: Write boot record to ledger ────────────────────────────────
  seq.phase({ name:'ledger.announce', type:'SOFT',
    label:'Write boot record to ledger (§LAW II)',
    fn: async () => {
      try {
        const fs  = require('fs'), rp = require('path');
        const dir = rp.join(__dirname,'..','data','guardian','ledger','boot');
        fs.mkdirSync(dir,{recursive:true});
        fs.appendFileSync(rp.join(dir,'events.ndjson'),
          JSON.stringify({type:'guardian.boot',version:'3.5.0',pid:process.pid,ts:Date.now()})+'\n');
        await nc2.postLedger('guardian.boot', { version:'3.5.0', pid:process.pid });
        return { ok: true };
      } catch(e) { return { ok:false, msg:e.message }; }
    }
  });

  // ── PHASE 12: Bridge handshake ───────────────────────────────────────────
  const upload = multer({ storage, limits: { fileSize: cfg.maxFileSizeMB * 1024 * 1024 } });

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Guardian-Source,X-Guardian-Lang,X-Guardian-Job,X-Spec-Name,X-Spec-Lang,X-Spec-Version,X-Is-Spec,X-Ttl,X-Guardian-Account,X-Guardian-Chat');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    next();
  });

  // Root — DROP ZONE UI
  app.get('/', (req, res) => res.send(buildDropzoneHTML(cfg)));

  // ── SPEC endpoint — paste a spec directly ─────────────────────────────────
  app.post('/api/spec', express.text({ limit: '50mb', type: '*/*' }), (req, res) => {
    try {
      const content = req.body;
      if (!content || content.trim().length < 3)
        return res.status(400).json({ ok: false, error: 'Empty spec content' });

      const name    = req.headers['x-spec-name']    || req.query.name    || null;
      const version = req.headers['x-spec-version'] || req.query.version || '1.0.0';
      const lang    = req.headers['x-spec-lang']    || req.query.lang    || null;
      const account = req.headers['x-guardian-account'] || null;
      const chatId  = req.headers['x-guardian-chat']    || null;
      const jobId   = req.headers['x-guardian-job']     || null;

      let result;
      if (registry) {
        result = registry.storeSpec(content, {
          name, lang, version, account, chatId, jobId,
          port: cfg.port, ttl: cfg.maxTTL,
          tags: ['spec', ...(lang ? [lang] : [])],
          meta: { version, uploadedVia: 'spec-api' },
        });
      } else {
        const inferred = inferSpecFilename
          ? inferSpecFilename(content, { name, lang })
          : { filename: `spec-${Date.now()}.md` };
        const buf   = Buffer.from(content, 'utf8');
        const token = require('crypto').randomBytes(6).toString('hex');
        const filepath = path.join(uploadDir, `${token}__${inferred.filename}`);
        fs.writeFileSync(filepath, buf);
        result = { token, url: `http://127.0.0.1:${cfg.port}/d/${token}`, filename: inferred.filename, size: buf.length };
      }

      if (!result) return res.status(500).json({ ok: false, error: 'Store failed' });
      console.log(`[dropzone] spec stored: ${result.filename} (${result.size}B)`);
      res.json({ ok: true, ...result, ttl: cfg.maxTTL, expiresAt: Date.now() + cfg.maxTTL * 1000 });
    } catch (err) {
      console.error(`[dropzone] /api/spec error: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── PASTE endpoint — code/text with content-based naming ─────────────────
  app.post('/api/paste', express.text({ limit: '50mb', type: '*/*' }), (req, res) => {
    try {
      const content = req.body;
      if (!content || !content.trim())
        return res.status(400).json({ ok: false, error: 'Empty content' });

      const lang    = req.headers['x-guardian-lang'] || req.query.lang || null;
      const name    = req.headers['x-guardian-name'] || req.query.name || null;
      const ttl     = Math.min(parseInt(req.query.ttl || req.headers['x-ttl'] || cfg.defaultTTL), cfg.maxTTL);
      const account = req.headers['x-guardian-account'] || null;
      const chatId  = req.headers['x-guardian-chat']    || null;
      const jobId   = req.headers['x-guardian-job']     || null;
      const isSpec  = req.query.spec === 'true' || req.headers['x-is-spec'] === 'true';

      let result;
      if (registry) {
        result = registry.autoUpload(name || 'paste', content, {
          name, lang, ttl, account, chatId, jobId, isSpec,
          port: cfg.port, source: 'paste-api',
          tags: [...(lang ? [lang] : []), ...(isSpec ? ['spec'] : [])],
        });
      } else {
        const inferred = inferFilename
          ? inferFilename(content, { name, lang })
          : { filename: 'paste.txt' };
        const buf = Buffer.from(content, 'utf8');
        const token = require('crypto').randomBytes(6).toString('hex');
        const filepath = path.join(uploadDir, `${token}__${inferred.filename}`);
        fs.writeFileSync(filepath, buf);
        result = { token, url: `http://127.0.0.1:${cfg.port}/d/${token}`, filename: inferred.filename, size: buf.length };
      }

      if (!result) return res.status(500).json({ ok: false, error: 'Store failed' });
      res.json({ ok: true, ...result, expiresAt: Date.now() + ttl * 1000 });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Standard upload — with post-write content inference ───────────────────
  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file.');
    const ttl     = Math.min(Math.max(parseInt(req.body.ttl) || cfg.defaultTTL, 60), cfg.maxTTL);
    const token   = req._dzToken || path.basename(req.file.filename).split('__')[0];
    const lang    = req.body.lang    || req.headers['x-guardian-lang'] || null;
    const isSpec  = req.body.isSpec === 'true';
    const account = req.body.account || null;
    const chatId  = req.body.chatId  || null;
    const jobId   = req.body.jobId   || null;

    let finalFilename = req.file.originalname;
    try {
      if (inferFilename && req.file.size < 5 * 1024 * 1024) {
        const content  = fs.readFileSync(req.file.path, 'utf8');
        const inferred = inferFilename(content, {
          name: req.file.originalname.replace(/\.[^.]+$/, ''),
          lang, isSpec,
        });
        finalFilename = inferred.filename;
        const newPath = path.join(uploadDir, `${token}__${finalFilename}`);
        if (newPath !== req.file.path) {
          fs.renameSync(req.file.path, newPath);
          req.file.path = newPath;
        }
      }
    } catch (_) { /* binary — keep original name */ }

    let entry;
    if (registry) {
      entry = registry.register({
        token, filename: finalFilename, filepath: req.file.path,
        size: req.file.size, ttl, lang, account, chatId, jobId,
        source: 'upload', tags: isSpec ? ['spec'] : [],
      });
    } else {
      entry = { expiresAt: Date.now() + ttl * 1000 };
    }

    console.log(`[dropzone] upload: ${finalFilename} (${fmtSize(req.file.size)}) token:${token}`);
    res.json({ token, filename: finalFilename, size: req.file.size, expiresAt: entry.expiresAt });
  });

  // ── Download ──────────────────────────────────────────────────────────────
  app.get('/d/:token', (req, res) => {
    const entry = registry ? registry.get(req.params.token) : null;
    if (!entry) return res.status(404).send('Not found or expired.');
    registry.recordDownload(req.params.token);
    res.download(entry.filepath, entry.filename);
  });

  // ── File list ─────────────────────────────────────────────────────────────
  app.get('/api/files', (req, res) => {
    const list = registry ? registry.list({
      category: req.query.category || null,
      lang:     req.query.lang     || null,
      search:   req.query.q        || null,
      account:  req.query.account  || null,
      tag:      req.query.tag      || null,
    }) : [];
    res.json(list.map(f => ({
      token: f.token, filename: f.filename, size: f.size,
      expiresAt: f.expiresAt, downloads: f.downloads, ttl: f.ttl,
      ext: f.ext, lang: f.lang, category: f.category, tags: f.tags,
      purpose: f.purpose, uploadedAt: f.uploadedAt,
    })));
  });

  // ── File by token ─────────────────────────────────────────────────────────
  app.get('/api/files/:token', (req, res) => {
    const entry = registry ? registry.get(req.params.token) : null;
    if (!entry) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, file: entry });
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete('/api/files/:token', (req, res) => {
    res.json({ ok: registry ? registry.delete(req.params.token) : false });
  });

  // ── Extend TTL ────────────────────────────────────────────────────────────
  app.patch('/api/files/:token/ttl', express.json(), (req, res) => {
    const entry = registry ? registry.extendTTL(req.params.token, parseInt(req.body.addSeconds || 3600)) : null;
    if (!entry) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, expiresAt: entry.expiresAt, ttl: entry.ttl });
  });

  // ── Add tag ───────────────────────────────────────────────────────────────
  app.post('/api/files/:token/tags', express.json(), (req, res) => {
    const entry = registry ? registry.addTag(req.params.token, req.body.tag) : null;
    if (!entry) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, tags: entry.tags });
  });

  // ── Specs list ────────────────────────────────────────────────────────────
  app.get('/api/specs', (req, res) => {
    res.json({ ok: true, specs: registry ? registry.list({ tag: 'spec' }) : [] });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get('/api/stats', (req, res) => {
    res.json({ ok: true, stats: registry ? registry.stats() : {} });
  });

  // ── Info ──────────────────────────────────────────────────────────────────
  app.get('/api/info', (req, res) => {
    res.json({
      port: cfg.port, ips: getLocalIPs(), serverName: cfg.serverName,
      persistent: !!registry, version: 'v9',
      maxFileSizeMB: cfg.maxFileSizeMB, maxTTL: cfg.maxTTL,
    });
  });

  const dzServer = app.listen(cfg.port, cfg.host, () => {
    const ips = getLocalIPs();
    console.log(`[dropzone] UI on http://127.0.0.1:${cfg.port}`);
    ips.forEach(ip => console.log(`[dropzone] LAN: http://${ip.address}:${cfg.port}  (${ip.name})`));
    console.log(`[dropzone] Upload dir: ${uploadDir}`);
    console.log(`[dropzone] Persistent registry: ${registry ? 'YES ✓' : 'NO (fallback)'}`);
  });

  dzServer.on('error', err => console.error(`[dropzone] ERROR: ${err.message}`));

  // ── Internal auto-upload — persistent + spec-namer ────────────────────────
  function autoUpload(filename, content, opts = {}) {
    if (typeof opts === 'number') opts = { ttl: opts };
    const ttl = Math.min(opts.ttl || cfg.defaultTTL, cfg.maxTTL);
    if (registry) {
      return registry.autoUpload(filename, content, { ...opts, ttl, port: cfg.port });
    }
    // Pure fallback
    try {
      const buf      = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
      const token    = require('crypto').randomBytes(6).toString('hex');
      const safe     = sanitizeFilename(filename);
      const filepath = path.join(uploadDir, `${token}__${safe}`);
      fs.writeFileSync(filepath, buf);
      const url = `http://127.0.0.1:${cfg.port}/d/${token}`;
      return { token, url, filename: safe, size: buf.length };
    } catch (err) {
      console.error(`[dropzone] autoUpload fallback failed: ${err.message}`);
      return null;
    }
  }

  return { server: dzServer, autoUpload, registry };
}

const dropzone = startDropzone();
const dropzoneServer = dropzone ? dropzone.server : null;

// ══════════════════════════════════════════════════════════════════════════════
//  SISO EVENT BUS — §8.3 canonical SISO as foundation
//  Every emit() gates through: local JAA → cortex → orchestrator
//  §5.7 all inter-module communication via event bus only
//  §2.3 all state observable — every event logged to StreamLog
// ══════════════════════════════════════════════════════════════════════════════

// §8.3 — canonical SISO loaded from foundation
// CJS-compatible wrapper around siso/core/index.js primitives
class SISOGate {
  constructor(sig, fn) {
    if (!sig) throw new Error('[§1.2 SISOGate] signature required');
    this.signature = sig;
    this._fn = fn;
  }
  transform(event, stream) {
    try { this._fn(event.data, stream); }
    catch(e) {
      // §1.2 — nothing silently fails
      console.error(`[§1.2 siso.gate.${this.signature}] ${e.message}`);
      _postEvent(`guardian.gate.error`, { gate: this.signature, error: e.message });
    }
  }
}

// §2.3 — StreamLog: all state observable
const _sisoLog = [];
let _streamSeq = 0;
const _LOG_MAX  = 2000;

// Canonical bus — §5.7 single event bus, all communication through it
class SISOStream {
  constructor() {
    this.gates    = new Map();
    this.logLevel = 'EVENTS'; // OFF | EVENTS | DEEP | DATA
  }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[§1.2 SISOStream] Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
  }
  emit(type, data = {}) {
    const seq   = _streamSeq++;
    const ts    = Date.now();
    const gate  = this.gates.get(type);
    const claimed = gate ? gate.signature : null;

    // §2.3 — log every event (StreamLog pattern from canonical SISO)
    if (this.logLevel !== 'OFF') {
      const entry = { seq, ts, type, claimed };
      if (this.logLevel === 'DATA') entry.data = data;
      _sisoLog.push(entry);
      if (_sisoLog.length > _LOG_MAX) _sisoLog.shift();
    }

    // §5.7 — fire registered gate (depth-first, synchronous)
    if (gate) gate.transform({ type, data }, this);

    // §2.3 — broadcast to cockpit SSE (observable by UI)
    cockpitBroadcast({ seq, type, ts, claimed });

    // §5.2 — kernel connection: every event flows to orchestrator + cortex
    // Only emit externally for system-significant events (not every UI tick)
    if (!type.startsWith('dom.') && !type.startsWith('guardian.heartbeat')) {
      _kernelEmit(type, data, ts);
    }

    return { seq, ts, claimed };
  }
  // §2.3 — sample the log (observable, not consumed)
  sample(n = 100) {
    return { logLevel: this.logLevel, count: _sisoLog.length, entries: _sisoLog.slice(-n) };
  }
}

// §5.1 — kernel emit: every bus event reported to all connected systems
// Fires-and-forgets — §1.2 errors are logged, never swallowed
function _kernelEmit(type, data, ts) {
  // 1. Orchestrator ledger (§2.2 persisted)
  _postLedger('guardian', type, { ...data, _busSeq: _streamSeq });
  // 2. Cortex event_log (source of truth, §2.2)
  // Only for significant events to avoid flooding cortex
  const CORTEX_EVENTS = new Set([
    'guardian.job.complete', 'guardian.artifact', 'guardian.gaps',
    'guardian.job.queued', 'guardian.job.dispatched', 'guardian.ledger',
    'guardian.session.named', 'guardian.gate.error', 'guardian.setting.update',
  ]);
  if (CORTEX_EVENTS.has(type)) {
    _postEvent(type, data, { source: 'guardian.bus', causedBy: data.jobId || null });
  }
  // 3. Bridge SSE broadcast (§5.2 — everything on the bus)
  const BRIDGE_EVENTS = new Set([
    'guardian.job.complete', 'guardian.artifact', 'guardian.gaps',
    'guardian.job.queued', 'guardian.job.dispatched',
  ]);
  if (BRIDGE_EVENTS.has(type)) {
    }
}

const bus = new SISOStream();

// Event ledger — §LAW II: every bus emit written to ledger first
// ── CFR-Ω Ledger — every bus.emit written with sigma + delta + CFR snapshot ──
const _evLedger = createCFRLedger({
  ledgerDir: require('path').join(__dirname, 'memory_store'),
  systemId:  'guardian',
  onEvent:   null, // downstream consumers can add onEvent hooks here
  onGap: (gap) => {
    // Gap emission from CFR threshold crossing → JAA gaps table
    try {
      jaa.insert('gaps', {
        uuid:     require('crypto').randomUUID(),
        type:     gap.type,
        body:     gap.message,
        severity: gap.severity > 0.8 ? 'high' : gap.severity > 0.5 ? 'medium' : 'low',
        status:   'open',
        source:   'cfr-ledger',
        causedBy: gap.entry?.uuid || null,
        createdAt: Date.now(),
        ts:       Date.now(),
      });
    } catch(_) {}
    // Surface on bus so diagnostic tool sees it
    try { _origEmit('guardian.cfr.gap', gap); } catch(_) {}
  },
});
_evLedger.open();
_evLedger.startAutoSave(60000);

// Intercept every bus emit — write to CFR ledger before routing
// §LAW II: ledger write happens BEFORE any subscriber processes the event
const _origEmit = bus.emit.bind(bus);
bus.emit = function(type, data) {
  _evLedger.record(type, data || {}, {
    source:    'guardian.bus',
    causedBy:  data?.jobId || data?.causedBy || null,
    sessionId: data?.sessionId || null,
  });
  return _origEmit(type, data);
};

// ══════════════════════════════════════════════════════════════════════════════
//  SQLITE / JAA PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  JAA STORE — Pure-JS relational store, zero native deps
//  Persists to memory_store/*.json (same dir as memory server)
//  Memory server and main API share the same store — ONE source of truth
// ══════════════════════════════════════════════════════════════════════════════

const STORE_DIR = process.env.MEMORY_STORE_DIR || path.join(__dirname, 'memory_store');
const jaa = new JaaStore(STORE_DIR);
// Ensure guardian-specific tables exist on first run
['seam_sessions','queue_compartments','pa_sessions','jobs','artifacts',
 'gaps','failures','ledger','downloads','sessions','timeline_events',
 'ledger_entries'].forEach(t => {
  try { jaa._ensureTable?.(t); } catch(_) {}
});

// Shutdown hook — flush all dirty tables before exit
process.on('exit', () => jaa.flushAll());
process.on('SIGINT', () => { jaa.close(); process.exit(0); });
process.on('SIGTERM', () => { jaa.close(); process.exit(0); });

// ── Compatibility shims (same call shape as before, now pure-JS) ──────────────

function dbRun(sql, params = []) {
  // This is a no-op shim — all persistence goes through gate handlers directly.
  // Legacy callers that still use SQL strings are silently ignored; gates handle writes.
  return { changes: 0, lastInsertRowid: null };
}
function dbGet(sql, params = []) { return null; }  // shim — gates handle reads via jaa.*
function dbAll(sql, params = []) { return []; }      // shim — routes use jaa.all() directly
function getSetting(key, fallback = null) { return jaa.getSetting(key, fallback); }
function setSetting(key, value) { jaa.setSetting(key, value); bus.emit('guardian.setting.update', { key, value }); }
function getAllSettings() { return jaa.getAllSettings(); }

// ══════════════════════════════════════════════════════════════════════════════
//  GAPHUNTER v3 — INLINE TAXONOMY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const GAP_TYPE = { LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal', OBLIGATION:'obligation', ASSUMPTION:'assumption', CONTRADICTION:'contradiction' };
const GAP_REASON = { COMPRESSION:'compression', AVOIDANCE:'avoidance', ATTENTION:'attention', STRUCTURAL_LIMIT:'structural_limit', DEFERRED_VARIABLE:'deferred_variable', IDENTITY_REFLECTION:'identity_reflection' };
const DOMAIN = { CODE:'code', AI_ML:'ai_ml', COMMUNICATION:'communication', EPISTEMOLOGICAL:'epistemological', LOGIC:'logic' };

function gaphunterAnalyze(text, opts = {}) {
  const gaps = []; if (!text || text.length < 50) return gaps;
  const lines = text.split('\n'), words = text.toLowerCase().match(/\b\w+\b/g)||[], wc = words.length;
  const bd = lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length / Math.max(1,lines.length);
  const ld = wc > 5 ? (new Set(words).size / wc) : 1;
  const freq = {}; for (const ch of text) freq[ch]=(freq[ch]||0)+1;
  let H=0; for (const f of Object.values(freq)) { const p=f/text.length; H -= p*Math.log2(p); }
  H = parseFloat(H.toFixed(3));
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often)\b/gi)||[]).length;
  const hedgeRate = wc > 0 ? hedges/wc : 0;
  const min = opts.minScore ?? 0.25;
  const lastLine = lines[lines.length-1]?.trim()||'';

  if (bd > 0.5 && Math.min(0.95,bd) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.COMPRESSION, description:`High bullet density (${(bd*100).toFixed(0)}%) — reasoning compressed, load-bearing assumptions hidden`, score:Math.min(0.95,bd), evidence:{metric:bd,pattern:'bullet_density'} });
  if (ld < 0.35 && Math.min(0.9,1-ld) >= min) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:`Low lexical diversity (${ld}) — formulaic or repetitive phrasing`, score:Math.min(0.9,1-ld), evidence:{metric:ld,pattern:'lexical_diversity'} });
  if (H < 3.2 && wc > 80) { const sc=parseFloat(((4-H)/4).toFixed(3)); if (sc>=min) gaps.push({ type:GAP_TYPE.TEMPORAL, domain:DOMAIN.AI_ML, reason:GAP_REASON.COMPRESSION, description:`Low entropy H=${H} — pre-planned or template content`, score:sc, evidence:{metric:H,pattern:'entropy'} }); }
  if (hedgeRate > 0.04 && Math.min(0.85,hedgeRate*10) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.AVOIDANCE, description:`High hedge density (${(hedgeRate*100).toFixed(1)}%) — epistemic evasion`, score:Math.min(0.85,hedgeRate*10), evidence:{metric:hedgeRate,pattern:'hedge_rate'} });
  if (wc > 200 && (lastLine.endsWith('...')||lastLine.endsWith('etc.')||lastLine.length < 12)) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:'Possible truncation — context window pressure', score:0.75, evidence:{pattern:'truncation'} });
  const asserts = (text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi)||[]).length;
  const assertRate = wc>0?asserts/wc:0;
  if (assertRate > 0.02 && hedgeRate < 0.01 && wc > 100 && Math.min(0.8,assertRate*20) >= min) gaps.push({ type:GAP_TYPE.EVIDENTIAL, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.IDENTITY_REFLECTION, description:'High assertion density without evidence markers', score:Math.min(0.8,assertRate*20), evidence:{metric:assertRate,pattern:'assertion_without_evidence'} });
  if ((text.includes('```')||text.includes('function ')||text.includes('const '))) {
    const todos = (text.match(/\bTODO\b|\bFIXME\b|\bHACK\b/g)||[]).length;
    if (todos > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${todos} deferred variable(s) — §1.3 violation`, score:Math.min(0.9,0.3+todos*0.15), evidence:{metric:todos,pattern:'todo_markers'} });
    const stubs = (text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim)||[]).length;
    if (stubs > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${stubs} stub/unimplemented — §1.3 violation`, score:0.85, evidence:{metric:stubs,pattern:'stubs'} });
  }
  return gaps;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT SSE
// ══════════════════════════════════════════════════════════════════════════════

const cockpitClients = new Set();
function cockpitBroadcast(data) {
  if (!cockpitClients.size) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const r of cockpitClients) { try { r.write(msg); } catch(_) { cockpitClients.delete(r); } }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SISO GATE REGISTRATIONS
// ══════════════════════════════════════════════════════════════════════════════

bus.register(new SISOGate('guardian.artifact', (data) => {
  const ts = Date.now();
  const hash = data.hash || '';
  const existing = jaa.get('artifacts', { hash });
  if (existing) {
    jaa.update('artifacts', { hash }, { seen_count: (existing.seen_count||1)+1, last_seen: ts });
  } else {
    jaa.insert('artifacts', {
      id: randomUUID(), hash, name: data.name||'artifact', type: data.type||'code_block',
      lang: data.lang||null, content: (data.content||'').slice(0,8000),
      context: (data.context||'').slice(0,400), chat_url: data.chatUrl||'',
      chat_id: data.chatId||'', account: data.account||'', job_id: data.jobId||null,
      session_id: data.sessionId||null, direction: data.direction||'output',
      provider: data.provider||'claude', ts, last_seen: ts, seen_count: 1, tags: '[]',
    });
  }
  // Auto-upload content to dropzone file server
  const autoUp = getSetting('dropzone_auto_upload','true')==='true';
  if (autoUp && dropzone?.autoUpload && data.content && data.name) {
    const ext = {typescript:'ts',javascript:'js',python:'py',html:'html',css:'css',json:'json',bash:'sh',rust:'rs',go:'go'}[data.lang]||'txt';
    dropzone.autoUpload(`${(data.name).replace(/[^\w.-]/g,'_')}.${ext}`, data.content);
  }
  // Also push to memory server ingest (keeps memory server dashboard current)
  memoryServer?.ingest({ type:'ARTIFACT', payload:data, source:'siso-gate' });
}));

bus.register(new SISOGate('guardian.gaps', (data) => {
  const ts = Date.now();
  for (const gap of (data.gaps||[])) {
    jaa.insert('gaps', {
      id: randomUUID(), type: gap.type||'assumption', domain: gap.domain||null,
      reason: gap.reason||null, description: gap.description||'', score: gap.score||0.5,
      status: 'open', job_id: data.jobId||null, chat_id: data.chatId||null,
      session_id: data.sessionId||null, account: data.account||null,
      provider: data.provider||null, evidence: JSON.stringify(gap.evidence||{}),
      opened_ts: ts,
    });
  }
}));

bus.register(new SISOGate('guardian.job.complete', (data) => {
  const ts = Date.now();
  const jobId = data.jobId || randomUUID();
  const existing = jaa.get('jobs', { id: jobId });
  if (existing) {
    jaa.update('jobs', { id: jobId }, { status:'complete', response:(data.text||'').slice(0,5000), chars:(data.text||'').length, completed_ts:ts });
  } else {
    jaa.insert('jobs', {
      id: jobId, provider: data.provider||'claude', command: data.command||'',
      prompt: (data.prompt||'').slice(0,500), response: (data.text||'').slice(0,5000),
      status: 'complete', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
      account: data.account||'', session_id: null, chars: (data.text||'').length,
      source: 'guardian-ws', started_ts: data.startedTs||ts, completed_ts: ts,
    });
  }
}));

bus.register(new SISOGate('guardian.pa.session', (data) => {
  const ent = Array.isArray(data.entropy) ? (data.entropy.reduce((a,b)=>a+b,0)/Math.max(1,data.entropy.length)) : (data.entropy||0);
  jaa.insert('pa_sessions', {
    id: randomUUID(), job_id: data.jobId||null, chat_id: data.chatId||null,
    session_id: data.sessionId||null, account: data.account||null, provider: data.provider||null,
    total_tokens: data.tokens||0, tps_avg: parseFloat(data.tps)||0, pause_count: data.pauses||0,
    entropy_avg: parseFloat(ent)||0, burst_count: 0,
    hypotheses: JSON.stringify(data.hypotheses||[]), structure_events: '[]', ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.ledger', (data) => {
  jaa.insert('ledger_entries', {
    id: randomUUID(), ledger_type: data.ledgerType||'event', category: data.category||'EVENT',
    msg: data.msg||'', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
    account: data.account||'', provider: data.provider||null, job_id: data.jobId||null,
    session_id: data.sessionId||null, source: data.source||'guardian',
    meta: JSON.stringify(data.meta||{}), ts: Date.now(),
  });
  // Mirror to memory server so its dashboard stays current
  memoryServer?.ingest({ type:'LEDGER', payload:{ category:data.category||'EVENT', msg:data.msg||'', meta:data.meta||{} }, source:'siso-gate', chatUrl:data.chatUrl, account:data.account });
}));

bus.register(new SISOGate('guardian.download', (data) => {
  jaa.insert('downloads', {
    id: randomUUID(), filename: data.filename||'download', href: data.href||'',
    chat_url: data.chatUrl||'', chat_id: data.chatId||'', account: data.account||'',
    job_id: data.jobId||null, session_id: data.sessionId||null,
    provider: data.provider||null, ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.session.named', (data) => {
  const ts = Date.now();
  const existing = jaa.get('sessions', { chat_id: data.chatId||'' });
  if (existing) {
    jaa.update('sessions', { chat_id: data.chatId||'' }, { name: data.name, updated_ts: ts });
  } else {
    jaa.insert('sessions', {
      id: randomUUID(), chat_id: data.chatId||'', chat_url: data.chatUrl||'',
      provider: data.provider||'claude', account: data.account||'', name: data.name||'',
      token_total: 0, started_ts: ts, updated_ts: ts,
    });
  }
  const ws = PROVIDERS[data.provider||'claude'];
  // Push session name to all connected providers via NCP
  ncp.broadcast({ type:'GUARDIAN_SESSION_NAMED', ...data });
}));

bus.register(new SISOGate('guardian.timeline', (data) => {
  jaa.insert('timeline_events', {
    id: randomUUID(), channel: data.channel||'unknown', person_id: data.personId||null,
    pair_id: null, chat_id: data.chatId||null, session_id: data.sessionId||null,
    payload: JSON.stringify(data.payload||{}), ts: data.ts||Date.now(),
  });
}));

// Bridge cross-sync gates
));

// ══════════════════════════════════════════════════════════════════════════════
//  EXTENDED HTTP ROUTES
// ══════════════════════════════════════════════════════════════════════════════

function pRes(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify(data)); }
function bodyJ(req) { return new Promise((resolve,reject) => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{resolve(JSON.parse(b))}catch(e){reject(e)} }); req.on('error',reject); }); }

function handleExtendedRoutes(req, res, url, method) {
  const parts = url.pathname.split('/').filter(Boolean);

  // ── Core API routes ────────────────────────────────────────────────────────
  // ── Auto-update: /version returns component versions ─────────────────────
  // ── GET /open/:provider — redirect to provider URL (opens tab) ──────────────
  if (method==='GET' && url.pathname.startsWith('/open/')) {
    const prov = url.pathname.split('/')[2];
    const provUrls = { claude:'https://claude.ai/new', chatgpt:'https://chatgpt.com/' };
    const target = provUrls[prov];
    if (!target) { pRes(res, 404, { ok:false, error:'unknown provider' }); return true; }
    res.writeHead(302, { Location: target }); res.end();
    return true;
  }

  // ── GET /queue — physical file queue state ─────────────────────────────────
  if (method==='GET' && url.pathname==='/queue') {
    const qDir = require('path').join(__dirname, '..', 'data', 'guardian');
    const fs2  = require('fs');
    function listDir(sub) {
      try {
        return fs2.readdirSync(require('path').join(qDir, sub))
          .filter(f => !f.startsWith('.') && !f.endsWith('.gitkeep'))
          .map(f => {
            const fp   = require('path').join(qDir, sub, f);
            const stat = fs2.statSync(fp);
            const meta = { name: f, sizeBytes: stat.size, mtime: stat.mtimeMs };
            // Read state JSON if it exists
            const stateFile = require('path').join(qDir, 'queue', f.split('.')[0] + '.json');
            if (fs2.existsSync(stateFile)) {
              try { Object.assign(meta, JSON.parse(fs2.readFileSync(stateFile, 'utf8'))); }
              catch(_) {}
            }
            return meta;
          });
      } catch { return []; }
    }
    const pending    = listDir('input').filter(f => f.name.includes('.pending.'));
    const processing = listDir('input').filter(f => f.name.includes('.processing.'));
    const done       = listDir('input').filter(f => f.name.includes('.done.'));
    const failed     = listDir('input').filter(f => f.name.includes('.failed.'));
    pRes(res, 200, {
      ok:       true,
      counts:   { pending:pending.length, processing:processing.length, done:done.length, failed:failed.length },
      pending, processing, failed,
      done:     done.slice(-20),  // last 20 done items
    });
    return true;
  }

  // ── POST /queue/enqueue — add item to physical queue ────────────────────────
  if (method==='POST' && url.pathname==='/queue/enqueue') {
    bodyJ(req).then(body => {
      const { content, ext, provider, priority, tags, source } = body;
      if (!content) { pRes(res, 400, { ok:false, error:'content required' }); return; }
      const item = _physQueue.enqueue({
        content, ext: ext||'md',
        tags:     tags || [provider||'claude'],
        priority: priority || 'normal',
        source:   source   || 'api',
        meta:     { provider },
      });
      bus.emit('guardian.queue.enqueued', { uuid: item.uuid, ext: item.ext });
      pRes(res, 200, { ok:true, uuid: item.uuid, filepath: item.filepath });
    }).catch(e => pRes(res, 400, { ok:false, error:e.message }));
    return true;
  }

  // ── POST /queue/retry/:uuid — re-enqueue a failed item ───────────────────
  if (method==='POST' && /^\/queue\/retry\//.test(url.pathname)) {
    const uuid = url.pathname.split('/').pop();
    const state = _physQueue._readState(uuid);
    if (!state) { pRes(res, 404, { ok:false, error:'item not found' }); return; }
    // Find failed file and rename back to pending
    const inputDir = require('path').join(__dirname, '..', 'data', 'guardian', 'input');
    const files    = require('fs').readdirSync(inputDir).filter(f => f.startsWith(uuid) && f.includes('.failed.'));
    if (files.length) {
      const fp = require('path').join(inputDir, files[0]);
      const ext = files[0].split('.').pop();
      require('fs').renameSync(fp, require('path').join(inputDir, uuid + '.pending.' + ext));
      _physQueue._updateState(uuid, { status: 'pending', retriedAt: Date.now() });
      bus.emit('guardian.queue.retry', { uuid });
    }
    pRes(res, 200, { ok:true, uuid });
    return true;
  }

  // ── POST /queue/cancel/:uuid — mark processing item as failed ────────────
  if (method==='POST' && /^\/queue\/cancel\//.test(url.pathname)) {
    const uuid = url.pathname.split('/').pop();
    _physQueue.fail(uuid, 'cancelled by user', 0.3);
    pRes(res, 200, { ok:true, uuid });
    return true;
  }

  // ── GET /queue/conversation/:uuid — conversation log for completed item ──
  if (method==='GET' && /^\/queue\/conversation\//.test(url.pathname)) {
    const uuid  = url.pathname.split('/').pop();
    const convDir = require('path').join(__dirname,'..','data','guardian','conversations',uuid.slice(0,40));
    const convFile = require('path').join(convDir,'conversation.jsonl');
    if (!require('fs').existsSync(convFile)) { pRes(res, 200, { ok:true, messages:[] }); return true; }
    const messages = require('fs').readFileSync(convFile,'utf8').trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    pRes(res, 200, { ok:true, uuid, messages });
    return true;
  }

  // ── GET /baseline — current baseline stats + open deviations ──────────────
  if (method==='GET' && url.pathname==='/baseline') {
    pRes(res, 200, {
      ok: true,
      stats:    _baseline.stats(),
      baseline: _baseline.baseline(),
      gaps:     _baseline.gaps(),
      friction: _baseline.friction(),
    });
    return true;
  }

  if (method==='GET' && url.pathname==='/version') {
    const fs2 = require('fs');
    const path2 = require('path');
    const readVersion = (file) => {
      try {
        const content = fs2.readFileSync(path2.join(__dirname, '..', file), 'utf8');
        const m = content.match(/version['":\s]+['"v]?(\d+\.\d+\.\d+)/i);
        return m ? m[1] : null;
      } catch(_) { return null; }
    };
    const userscriptVersion = (file) => {
      try {
        const content = fs2.readFileSync(path2.join(__dirname, file), 'utf8');
        const m = content.match(/@version\s+([\d.]+)/);
        return m ? m[1] : null;
      } catch(_) { return null; }
    };
    pRes(res, 200, {
      ok: true,
      guardian:        '3.5.0',
      userscript_claude:  userscriptVersion('userscript-claude.js'),
      userscript_chatgpt: userscriptVersion('userscript-chatgpt.js'),
      spec_parser:     '1.0.0',
      seam_queue:      '1.0.0',
      detector:        '1.0.0',
      nexus_chat:      '4.0.0',
      ts: Date.now(),
    });
    return true;
  }

  if (method==='GET' && url.pathname==='/health') {
    const connectedProviders = {};
    for (const [k,v] of ncp._clients || new Map()) {
      connectedProviders[v.provider] = { tabId:v.tabId, connectedAt:v.connectedAt,
        lastHeartbeat:v.lastHeartbeat };
    }
    const pendingJobs   = [...jobs.values()].filter(j=>j.status==='pending');
    const activeQueues  = [..._activeQueues.values()].map(q=>q.toJSON());
    const baselineStats = _baseline ? _baseline.stats() : null;
    const queueStats    = (() => {
      try {
        const qDir = require('path').join(__dirname,'..','data','guardian','input');
        const files = require('fs').readdirSync(qDir);
        return {
          pending:    files.filter(f=>f.includes('.pending.')).length,
          processing: files.filter(f=>f.includes('.processing.')).length,
          done:       files.filter(f=>f.includes('.done.')).length,
          failed:     files.filter(f=>f.includes('.failed.')).length,
        };
      } catch { return null; }
    })();
    pRes(res, 200, {
      ok:              true,
      version:         '3.5.0',
      uptime:          process.uptime(),
      pid:             process.pid,
      // Jobs
      jobs:            jobs.size,
      pendingJobs:     pendingJobs.length,
      // NCP providers
      providers:       connectedProviders,
      providerCount:   Object.keys(connectedProviders).length,
      // SEAM
      activeQueues:    activeQueues.length,
      seamSessions:    activeQueues,
      // Physical queue
      physicalQueue:   queueStats,
      // Baseline health
      baseline:        baselineStats,
      friction:        baselineStats?.friction ?? 0,
      // Memory
      memory:          process.memoryUsage(),
      // Ports
      ports:           { http: HTTP_PORT, ncp: HTTP_PORT, memory: 7823, dropzone: 7822 },
    });
    return true;
  }
  if (method==='GET' && url.pathname==='/contract') {
    const cp = require('path').join(__dirname, 'interaction-contract.json');
    if (!require('fs').existsSync(cp)) { pRes(res,404,{ok:false,error:'contract not found'}); return true; }
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(require('fs').readFileSync(cp,'utf8')); return true;
  }
  // ── SEAM queue status ──────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/seam/queues') {
    const queues = [..._activeQueues.values()].map(q => q.toJSON());
    pRes(res, 200, { ok:true, active: queues.length, queues }); return true;
  }
  if (method==='GET' && url.pathname.startsWith('/seam/queues/')) {
    const qid = url.pathname.split('/')[3];
    const q   = _activeQueues.get(qid);
    if (!q) { pRes(res, 404, { ok:false, error:'queue not found' }); return true; }
    pRes(res, 200, { ok:true, queue: q.toJSON() }); return true;
  }

  // ── /status/:jobId — Forge GuardianClient polls this ──────────────────────
  if (method==='GET' && url.pathname.startsWith('/status/')) {
    const jid = url.pathname.split('/')[2];
    const job = jobs.get(jid) || jaa.get('jobs', { id: jid });
    if (!job) { pRes(res, 404, { ok:false, error:'job not found' }); return true; }
    pRes(res, 200, {
      ok: true, jobId: jid,
      status: job.status,
      complete: job.status === 'complete' || job.status === 'done',
      provider: job.provider, command: job.command,
      ts: job.ts,
    });
    return true;
  }

  // ── /response/:jobId — Forge GuardianClient reads completed response ────────
  if (method==='GET' && url.pathname.startsWith('/response/')) {
    const jid = url.pathname.split('/')[2];
    const job = jobs.get(jid) || jaa.get('jobs', { id: jid });
    if (!job) { pRes(res, 404, { ok:false, error:'job not found' }); return true; }
    // Look up stored response text
    const art = (jaa.all('artifacts') || []).find(a => a.jobId === jid);
    pRes(res, 200, {
      ok:       true,
      jobId:    jid,
      status:   job.status,
      response: job.responseText || job.text || art?.content || '',
      provider: job.provider,
      ts:       job.ts,
    });
    return true;
  }

  if (method==='GET' && url.pathname==='/providers') {
    const connected = ncp.getProviders();
    const out = { claude:'null', chatgpt:'null', gemini:'null', ollama:'null' };
    for (const [p] of Object.entries(out)) {
      if (ncp.isConnected(p)) out[p] = 'connected';
    }
    pRes(res, 200, { ok:true, providers:out, channels: connected }); return true;
  }

  // ── NCP channel endpoints (replace WSS) ─────────────────────────────────
  // ── CFR-Ω routes — kernel field debugger ──────────────────────────────
  if (url.pathname.startsWith('/cfr')) {
    if (_evLedger.handleCFRRoute(req, res, url)) return true;
  }

  if (method==='GET' && url.pathname==='/channel') {
    ncp.handleChannel(req, res, url); return true;
  }
  if (method==='POST' && url.pathname==='/result') {
    ncp.handleResult(req, res, bodyJ); return true;
  }
  if (method==='POST' && url.pathname==='/heartbeat') {
    ncp.handleHeartbeat(req, res, bodyJ); return true;
  }
  // ── SEAM session endpoints ─────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/seam/sessions') {
    const sessions = jaa.all('seam_sessions') || [];
    pRes(res, 200, { ok:true, sessions }); return true;
  }
  if (method==='POST' && url.pathname==='/seam/sessions') {
    bodyJ(req).then(body => {
      const session = jaa.insert('seam_sessions', {
        uuid: require('crypto').randomUUID(),
        title: body.title || 'Untitled', specTitle: body.specTitle || '',
        chunks: body.chunks || [], activeChunk: 0,
        provider: body.provider || 'claude',
        status: 'active', createdAt: Date.now(),
      });
      pRes(res, 200, { ok:true, session });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }
  if (method==='PUT' && url.pathname.startsWith('/seam/sessions/')) {
    const sid = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      const existing = jaa.get('seam_sessions', { uuid: sid });
      if (!existing) { pRes(res, 404, { ok:false, error:'session not found' }); return; }
      const updated = jaa.update('seam_sessions', { uuid: sid }, { ...body, updatedAt: Date.now() });
      bus.emit('guardian.seam.updated', { sessionId: sid, ...body });
      pRes(res, 200, { ok:true, session: updated });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Queue state endpoints ────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/queue/compartments') {
    const queueId = url.searchParams.get('queueId');
    const comps = (jaa.all('queue_compartments') || []).filter(c => !queueId || c.queueId === queueId).slice(0,100);
    pRes(res, 200, { ok:true, compartments: comps }); return true;
  }
  if (method==='POST' && url.pathname==='/queue/compartments') {
    bodyJ(req).then(body => {
      const comp = jaa.insert('queue_compartments', {
        uuid: body.id || require('crypto').randomUUID(),
        queueId: body.queueId, chunkIdx: body.chunkIdx,
        chunkTitle: body.chunkTitle, state: body.state || 'QUEUED',
        provider: body.provider, retries: body.retries || 0,
        detection: body.detection || null, ts: Date.now(),
      });
      bus.emit('guardian.queue.compartment', { ...comp });
      pRes(res, 200, { ok:true, compartment: comp });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }
  if (method==='PUT' && url.pathname.startsWith('/queue/compartments/')) {
    const cid = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      const updated = jaa.update('queue_compartments', { uuid: cid }, { ...body, updatedAt: Date.now() });
      if (updated) {
        bus.emit('guardian.queue.compartment.updated', { uuid: cid, ...body });
        pRes(res, 200, { ok:true, compartment: updated });
      } else {
        // Not found — insert new
        const comp = jaa.insert('queue_compartments', { uuid: cid, ...body, ts: Date.now() });
        pRes(res, 200, { ok:true, compartment: comp });
      }
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/settings') {
    const settings = jaa.all('settings') || [];
    const out = {};
    for (const s of settings) if (s.key) out[s.key] = s.value;
    pRes(res, 200, { ok:true, settings: out }); return true;
  }
  if (method==='PUT' && url.pathname.startsWith('/settings/')) {
    const key = decodeURIComponent(url.pathname.slice(10));
    bodyJ(req).then(body => {
      const existing = (jaa.all('settings') || []).filter(s => s.key === key);
      if (existing.length) jaa.update('settings', { uuid: existing[0].uuid }, { value: body.value });
      else jaa.insert('settings', { uuid: require('crypto').randomUUID(), key, value: body.value });
      pRes(res, 200, { ok:true, key, value: body.value });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }
  if (method==='POST' && url.pathname==='/settings/reset') {
    // Reset all settings to default — clear the settings table
    jaa.query('settings', () => true, 1000).forEach(s =>
      jaa.update('settings', s.uuid, { value: null })
    );
    pRes(res, 200, { ok:true }); return true;
  }

  // ── Artifacts (paginated) ────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/artifacts') {
    const limit = parseInt(url.searchParams.get('limit')||'100');
    const artifacts = jaa.all('artifacts') || [];
    pRes(res, 200, { ok:true, artifacts }); return true;
  }

  // ── Gaps ────────────────────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/gaps') {
    const limit = parseInt(url.searchParams.get('limit')||'200');
    const status = url.searchParams.get('status');
    let gaps = (jaa.all('gaps') || []).slice(0, limit);
    if (status) gaps = gaps.filter(g => g.status === status);
    pRes(res, 200, { ok:true, gaps }); return true;
  }
  if (method==='GET' && url.pathname==='/gaps/summary') {
    const gaps = jaa.query('gaps', () => true, 1000);
    const byType = {};
    for (const g of gaps) byType[g.type] = (byType[g.type] || 0) + 1;
    const drift = gaps.length > 0
      ? gaps.reduce((s,g) => s + (g.score||0), 0) / gaps.length : 0;
    pRes(res, 200, { ok:true, total: gaps.length, byType,
      drift: parseFloat(drift.toFixed(3)) }); return true;
  }

  // ── Sessions (chat sessions) ────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/sessions') {
    const limit = parseInt(url.searchParams.get('limit')||'50');
    const sessions = jaa.query('sessions', () => true, limit);
    pRes(res, 200, { ok:true, sessions }); return true;
  }
  if (method==='POST' && /^\/sessions\/[^/]+\/name$/.test(url.pathname)) {
    const chatId = url.pathname.split('/')[2];
    bodyJ(req).then(body => {
      const { name, account, provider, chatUrl } = body;
      // Update or insert session record
      const existing = jaa.query('sessions', s => s.chatId === chatId, 1);
      if (existing.length) {
        jaa.update('sessions', existing[0].uuid, { name, updatedAt: Date.now() });
      } else {
        jaa.insert('sessions', {
          uuid: require('crypto').randomUUID(),
          chatId, name, account, provider, chatUrl,
          createdAt: Date.now(),
        });
      }
      bus.emit('guardian.session.named', { chatId, name });
      // Also broadcast via NCP so Forge Brain updates
      ncp.broadcast({ type:'GUARDIAN_SESSION_NAMED', chatId, sessionName: name });
      pRes(res, 200, { ok:true, chatId, name });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Queue progress (from userscript QueueCompartment) ───────────────────────
  if (method==='POST' && /^\/api\/queue\/[^/]+\/progress$/.test(url.pathname)) {
    const queueId = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      // Upsert queue compartment state
      if (body.compartment) {
        const comp = body.compartment;
        const existing = jaa.query('queue_compartments', c =>
          c.queueId === queueId && c.chunkIdx === comp.chunkIdx, 1);
        if (existing.length) {
          jaa.update('queue_compartments', existing[0].uuid, {
            state: comp.state, retries: comp.retries,
            composite: comp.composite, failureCount: comp.failureCount,
            updatedAt: Date.now(),
          });
        } else {
          jaa.insert('queue_compartments', {
            uuid: comp.id || require('crypto').randomUUID(),
            queueId, chunkIdx: comp.chunkIdx,
            chunkTitle: comp.chunkTitle, state: comp.state,
            retries: comp.retries || 0, composite: comp.composite,
            failureCount: comp.failureCount || 0, ts: Date.now(),
          });
        }
      }
      bus.emit('guardian.queue.progress', { queueId, ...body });
      pRes(res, 200, { ok:true });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── POST /cli/exec — unified CLI execution endpoint ───────────────────────
  // Both terminal REPL and UI cockpit call this.
  // Every command is executed here, ledger-written (§LAW II), then broadcast
  // via SSE /events so both terminal and UI see output in real-time.
  //
  // Supported commands (mirrors nexus-repl.js dispatch table):
  //   jobs [--status pending|complete] [--limit N]
  //   artifacts [--lang ts] [--limit N]
  //   gaps [--status open] [--limit N]
  //   sessions [--limit N]
  //   providers
  //   health
  //   stats
  //   ledger [--limit N]
  //   settings
  //   set <key> <value>
  //   send <provider> <prompt...>
  //   seam queues
  //   seam sessions
  //   version
  //   bus [--limit N]

  if (method === 'POST' && url.pathname === '/cli/exec') {
    bodyJ(req).then(async body => {
      const raw  = (body.command || '').trim();
      const ts   = Date.now();
      if (!raw) { pRes(res, 400, { ok:false, error:'command required' }); return; }

      // §LAW II — write to ledger BEFORE executing
      const ledgerEntry = {
        uuid:     require('crypto').randomUUID(),
        category: 'INPUT',
        msg:      'cli: ' + raw.slice(0, 120),
        meta:     JSON.stringify({ command: raw, source: body.source || 'cli', ts }),
        ts,
      };
      try { jaa.insert('ledger', ledgerEntry); } catch(_) {}
      bus.emit('guardian.cli.exec', { command: raw, ts });

      // Execute the command
      let result = null;
      let error  = null;
      const parts = raw.split(/\s+/);
      const cmd   = parts[0].toLowerCase();
      const flags = {};
      for (let i = 1; i < parts.length; i++) {
        if (parts[i].startsWith('--') && parts[i+1] && !parts[i+1].startsWith('--')) {
          flags[parts[i].slice(2)] = parts[i+1]; i++;
        } else if (parts[i].startsWith('--')) {
          flags[parts[i].slice(2)] = true;
        }
      }

      try {
        switch (cmd) {
          case 'jobs': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('jobs') || [];
            const filtered = flags.status ? all.filter(j => j.status === flags.status) : all;
            result = { jobs: filtered.slice(0, limit) };
            break;
          }
          case 'artifacts': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('artifacts') || [];
            const filtered = flags.lang ? all.filter(a => a.lang === flags.lang) : all;
            result = { artifacts: filtered.slice(0, limit) };
            break;
          }
          case 'gaps': {
            const limit = parseInt(flags.limit || '50');
            let all     = jaa.all('gaps') || [];
            if (flags.status) all = all.filter(g => g.status === flags.status);
            if (flags.type)   all = all.filter(g => g.type === flags.type);
            result = { gaps: all.slice(0, limit) };
            break;
          }
          case 'sessions': {
            const limit = parseInt(flags.limit || '30');
            const all   = jaa.all('sessions') || [];
            result = { sessions: all.slice(0, limit) };
            break;
          }
          case 'providers': {
            const connected = {};
            for (const [k, c] of ncp._clients || new Map()) {
              connected[c.provider] = { tabId: c.tabId, connectedAt: c.connectedAt };
            }
            result = { providers: connected };
            break;
          }
          case 'health': {
            result = { ok: true, uptime: process.uptime(), jobs: jobs.size,
              providers: ncp.connectedProviders?.() || {}, ts: Date.now() };
            break;
          }
          case 'stats': {
            const all = jaa.all;
            result = {
              artifacts: (jaa.all('artifacts') || []).length,
              gaps:       (jaa.all('gaps')      || []).length,
              sessions:   (jaa.all('sessions')  || []).length,
              ledger:     (jaa.all('ledger')    || []).length,
              jobs:       jobs.size,
            };
            break;
          }
          case 'ledger': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('ledger') || [];
            result = { ledger: all.slice(-limit).reverse() };
            break;
          }
          case 'settings': {
            result = { settings: jaa.getAllSettings ? jaa.getAllSettings() : {} };
            break;
          }
          case 'set': {
            const key = parts[1], val = parts.slice(2).join(' ');
            if (!key || !val) { error = 'usage: set <key> <value>'; break; }
            if (jaa.setSetting) jaa.setSetting(key, val);
            result = { ok: true, key, value: val };
            break;
          }
          case 'send': {
            // send <provider> <prompt...>
            const provider = parts[1];
            const prompt   = parts.slice(2).join(' ');
            if (!provider || !prompt) { error = 'usage: send <provider> <prompt>'; break; }
            const job = createJob({ command:'code', provider, prompt });
            dispatchJob(job);
            result = { ok:true, jobId: job.id, provider, status: job.status };
            break;
          }
          case 'seam': {
            const sub = parts[1];
            if (sub === 'queues') {
              result = { queues: [..._activeQueues.values()].map(q => q.toJSON()) };
            } else if (sub === 'sessions') {
              result = { sessions: jaa.all('seam_sessions') || [] };
            } else {
              error = 'usage: seam queues | seam sessions';
            }
            break;
          }
          case 'version': {
            const readVer = (f) => {
              try {
                const c = require('fs').readFileSync(require('path').join(__dirname, '..', f),'utf8');
                const m = c.match(/@version\s+([\d.]+)/);
                return m ? m[1] : null;
              } catch { return null; }
            };
            result = {
              guardian: '3.5.0',
              userscript_claude:  readVer('guardian/userscript-claude.js'),
              userscript_chatgpt: readVer('guardian/userscript-chatgpt.js'),
            };
            break;
          }
          case 'bus': {
            const limit = parseInt(flags.limit || '20');
            result = { events: (_evLedger?.recent?.(limit) || []) };
            break;
          }
          default:
            error = 'Unknown command: ' + cmd + '. Try: jobs, artifacts, gaps, sessions, providers, health, stats, ledger, settings, set, send, seam, version, bus';
        }
      } catch(e) {
        error = e.message;
      }

      // §LAW II — write result to ledger
      const resultEntry = {
        uuid:     require('crypto').randomUUID(),
        category: error ? 'GAP' : 'EVENT',
        msg:      'cli result: ' + cmd + (error ? ' ERROR: ' + error.slice(0,80) : ' OK'),
        meta:     JSON.stringify({ command: raw, ok: !error, ts: Date.now() }),
        ts:       Date.now(),
      };
      try { jaa.insert('ledger', resultEntry); } catch(_) {}

      // Broadcast to all SSE clients so UI + terminal see the same output
      cockpitBroadcast({
        type:    'CLI_RESULT',
        command: raw,
        result:  result || null,
        error:   error  || null,
        ts:      Date.now(),
      });

      pRes(res, 200, { ok: !error, command: raw, result, error, ts });
    }).catch(e => pRes(res, 400, { ok:false, error: e.message }));
    return true;
  }

  // ── POST /command — dispatch a job (raw) or SEAM queue (with spec) ──────────
  if (method==='POST' && url.pathname==='/command') {
    bodyJ(req).then(async body => {

      // ── SEAM queue via .spec ────────────────────────────────────────────────
      if (body.spec || body.specText || body.specFile) {
        try {
          const specText = body.specText
            || (body.specFile ? require('fs').readFileSync(body.specFile, 'utf8') : null)
            || body.spec;
          if (!specText) throw new Error('spec content empty');

          const plan = parseSpec(specText, {
            splitOn:      body.splitOn      || 'heading',
            maxChunkSize: body.maxChunkSize || 3000,
          });

          const provider = body.provider || 'chatgpt';

          // §LAW II — SEAMQueue constructor writes seam_session to JAA
          const queue = new SEAMQueue({
            title:    plan.meta.name || body.title || 'Untitled Spec',
            provider,
            chunks: [
              // Chunk 0: prerequisite — INTAKE, no implementation yet
              {
                title:       '§ Prerequisites',
                content:     plan.prerequisiteBlock,
                builtPrompt: plan.prerequisiteBlock,
                axioms:      [],
              },
              // Chunks 1..N: actual spec content with SEAM contracts
              ...plan.chunks.map(c => ({
                title:       c.title,
                content:     c.content,
                builtPrompt: c.builtPrompt,
                axioms:      plan.axioms,
              })),
            ],
            jaa,
            busEmit: (type, data) => {
              bus.emit(type, data);
              _evLedger?.record(type, data, { source: 'seam-queue' });
            },
            ncpPush: (prov, data) => ncp.push(prov, data),
            onComplete: (stats) => {
              _activeQueues.delete(queue.uuid);
              bus.emit('guardian.seam.queue.complete', { queueId: queue.uuid, ...stats });
            },
          });

          _activeQueues.set(queue.uuid, queue);

          // §LAW II physical redundancy — write to disk queue before dispatch
          _physQueue.enqueue({
            uuid:     queue.uuid,
            content:  specText,
            ext:      'spec',
            tags:     ['seam', provider, plan.meta.name || 'unnamed'],
            priority: body.priority || 'normal',
            source:   body.source   || 'api',
            project:  body.project  || null,
            meta:     { queueId: queue.uuid, totalChunks: plan.totalChunks },
          });

          if (ncp.isConnected(provider)) {
            queue.start();
          } else {
            // Queue waits — will start when provider connects via NCP
            const pq = pendingQueue.get(provider) || [];
            pq.push({ _seamQueue: queue });
            pendingQueue.set(provider, pq);
          }

          pRes(res, 200, {
            ok: true, type: 'seam',
            queueId:  queue.uuid,
            title:    queue.title,
            provider,
            total:    plan.totalChunks + 1,
            meta:     plan.meta,
            status:   ncp.isConnected(provider) ? 'dispatching' : 'queued_waiting_for_provider',
          });
        } catch (e) {
          pRes(res, 400, { ok:false, error: 'spec parse failed: ' + e.message });
        }
        return;
      }

      // ── Raw job dispatch ────────────────────────────────────────────────────
      const parsed = parseCommand(body.raw);
      const provider = body.provider || parsed.provider || 'chatgpt';
      const command  = body.command  || parsed.command  || 'code';
      const prompt   = body.prompt   || parsed.prompt   || '';
      const content  = body.content  || '';

      if (!prompt && !content) {
        pRes(res, 400, { ok:false, error:'prompt required' }); return;
      }

      // §LAW II — createJob writes to JAA
      const job = createJob({ command, provider, prompt, content });
      dispatchJob(job);
      pRes(res, 200, { ok:true, jobId: job.id, status: job.status, provider });

    }).catch(e => pRes(res, 400, { ok:false, error: e.message }));
    return true;
  }

  if (method==='GET' && (url.pathname==='/jobs'||url.pathname==='/jobs/')) {
    const limit = parseInt(url.searchParams.get('limit')||'50');
    const status = url.searchParams.get('status');
    let list = [...jobs.values()];
    if (status) list = list.filter(j=>j.status===status);
    pRes(res, 200, { ok:true, jobs:list.slice(-limit) }); return true;
  }
  if (method==='GET' && url.pathname==='/bus') {
    const n   = parseInt(url.searchParams.get('n') || '20');
    const smp = bus.sample(n);          // { logLevel, count, entries }
    const gts = [...bus.gates.keys()];
    pRes(res, 200, { ok:true, gates:gts, ...smp }); return true;
  }
  if (method==='POST' && url.pathname==='/bus/emit') {
    bodyJ(req).then(body => {
      const { type, data } = body;
      if (!type) { pRes(res,400,{ok:false,error:'type required'}); return; }
      const r = bus.emit(type, data || {});
      pRes(res, 200, { ok:true, type, seq: r.seq });
    }).catch(e => pRes(res,500,{ok:false,error:e.message}));
    return true;
  }

  // Cockpit
  if (method==='GET' && (url.pathname==='/'||url.pathname==='/cockpit'||url.pathname==='/cockpit/')) {
    // Prefer guardian/ui/index.html (Forge IDE) over cockpit.html
    const forgeIdePath = require('path').join(__dirname, 'ui', 'index.html');
    const cockpitPath  = require('path').join(__dirname, '..', 'ui', 'cockpit.html');
    const cockpitHtml  = require('fs').existsSync(forgeIdePath)
      ? require('fs').readFileSync(forgeIdePath, 'utf8')
      : require('fs').existsSync(cockpitPath)
        ? require('fs').readFileSync(cockpitPath, 'utf8')
        : buildCockpitHTML();
    res.writeHead(200,{'Content-Type':'text/html','Access-Control-Allow-Origin':'*'}); res.end(cockpitHtml); return true;
  }

  // Static UI assets
  if (method==='GET' && url.pathname.startsWith('/ui/')) {
    const assetPath = require('path').join(__dirname, '..', url.pathname);
    try {
      const data = require('fs').readFileSync(assetPath);
      const ext = require('path').extname(url.pathname);
      const mime = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[ext]||'text/plain';
      res.writeHead(200,{'Content-Type':mime,'Access-Control-Allow-Origin':'*'}); res.end(data); return true;
    } catch(e) { pRes(res,404,{error:'not found'}); return true; }
  }

  // SSE events
  if (method==='GET' && url.pathname==='/events') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    res.write(`data: ${JSON.stringify({type:'connected',ts:Date.now()})}\n\n`);
    cockpitClients.add(res); req.on('close',()=>cockpitClients.delete(res)); return true;
  }

  // ── Settings ──────────────────────────────────────────────────────────────────
  if (parts[0]==='settings') {
    if (method==='GET' && parts.length===1) { pRes(res,200,{ok:true,settings:getAllSettings()}); return true; }
    if (method==='GET' && parts[1]) {
      const v = getSetting(parts[1]); if(v===null){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,key:parts[1],value:v}); return true;
    }
    if (method==='PUT' && parts[1]) {
      bodyJ(req).then(b=>{setSetting(parts[1],b.value??'');pRes(res,200,{ok:true,key:parts[1],value:b.value});}).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='POST' && parts[1]==='reset') {
      // Re-bootstrap defaults
      const { JaaStore: JS2 } = require('./jaa-store.js');
      const defaults = JS2.prototype?._bootstrapSettings?.call?.(jaa) || null;
      // Force re-insert all defaults
      for (const [k,v] of Object.entries({session_greeting_enabled:'true',session_greeting_text:'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',scan_debounce_ms:'1500',artifact_max:'500',gap_min_score:'0.25',pa_enabled:'true',memory_auto_push:'true',dropzone_auto_upload:'true',stream_log_level:'EVENTS',greeting_delay_ms:'1200',poll_interval_ms:'500',stable_count_threshold:'5'})) {
        setSetting(k, v);
      }
      pRes(res,200,{ok:true,settings:getAllSettings()}); return true;
    }
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────────
  if (parts[0]==='artifacts') {
    if (method==='GET' && !parts[1]) {
      const limit   = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const lang    = url.searchParams.get('lang');
      const chatId  = url.searchParams.get('chatId');
      const account = url.searchParams.get('account');
      const after   = parseInt(url.searchParams.get('after')||'0');
      const q       = url.searchParams.get('q');
      const where = {};
      if (lang)    where.lang     = lang;
      if (chatId)  where.chat_id  = chatId;
      if (account) where.account  = account;
      let rows = jaa.all('artifacts', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r => r.ts > after);
      if (q) { const ql=q.toLowerCase(); rows = rows.filter(r=>(r.name||'').toLowerCase().includes(ql)||(r.content||'').toLowerCase().includes(ql)||(r.lang||'').toLowerCase().includes(ql)); }
      pRes(res,200,{ok:true,count:rows.length,artifacts:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,artifact:r}); return true;
    }
    if (method==='DELETE' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if (r) jaa.delete('artifacts',{id:r.id});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='PUT' && parts[1] && parts[2]==='tags') {
      bodyJ(req).then(b=>{
        const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
        if (r) jaa.update('artifacts',{id:r.id},{tags:JSON.stringify(b.tags||[])});
        pRes(res,200,{ok:true,tags:b.tags});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  // ── Gaps ──────────────────────────────────────────────────────────────────────
  if (parts[0]==='gaps') {
    if (method==='GET' && parts[1]==='summary') {
      const rows = jaa.all('gaps').filter(g=>g.status!=='ignored');
      const bt = {};
      for (const g of rows) {
        if(!bt[g.type])bt[g.type]={count:0,totalScore:0,open:0,widening:0};
        bt[g.type].count++;bt[g.type].totalScore+=(g.score||0);
        if(g.status==='open')bt[g.type].open++;if(g.status==='widening')bt[g.type].widening++;
      }
      pRes(res,200,{ok:true,total:rows.length,byType:bt}); return true;
    }
    if (method==='GET' && parts[1]==='catalogue') {
      pRes(res,200,{ok:true,gapTypes:GAP_TYPE,domains:DOMAIN,reasons:GAP_REASON}); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where = {};
      const type   = url.searchParams.get('type');
      const domain = url.searchParams.get('domain');
      const status = url.searchParams.get('status');
      if (type)   where.type   = type;
      if (domain) where.domain = domain;
      if (status) where.status = status;
      const rows = jaa.all('gaps', where, { orderBy:'score', order:'DESC', limit });
      pRes(res,200,{ok:true,gaps:rows}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='close') {
      jaa.update('gaps',{id:parts[1]},{status:'closed',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='ignore') {
      jaa.update('gaps',{id:parts[1]},{status:'ignored',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
  }

  // ── Ledger ────────────────────────────────────────────────────────────────────
  if (parts[0]==='ledger') {
    if (method==='GET' && parts[1]==='metrics') {
      const all = jaa.all('ledger_entries');
      pRes(res,200,{ok:true,
        total:    all.length,
        upgrades: all.filter(e=>e.ledger_type==='upgrade').length,
        ideas:    all.filter(e=>e.ledger_type==='idea').length,
        gaps:     all.filter(e=>e.category==='GAP').length,
      }); return true;
    }
    if (method==='POST' && parts.length===1) {
      bodyJ(req).then(b=>{bus.emit('guardian.ledger',{...b,source:'api'});pRes(res,200,{ok:true});}).catch(e=>{console.error('[guardian] ledger error:',e.message);pRes(res,400,{ok:false,error:e.message});}); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const where  = {};
      const cat    = url.searchParams.get('category');
      const after  = parseInt(url.searchParams.get('after')||'0');
      if (cat) where.category = cat;
      let rows = jaa.all('ledger_entries', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r=>r.ts>after);
      pRes(res,200,{ok:true,count:rows.length,ledger:rows}); return true;
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────
  if (parts[0]==='sessions') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where  = {};
      const prov   = url.searchParams.get('provider');
      const acc    = url.searchParams.get('account');
      if (prov) where.provider = prov;
      if (acc)  where.account  = acc;
      pRes(res,200,{ok:true,sessions:jaa.all('sessions',where,{orderBy:'updated_ts',order:'DESC',limit})}); return true;
    }
    if (method==='GET' && parts[1] && !parts[2]) {
      const r = jaa.get('sessions',{id:parts[1]}) || jaa.get('sessions',{chat_id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,session:r}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='name') {
      bodyJ(req).then(b=>{
        bus.emit('guardian.session.named',{chatId:parts[1],name:b.name,...b});
        pRes(res,200,{ok:true,name:b.name});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='GET' && parts[1] && parts[2]==='timeline') {
      const events = jaa.all('timeline_events').filter(e=>e.session_id===parts[1]||e.chat_id===parts[1]).sort((a,b)=>a.ts-b.ts).slice(0,500);
      pRes(res,200,{ok:true,events}); return true;
    }
  }

  // ── PA sessions ───────────────────────────────────────────────────────────────
  if (parts[0]==='pa') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'20'),100);
      const where  = {};
      const chatId = url.searchParams.get('chatId');
      if (chatId) where.chat_id = chatId;
      const rows   = jaa.all('pa_sessions', where, {orderBy:'ts',order:'DESC',limit}).map(r=>{
        try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
        return r;
      });
      pRes(res,200,{ok:true,sessions:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('pa_sessions',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
      pRes(res,200,{ok:true,session:r}); return true;
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────
  if (parts[0]==='timeline' && method==='GET') {
    const limit    = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
    const where    = {};
    const personId = url.searchParams.get('personId');
    const channel  = url.searchParams.get('channel');
    const from     = parseInt(url.searchParams.get('from')||'0');
    if (personId) where.person_id = personId;
    if (channel)  where.channel   = channel;
    let rows = jaa.all('timeline_events', where, {orderBy:'ts',order:'DESC',limit});
    if (from) rows = rows.filter(r=>r.ts>from);
    pRes(res,200,{ok:true,events:rows}); return true;
  }

  // ── Memory (query / context / stats) ──────────────────────────────────────────
  if (parts[0]==='memory') {
    if (method==='GET' && parts[1]==='query') {
      const q = url.searchParams.get('q')||'';
      if (!q) { pRes(res,400,{ok:false,error:'Missing q'}); return true; }
      const results = jaa.search(q);
      pRes(res,200,{ok:true,query:q,results}); return true;
    }
    if (method==='GET' && parts[1]==='context') {
      const chatId = url.searchParams.get('chatId');
      const arts   = chatId ? jaa.all('artifacts',{chat_id:chatId},{orderBy:'ts',order:'DESC',limit:50}) : jaa.all('artifacts',{},{orderBy:'ts',order:'DESC',limit:50});
      const gaps   = jaa.all('gaps',{status:'open'},{orderBy:'score',order:'DESC',limit:20});
      const led    = jaa.all('ledger_entries',{},{orderBy:'ts',order:'DESC',limit:20});
      pRes(res,200,{ok:true,ts:Date.now(),artifacts:arts,gaps,ledger:led}); return true;
    }
    if (method==='GET' && parts[1]==='stats') {
      const s = jaa.stats();
      s.storeDir = STORE_DIR;
      pRes(res,200,{ok:true,stats:s}); return true;
    }
    // POST /memory/ingest — used by userscripts when they can't hit WS
    if (method==='POST' && parts[1]==='ingest') {
      bodyJ(req).then(body => {
        memoryServer?.ingest(body);
        // Also route through SISO bus
        if (body.type==='ARTIFACT' && body.payload) bus.emit('guardian.artifact', body.payload);
        if (body.type==='LEDGER' && body.payload) bus.emit('guardian.ledger', { ...body.payload, chatUrl:body.chatUrl, account:body.account, source:'memory-ingest' });
        pRes(res,200,{ok:true});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT HTML
// ══════════════════════════════════════════════════════════════════════════════
function buildCockpitHTML() {
  const ips = getLocalIPs();
  const port = HTTP_PORT;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Cockpit v8</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#020408;--s1:#06090e;--s2:#0a0e14;--border:#0d1a26;--text:#b0cce0;--muted:#2a4050;--mono:'SF Mono','Fira Code',monospace;--acc:#00b4d8;--grn:#22c55e;--yel:#f59e0b;--red:#ef4444;--pur:#a78bfa}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);overflow:hidden}
.grid{position:fixed;inset:0;background-image:linear-gradient(rgba(0,180,216,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,216,.02) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:.3;animation:scan 6s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{display:grid;grid-template-rows:48px 1fr;height:100vh;position:relative;z-index:10}
.topbar{display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid var(--border);background:var(--s1);flex-shrink:0}
.topbar-logo{font-size:.85rem;font-weight:700;letter-spacing:.2em;color:var(--acc)}
.body{display:grid;grid-template-columns:200px 1fr;height:100%;overflow:hidden}
.sidebar{border-right:1px solid var(--border);background:var(--s1);overflow-y:auto}
.nav-item{padding:8px 16px;cursor:pointer;font-size:.72rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;border-left:2px solid transparent;transition:all .15s}
.nav-item:hover{color:var(--text);background:rgba(0,180,216,.04)}
.nav-item.active{color:var(--acc);border-left-color:var(--acc);background:rgba(0,180,216,.06)}
.main{overflow:hidden;display:flex;flex-direction:column}
.panel{display:none;flex-direction:column;height:100%;overflow:hidden}
.panel.active{display:flex}
.ph{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s2)}
.pt{font-size:.7rem;text-transform:uppercase;letter-spacing:.15em;color:var(--acc);font-weight:700}
.pb{flex:1;overflow-y:auto;padding:12px 20px}
.pb::-webkit-scrollbar{width:4px}.pb::-webkit-scrollbar-thumb{background:var(--border)}
.stats{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.stat{background:var(--s1);border:1px solid var(--border);padding:7px 10px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc)}
.sv{color:var(--acc);font-size:1rem;font-weight:600}.sl{color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
#stream-feed{font-size:.7rem;height:100%;overflow-y:auto;padding:2px 0}
.sr{padding:2px 0;border-bottom:1px solid rgba(13,26,38,.5);display:flex;gap:8px}
.sts{color:#1a3040;font-size:.62rem;flex-shrink:0;width:68px}.sty{font-size:.62rem;font-weight:700;flex-shrink:0;width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd{color:#1a3040;font-size:.62rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{background:none;border:1px solid var(--border);color:var(--muted);padding:2px 8px;font-size:.68rem;cursor:pointer;font-family:var(--mono);transition:all .15s}
.btn:hover{border-color:var(--acc);color:var(--acc)}
.search{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:5px 10px;font-family:var(--mono);font-size:.75rem;width:100%;margin-bottom:8px;outline:none}
.search:focus{border-color:rgba(0,180,216,.4)}
.fb{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.fb .btn.on{border-color:var(--acc);color:var(--acc);background:rgba(0,180,216,.06)}
.acard{border:1px solid var(--border);margin-bottom:5px;overflow:hidden;cursor:pointer}
.acard:hover{border-color:rgba(0,180,216,.3)}.acard.exp{border-color:var(--acc)}
.ahdr{display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--s1);font-size:.75rem}
.aname{color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.alang{color:var(--muted);font-size:.62rem}.ats{color:#1a3040;font-size:.6rem}
.abody{padding:7px 10px;border-top:1px solid var(--border);background:#030608}
.ameta{display:flex;gap:10px;font-size:.62rem;margin-bottom:5px;flex-wrap:wrap}
.aml{color:#1a3040;text-transform:uppercase;letter-spacing:.08em}
.amv{color:var(--muted)}.amv.url{color:var(--acc);cursor:pointer;text-decoration:underline}
.acont{background:#020305;border:1px solid var(--border);padding:6px 8px;font-size:.65rem;color:#2a4050;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow-y:auto;margin-top:4px;font-family:var(--mono)}
.aact{display:flex;gap:4px;margin-top:5px}
.gap-hm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px;margin-bottom:10px}
.gcel{background:var(--s1);border:1px solid var(--border);padding:7px 10px;cursor:pointer;transition:all .15s}
.gcel:hover{border-color:var(--acc)}
.gcet{font-size:.7rem;font-weight:700;margin-bottom:2px}.gcec{font-size:.62rem;color:var(--muted)}
.gcebar{height:2px;margin-top:3px;background:var(--border);border-radius:1px;overflow:hidden}
.gcebarfill{height:100%;background:var(--acc);border-radius:1px}
.grow{padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;font-size:.7rem}
.gtype{font-weight:700;flex-shrink:0;width:78px}.gdomain{color:var(--muted);flex-shrink:0;width:80px;font-size:.62rem}
.greason{color:#1a3040;flex-shrink:0;width:90px;font-size:.6rem}
.gdesc{color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gscore{flex-shrink:0;width:34px;text-align:right;font-weight:700}
.drift{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dbar{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden}
.dfill{height:100%;background:var(--acc);transition:width .5s}
.sg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:900px){.sg{grid-template-columns:1fr}}
.sc{background:var(--s1);border:1px solid var(--border);padding:9px 11px}
.sk{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}
.sl2{font-size:.74rem;color:var(--text);margin-bottom:6px;font-weight:600}
.sd2{font-size:.6rem;color:#1a3040;margin-bottom:7px}
.sc input[type=range]{width:100%;accent-color:var(--acc)}
.sc input[type=text],.sc textarea,.sc select{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;font-family:var(--mono);font-size:.7rem;width:100%;outline:none}
.sc textarea{resize:vertical;min-height:54px}
.tgl{position:relative;width:34px;height:18px;cursor:pointer}
.tgl input{opacity:0;width:0;height:0}
.tsl{position:absolute;inset:0;background:var(--border);border-radius:18px;transition:.2s}
.tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:.2s}
.tgl input:checked+.tsl{background:var(--acc)}
.tgl input:checked+.tsl::before{transform:translateX(16px);background:#fff}
.pacard{background:var(--s1);border:1px solid var(--border);padding:9px 11px;margin-bottom:5px}
.pamets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px}
.pamet{background:var(--bg);border:1px solid var(--border);padding:4px 6px;text-align:center}
.pamv{color:var(--acc);font-size:.85rem;font-weight:600}.paml{color:var(--muted);font-size:.58rem;text-transform:uppercase}
.pahyp{background:var(--bg);border-left:2px solid var(--acc);padding:4px 7px;margin-bottom:3px}
.pahyl{color:var(--text);font-size:.7rem;margin-bottom:2px}.pahyc{color:var(--acc);font-size:.62rem}
.pabar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin:2px 0}
.pabarf{height:100%;background:var(--acc);border-radius:2px}
.pc{background:var(--s1);border:1px solid var(--border);padding:9px 12px;margin-bottom:5px;display:flex;align-items:center;gap:10px}
.ps{font-size:.66rem;flex:1}.ps.on{color:var(--grn)}.ps.off{color:var(--muted)}
.jcard{background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px}
.jhdr{display:flex;gap:7px;align-items:center;margin-bottom:3px}.jid{font-size:.62rem;color:#1a3040}
.jst{font-size:.62rem;padding:1px 5px;border-radius:3px}
.jst.pending{background:rgba(245,158,11,.1);color:var(--yel)}.jst.complete{background:rgba(34,197,94,.1);color:var(--grn)}
.jst.streaming{background:rgba(0,180,216,.1);color:var(--acc)}.jst.failed{background:rgba(239,68,68,.1);color:var(--red)}
#cli-out{background:#010305;border:1px solid var(--border);padding:9px;font-size:.7rem;color:#2a6080;height:280px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-family:var(--mono);margin-bottom:7px}
.clir{display:flex;gap:5px}
#cli-in{flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:.7rem;padding:4px 0;outline:none}
.ccmds{display:flex;flex-wrap:wrap;gap:3px;margin-top:7px}
.empty{color:var(--muted);text-align:center;padding:2.5rem;font-size:.76rem}
</style>
</head>
<body>
<div class="grid"></div><div class="scan"></div>
<div class="app">
  <div class="topbar">
    <span class="topbar-logo">GUARDIAN v8</span>
    <span style="color:var(--muted);font-size:.66rem">${ips.map(i=>i.address).join(' · ')||'localhost'} · :${port}</span>
    <div id="pstatus" style="display:flex;gap:8px;margin-left:auto"></div>
    <span id="dbst" style="font-size:.62rem;color:var(--muted)">DB…</span>
  </div>
  <div class="body">
    <div class="sidebar">
      <div class="nav-item active" data-p="stream">◈ Stream</div>
      <div class="nav-item" data-p="artifacts">◻ Artifacts</div>
      <div class="nav-item" data-p="gaps">△ Gaps</div>
      <div class="nav-item" data-p="pa">⚡ PA Sessions</div>
      <div class="nav-item" data-p="sessions">◇ Sessions</div>
      <div class="nav-item" data-p="agents">◉ Agents</div>
      <div class="nav-item" data-p="settings">⚙ Settings</div>
      <div class="nav-item" data-p="cli">$ CLI</div>
      <div style="flex:1;min-height:40px"></div>
      <div style="padding:8px 14px;font-size:.6rem;color:var(--muted);border-top:1px solid var(--border)">
        <div id="sb1">Artifacts: —</div><div id="sb2">Gaps: —</div><div id="sb3">Sessions: —</div>
      </div>
    </div>
    <div class="main">
      <div class="panel active" id="panel-stream">
        <div class="ph"><span class="pt">Live SISO Stream</span><button class="btn" style="margin-left:auto" onclick="document.getElementById('stream-feed').innerHTML=''">Clear</button><label style="display:flex;align-items:center;gap:5px;font-size:.65rem;color:var(--muted);margin-left:8px"><input type="checkbox" id="sp"> Pause</label></div>
        <div class="pb" style="padding:0"><div id="stream-feed"></div></div>
      </div>
      <div class="panel" id="panel-artifacts">
        <div class="ph"><span class="pt">Artifact Store</span><span id="artcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="stats" id="artstats"></div><input class="search" id="asrch" placeholder="Search name, lang, content, account…" oninput="loadArt()"><div class="fb" id="afilts"></div><div id="artlist"></div></div>
      </div>
      <div class="panel" id="panel-gaps">
        <div class="ph"><span class="pt">Gap Intelligence (GapHunter v3)</span><span id="gapcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="drift"><span style="font-size:.66rem;color:var(--muted)">Drift</span><div class="dbar"><div class="dfill" id="drf" style="width:0%"></div></div><span id="drv" style="font-size:.7rem;font-weight:700;width:36px;text-align:right">—</span></div><div class="gap-hm" id="ghm"></div><div id="glist"></div></div>
      </div>
      <div class="panel" id="panel-pa"><div class="ph"><span class="pt">Prompt Archaeology</span></div><div class="pb"><div id="palist"></div></div></div>
      <div class="panel" id="panel-sessions"><div class="ph"><span class="pt">Sessions</span></div><div class="pb"><div id="sesslist"></div></div></div>
      <div class="panel" id="panel-agents"><div class="ph"><span class="pt">Agent Controls</span></div><div class="pb"><div style="font-size:.62rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.1em">Providers</div><div id="provlist"></div><div style="font-size:.62rem;color:var(--muted);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.1em">Jobs</div><div id="joblist"></div></div></div>
      <div class="panel" id="panel-settings"><div class="ph"><span class="pt">Settings</span><button class="btn" style="margin-left:auto;color:var(--red)" onclick="resetS()">Reset All</button></div><div class="pb"><div class="sg" id="sgrid"></div></div></div>
      <div class="panel" id="panel-cli"><div class="ph"><span class="pt">CLI Bridge</span></div><div class="pb"><div id="cli-out">[guardian] CLI ready\n</div><div class="clir"><span style="color:var(--acc);font-size:.7rem;flex-shrink:0;font-family:var(--mono)">guardian $</span><input id="cli-in" placeholder="jobs | artifacts | gaps | sessions | providers | health | stats" autocomplete="off"></div><div class="ccmds" id="ccmds"></div></div></div>
    </div>
  </div>
</div>
<script>
const BASE='';let af='all',aexp=new Set(),spsd=false,ch=[],ci=-1;
const TC={'guardian.artifact':'#a78bfa','guardian.gaps':'#f472b6','guardian.job.complete':'#34d399','guardian.pa.session':'#f59e0b','guardian.ledger':'#94a3b8','GUARDIAN_COMPLETE':'#34d399','GUARDIAN_ARTIFACT':'#a78bfa','GUARDIAN_GAPS':'#f472b6','GUARDIAN_DONE':'#22c55e','GUARDIAN_CHUNK':'#475569'};
const ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function ft(ts){return new Date(ts).toLocaleTimeString()}
document.querySelectorAll('.nav-item').forEach(n=>{n.onclick=()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));n.classList.add('active');document.getElementById('panel-'+n.dataset.p)?.classList.add('active');const p=n.dataset.p;if(p==='artifacts')loadArt();if(p==='gaps')loadGaps();if(p==='pa')loadPA();if(p==='sessions')loadSess();if(p==='agents')loadAgents();if(p==='settings')loadSettings();}});
const es=new EventSource('/events');const sf=document.getElementById('stream-feed');
es.onmessage=function(e){
  try {
    const msg=JSON.parse(e.data);
    // CLI_RESULT: mirror to CLI panel if open
    if(msg.type==='CLI_RESULT'){
      const cout=document.getElementById('cli-out');
      if(cout){
        if(msg.error) cout.textContent+='[error] '+msg.error+'\n';
        else if(msg.result) cout.textContent+=JSON.stringify(msg.result,null,2)+'\n';
        cout.scrollTop=cout.scrollHeight;
      }
    }
    // Stream feed: all events
    if(!document.getElementById('sp')?.checked){
es.onmessage=e=>{if(spsd)return;const d=JSON.parse(e.data);const row=document.createElement('div');row.className='sr';const col=TC[d.type]||'#2a4050';row.innerHTML='<span class="sts">'+ft(d.ts||Date.now())+'</span><span class="sty" style="color:'+col+'">'+esc(d.type||'event')+'</span><span class="sd">'+esc(JSON.stringify(d.data||{}).slice(0,100))+'</span>';sf.appendChild(row);if(sf.children.length>200)sf.firstChild.remove();sf.scrollTop=sf.scrollHeight;updateSB();};
document.getElementById('sp').onchange=e=>spsd=e.target.checked;
async function loadPS(){try{const r=await fetch('/providers').then(x=>x.json());document.getElementById('pstatus').innerHTML=Object.entries(r.providers||{}).map(([n,s])=>'<span style="display:flex;align-items:center;gap:4px;font-size:.65rem;color:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"><span style="width:5px;height:5px;border-radius:50%;background:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"></span>'+n+'</span>').join('');}catch(_){}}
async function loadDB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const el=document.getElementById('dbst');el.textContent=r.stats?.dbExists?'DB ✓':'DB flat';el.style.color=r.stats?.dbExists?'var(--grn)':'var(--yel)';}catch(_){}}
async function updateSB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const s=r.stats||{};document.getElementById('sb1').textContent='Artifacts: '+(s.artifacts||0);document.getElementById('sb2').textContent='Gaps: '+(s.gaps||0);document.getElementById('sb3').textContent='Sessions: '+(s.sessions||0);}catch(_){}}
async function loadArt(){const q=document.getElementById('asrch')?.value||'',lang=af==='all'?'':af;const r=await fetch('/artifacts?'+new URLSearchParams({limit:100,...(lang?{lang}:{}),...(q?{q}:{})})).then(x=>x.json());const arts=r.artifacts||[];document.getElementById('artcnt').textContent=arts.length+' results';document.getElementById('artstats').innerHTML=[['Total',arts.length],['Langs',[...new Set(arts.map(a=>a.lang).filter(Boolean))].length],['Chats',[...new Set(arts.map(a=>a.chat_id))].length]].map(([l,v])=>'<div class="stat"><div class="sv">'+v+'</div><div class="sl">'+l+'</div></div>').join('');document.getElementById('afilts').innerHTML=['all','ts','js','python','html','css','json','bash','rust'].map(f=>'<button class="btn'+(af===f?' on':'')+'" onclick="af=\''+f+'\';loadArt()">'+f+'</button>').join('');const list=document.getElementById('artlist');if(!arts.length){list.innerHTML='<div class="empty">No artifacts</div>';return;}list.innerHTML=arts.slice(0,80).map(a=>{const ic=ICONS[a.lang]||'◻',exp=aexp.has(a.hash);const body=exp?'<div class="abody"><div class="ameta"><span><span class="aml">Account </span><span class="amv">'+esc((a.account||'').slice(0,28))+'</span></span><span><span class="aml">Chat </span><span class="amv url" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">'+((a.chat_id||'').slice(0,14))+'</span></span><span><span class="aml">Hash </span><span class="amv">'+(a.hash||'').slice(0,8)+'</span></span></div>'+(a.context?'<div style="color:#1a3040;font-size:.62rem;margin-bottom:4px;font-style:italic">'+esc(a.context.slice(0,120))+'</div>':'')+'<pre class="acont">'+esc((a.content||'').slice(0,1800))+'</pre><div class="aact"><button class="btn" onclick="navigator.clipboard.writeText('+JSON.stringify(a.content||'')+').then(()=>this.textContent=\'✓\')">⎘ Copy</button><button class="btn" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">↗ Chat</button></div></div>':'';return'<div class="acard'+(exp?' exp':'')+'" onclick="aexp.'+(exp?'delete':'add')+'(\''+a.hash+'\');loadArt()"><div class="ahdr"><span>'+ic+'</span><span class="aname" style="color:'+(a.direction==='output'?'#a78bfa':'#60a5fa')+'">'+esc(a.name||'artifact')+'</span>'+(a.lang?'<span class="alang">'+a.lang+'</span>':'')+'<span class="ats">'+ft(a.ts)+'</span></div>'+body+'</div>';}).join('');}
async function loadGaps(){const r=await fetch('/gaps?limit=80').then(x=>x.json());const gs=r.gaps||[];const sum=await fetch('/gaps/summary').then(x=>x.json());document.getElementById('gapcnt').textContent=gs.length+' open';const open=gs.filter(g=>g.status==='open').length,tot=gs.length,dr=tot>0?(open/tot):0;document.getElementById('drf').style.width=(dr*100)+'%';document.getElementById('drv').textContent=(dr*100).toFixed(0)+'%';const bt=sum.byType||{},mx=Math.max(...Object.values(bt).map(t=>t.count||0),1);document.getElementById('ghm').innerHTML=Object.entries(bt).map(([type,info])=>{const pct=(info.count/mx*100).toFixed(0);const col=info.widening>0?'var(--red)':info.open>info.count/2?'var(--yel)':'var(--acc)';return'<div class="gcel" onclick="fgtype(\''+type+'\')"><div class="gcet" style="color:'+col+'">'+type+'</div><div class="gcec">'+info.count+' · '+(info.widening||0)+' wid.</div><div class="gcebar"><div class="gcebarfill" style="width:'+pct+'%;background:'+col+'"></div></div></div>';}).join('');document.getElementById('glist').innerHTML=!gs.length?'<div class="empty">No open gaps</div>':gs.map(g=>{const col=g.status==='widening'?'var(--red)':g.status==='narrowing'?'var(--grn)':'var(--yel)';return'<div class="grow"><span class="gtype" style="color:'+col+'">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore" style="color:'+col+'">'+((g.score||0)*100).toFixed(0)+'%</span></div>';}).join('');}
async function loadPA(){const r=await fetch('/pa?limit=15').then(x=>x.json());const ss=r.sessions||[];document.getElementById('palist').innerHTML=!ss.length?'<div class="empty">No PA sessions yet</div>':ss.map(s=>{const hs=Array.isArray(s.hypotheses)?s.hypotheses:[];return'<div class="pacard"><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px"><span style="font-size:.65rem;color:var(--muted)">'+ft(s.ts)+'</span><span style="font-size:.65rem;color:var(--acc);margin-left:auto">'+(s.provider||'—')+'</span></div><div class="pamets">'+[['Tokens',s.total_tokens||0],['Tok/s',(s.tps_avg||0).toFixed(1)],['Pauses',s.pause_count||0],['Entropy',(s.entropy_avg||0).toFixed(2)]].map(([l,v])=>'<div class="pamet"><div class="pamv">'+v+'</div><div class="paml">'+l+'</div></div>').join('')+'</div>'+hs.slice(0,3).map(h=>'<div class="pahyp"><div class="pahyl">'+esc(h.label||'')+'</div><div class="pahyc">'+((h.confidence||0)*100).toFixed(0)+'%</div><div class="pabar"><div class="pabarf" style="width:'+((h.confidence||0)*100)+'%"></div></div></div>').join('')+'</div>';}).join('');}
async function loadSess(){const r=await fetch('/sessions?limit=30').then(x=>x.json());const ss=r.sessions||[];document.getElementById('sesslist').innerHTML=!ss.length?'<div class="empty">No sessions yet</div>':ss.map(s=>'<div style="background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px;display:flex;gap:8px;align-items:center"><span style="font-size:.76rem;font-weight:700;color:var(--acc)">'+esc(s.name||'Unnamed')+'</span><span style="font-size:.62rem;color:var(--muted)">'+(s.provider||'—')+'</span><span style="font-size:.62rem;color:#1a3040;margin-left:auto">'+ft(s.updated_ts||s.started_ts)+'</span><button class="btn" onclick="window.open(\''+esc(s.chat_url||'')+'\',\'_blank\')">↗</button></div>').join('');}
async function loadAgents(){const[pr,jr]=await Promise.all([fetch('/providers').then(x=>x.json()),fetch('/jobs?limit=8').then(x=>x.json())]);const prov=pr.providers||{},jobs=jr.jobs||[];document.getElementById('provlist').innerHTML=Object.entries(prov).map(([n,s])=>'<div class="pc"><span style="font-size:.76rem;font-weight:700;width:72px">'+n+'</span><span class="ps '+(s==='connected'?'on':'off')+'">'+s+'</span><button class="btn" onclick="fetch(\'/providers/'+n+'/claim\',{method:\'POST\'})">Claim</button><button class="btn" onclick="fetch(\'/providers/'+n+'/release\',{method:\'POST\'})">Release</button></div>').join('');document.getElementById('joblist').innerHTML=!jobs.length?'<div style="color:var(--muted);font-size:.7rem">No recent jobs</div>':jobs.map(j=>'<div class="jcard"><div class="jhdr"><span class="jid">#'+(j.id||'').slice(0,8)+'</span><span style="font-size:.66rem;font-weight:700;color:'+(j.provider==='claude'?'#a78bfa':'#34d399')+'">'+(j.provider||'—')+'</span><span class="jst '+(j.status||'pending')+'">'+(j.status||'—')+'</span><span style="margin-left:auto;font-size:.6rem;color:#1a3040">'+ft(j.started_ts)+'</span></div><div style="font-size:.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((j.prompt||'').slice(0,70))+'</div></div>').join('');}
const SMETA={session_greeting_enabled:{label:'Session Greeting',type:'toggle',desc:'Auto-inject on new chats'},session_greeting_text:{label:'Greeting Text',type:'textarea',desc:'Prompt injected into blank chats'},scan_debounce_ms:{label:'Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'DOM scan delay'},artifact_max:{label:'Artifact Limit',type:'range',min:100,max:5000,step:100,unit:'',desc:'Max artifacts in memory'},gap_min_score:{label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude'},pa_enabled:{label:'Prompt Archaeology',type:'toggle',desc:'Enable PA analysis'},memory_auto_push:{label:'Auto Memory Push',type:'toggle',desc:'Push artifacts to memory'},dropzone_auto_upload:{label:'Auto Dropzone Upload',type:'toggle',desc:'Upload artifacts to file server'},stream_log_level:{label:'SISO Log Level',type:'select',options:['OFF','EVENTS','DEEP','DATA'],desc:'Event bus verbosity'},greeting_delay_ms:{label:'Greeting Delay',type:'range',min:500,max:5000,step:100,unit:'ms',desc:'Delay before greeting inject'},poll_interval_ms:{label:'Poll Interval',type:'range',min:100,max:2000,step:100,unit:'ms',desc:'Response check interval'},stable_count_threshold:{label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls before job complete'}};
async function loadSettings(){const r=await fetch('/settings').then(x=>x.json());const cs=r.settings||{};document.getElementById('sgrid').innerHTML=Object.entries(SMETA).map(([key,m])=>{const val=cs[key]??'';let ctrl='';if(m.type==='toggle'){ctrl='<div style="display:flex;align-items:center;gap:6px"><label class="tgl"><input type="checkbox" id="s_'+key+'" '+(val==='true'?'checked':'')+' onchange="sv(\''+key+'\',this.checked?\'true\':\'false\')"><span class="tsl"></span></label><span style="font-size:.7rem;color:var(--muted)">'+(val==='true'?'ON':'OFF')+'</span></div>';}else if(m.type==='range'){ctrl='<div><input type="range" id="s_'+key+'" min="'+m.min+'" max="'+m.max+'" step="'+m.step+'" value="'+val+'" oninput="document.getElementById(\'sv_'+key+'\').textContent=this.value+\''+(m.unit||'')+'\'" onchange="sv(\''+key+'\',this.value)"> <span id="sv_'+key+'" style="font-size:.7rem;color:var(--acc)">'+val+(m.unit||'')+'</span></div>';}else if(m.type==='select'){ctrl='<select id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+(m.options||[]).map(o=>'<option '+(o===val?'selected':'')+' value="'+o+'">'+o+'</option>').join('')+'</select>';}else if(m.type==='textarea'){ctrl='<textarea id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+esc(val)+'</textarea>';}else{ctrl='<input type="text" id="s_'+key+'" value="'+esc(val)+'" onchange="sv(\''+key+'\',this.value)">';}return'<div class="sc"><div class="sk">'+key+'</div><div class="sl2">'+m.label+'</div><div class="sd2">'+m.desc+'</div>'+ctrl+'</div>';}).join('');}
async function sv(key,value){await fetch('/settings/'+key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})});}
async function resetS(){if(!confirm('Reset all settings to defaults?'))return;await fetch('/settings/reset',{method:'POST'});loadSettings();}
function fgtype(type){fetch('/gaps?type='+type+'&limit=50').then(x=>x.json()).then(r=>{document.getElementById('glist').innerHTML=(r.gaps||[]).map(g=>'<div class="grow"><span class="gtype">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore">'+((g.score||0)*100).toFixed(0)+'%</span></div>').join('');});}
const CMDS=[
  {l:'jobs',c:'jobs'},{l:'jobs pending',c:'jobs --status pending'},
  {l:'artifacts',c:'artifacts'},{l:'gaps open',c:'gaps --status open'},
  {l:'sessions',c:'sessions'},{l:'providers',c:'providers'},
  {l:'health',c:'health'},{l:'stats',c:'stats'},
  {l:'ledger',c:'ledger'},{l:'settings',c:'settings'},
  {l:'seam queues',c:'seam queues'},{l:'version',c:'version'},
  {l:'bus',c:'bus'},{l:'send claude <prompt>',c:'send claude '},
];
document.getElementById('ccmds').innerHTML=CMDS.map(c=>'<button class="btn" onclick="runCLI(\''+c.c+'\')">'+c.l+'</button>').join('');
const cin=document.getElementById('cli-in'),cout=document.getElementById('cli-out');
cin.onkeydown=e=>{if(e.key==='Enter'){runCLI(cin.value);cin.value='';}if(e.key==='ArrowUp'){ci=Math.min(ci+1,ch.length-1);cin.value=ch[ci]||'';}if(e.key==='ArrowDown'){ci=Math.max(ci-1,-1);cin.value=ci>=0?ch[ci]:'';}};
async function runCLI(cmd){
  if(!cmd.trim())return;
  ch.unshift(cmd);ci=-1;
  clog('> guardian ' + cmd);
  try {
    // All commands go through /cli/exec — single source of truth (§LAW II)
    // Server writes to ledger, broadcasts via SSE
    const r = await fetch('/cli/exec',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({command:cmd, source:'cockpit'})
    }).then(x=>x.json());
    if(r.error) { clog('[error] ' + r.error); return; }
    if(r.result) clog(JSON.stringify(r.result, null, 2));
    else clog(JSON.stringify(r, null, 2));
  } catch(e) { clog('[error] ' + e.message); }
}
function parseFL(args){const fl={};for(let i=0;i<args.length;i+=2){const k=args[i]?.replace(/^--/,''),v=args[i+1];if(k&&v&&!v.startsWith('--'))fl[k]=v;else if(k&&(!v||v.startsWith('--'))){fl[k]='true';i--;}}return fl;}
function clog(t){cout.textContent+=t+'\n';cout.scrollTop=cout.scrollHeight;}
loadPS();loadDB();updateSB();setInterval(loadPS,5000);setInterval(loadDB,15000);
</script>
</body>
</html>`;
}

// ── SISO gate wiring moved to _handleNCPMessage (NCP is the transport — no WSS) ──
// GUARDIAN_ARTIFACT, GUARDIAN_GAPS, GUARDIAN_COMPLETE, GUARDIAN_PA_SESSION,
// GUARDIAN_LEDGER_EVENT, GUARDIAN_FILE_UPLOAD, GUARDIAN_DOWNLOAD
// are all handled in the switch statement above via POST /result (NCP).

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH HTTP SERVER — inject extended routes
// ══════════════════════════════════════════════════════════════════════════════

const _origListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
  // NCP SSE channel must NOT have CORS headers pre-set (they set their own)
  // All other routes get CORS headers
  const isNCP = url.pathname === '/channel' || url.pathname === '/result' || url.pathname === '/heartbeat';
  if (!isNCP) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
  }
  if (req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if (handleExtendedRoutes(req,res,url,req.method)) return;
  for (const listener of _origListeners) listener.call(server,req,res);
});

// ── MEMORY SERVER (inline — port 7823) ────────────────────────────────────────
//
//  Persistent artifact + event store.  LAN-accessible.
//  All data written to ./memory_store/ as flat JSON.
//
//  POST /ingest              push any event (ARTIFACT, LEDGER, DOWNLOAD, JOB_*)
//  GET  /artifacts           list artifacts  (?lang=ts&limit=50&after=<ts>)
//  GET  /artifacts/:hash     get one artifact
//  DELETE /artifacts/:hash   remove artifact
//  GET  /query?q=...         full-text search
//  GET  /context             full bundle for agent injection
//  GET  /ledger              event ledger
//  GET  /downloads           detected downloads
//  GET  /stats               store stats
//  GET  /health              health check
//  GET  /                    live dashboard UI

function startMemoryServer() {
  const MEMORY_PORT  = process.env.MEMORY_PORT  || 7823;
  const MEMORY_HOST  = '0.0.0.0';
  const STORE_DIR    = process.env.MEMORY_STORE_DIR || path.join(__dirname, 'memory_store');
  const MAX_ARTIFACTS = 10000;
  const MAX_LEDGER    = 5000;

  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

  // ── Persistence ─────────────────────────────────────────────────────────────

  function storeFile(name) { return path.join(STORE_DIR, `${name}.json`); }

  function loadStore(name, fallback) {
    try {
      const f = storeFile(name);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { console.error(`[memory] load(${name}): ${e.message}`); }
    return fallback;
  }

  function saveStore(name, data) {
    try { fs.writeFileSync(storeFile(name), JSON.stringify(data), 'utf8'); }
    catch (e) { console.error(`[memory] save(${name}): ${e.message}`); }
  }

  let memArtifacts = loadStore('artifacts', []);
  let memLedger    = loadStore('ledger',    []);
  let memDownloads = loadStore('downloads', []);
  let memJobs      = loadStore('jobs',      []);

  const memSaveTimers = {};
  function memSave(name, data) {
    clearTimeout(memSaveTimers[name]);
    memSaveTimers[name] = setTimeout(() => saveStore(name, data), 2000);
  }

  // ── Hash ─────────────────────────────────────────────────────────────────────

  function memHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16).slice(0, 8);
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────

  function memIngest(event) {
    const { type, payload, source, chatUrl, account, chatId } = event;
    const ts = event.ts || Date.now();

    if (type === 'ARTIFACT' || type === 'ARTIFACT_MANUAL_PUSH') {
      if (!payload?.content) return { ok: false, error: 'No content' };
      const hash = payload.hash || memHash(payload.content);
      const existing = memArtifacts.find(a => a.hash === hash);
      if (existing) {
        existing.lastSeen = ts;
        existing.seenCount = (existing.seenCount || 1) + 1;
        memSave('artifacts', memArtifacts);
        return { ok: true, hash, action: 'updated', id: existing.id };
      }
      const entry = {
        id:        payload.id || randomUUID(),
        hash,
        name:      payload.name      || 'artifact',
        type:      payload.type      || 'code_block',
        lang:      payload.lang      || null,
        content:   (payload.content  || '').slice(0, 8000),
        context:   (payload.context  || '').slice(0, 400),
        chatUrl:   payload.chatUrl   || chatUrl || '',
        chatId:    payload.chatId    || chatId  || '',
        account:   payload.account   || account || '',
        jobId:     payload.jobId     || null,
        direction: payload.direction || 'output',
        ts, lastSeen: ts, seenCount: 1,
        source:    source || 'guardian',
        tags:      [],
      };
      memArtifacts.unshift(entry);
      if (memArtifacts.length > MAX_ARTIFACTS) memArtifacts.pop();
      memSave('artifacts', memArtifacts);
      console.log(`[memory] artifact: ${entry.name} (${entry.lang || entry.type}) ${entry.content.length}ch`);
      return { ok: true, hash, action: 'created', id: entry.id };
    }

    if (type === 'LEDGER') {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id: randomUUID(), ts,
        category: payload.category || 'EVENT',
        msg:      payload.msg      || '',
        meta:     payload.meta     || {},
        chatUrl:  chatUrl || payload.chatUrl || '',
        account:  account || payload.account || '',
        source:   source || 'guardian',
      };
      memLedger.unshift(entry);
      if (memLedger.length > MAX_LEDGER) memLedger.pop();
      memSave('ledger', memLedger);
      return { ok: true, id: entry.id };
    }

    if (type === 'DOWNLOAD') {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id: payload.id || randomUUID(), ts,
        filename: payload.filename || 'download',
        href:     payload.href     || '',
        chatUrl:  payload.chatUrl  || chatUrl || '',
        chatId:   payload.chatId   || chatId  || '',
        account:  payload.account  || account || '',
        jobId:    payload.jobId    || null,
        source:   source || 'guardian',
      };
      memDownloads.unshift(entry);
      if (memDownloads.length > 500) memDownloads.pop();
      memSave('downloads', memDownloads);
      return { ok: true, id: entry.id };
    }

    if (type === 'JOB_START') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      if (!memJobs.find(j => j.id === payload.jobId)) {
        memJobs.unshift({ id: payload.jobId, status: 'started', prompt: (payload.prompt || '').slice(0, 500), chatUrl: chatUrl || '', account: account || '', ts, source: source || 'guardian' });
        if (memJobs.length > 500) memJobs.pop();
        memSave('jobs', memJobs);
      }
      return { ok: true };
    }

    if (type === 'JOB_COMPLETE') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      const job = memJobs.find(j => j.id === payload.jobId);
      if (job) { job.status = 'complete'; job.completedAt = ts; job.chars = payload.chars; }
      memSave('jobs', memJobs);
      return { ok: true };
    }

    if (type === 'FILE_UPLOAD') {
      return memIngest({ ...event, type: 'LEDGER', payload: { category: 'INPUT', msg: `Upload: ${(payload?.files || []).map(f => f.name).join(', ')}`, meta: payload } });
    }

    // Generic → ledger
    return memIngest({ ...event, type: 'LEDGER', payload: { category: 'EVENT', msg: type, meta: payload || {} } });
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  function memQuery(q, limit = 50) {
    if (!q) return { artifacts: [], ledger: [], downloads: [] };
    const ql = q.toLowerCase();
    const score = a => {
      let s = 0;
      if ((a.name    || '').toLowerCase().includes(ql)) s += 10;
      if ((a.lang    || '').toLowerCase() === ql)       s += 8;
      if ((a.content || '').toLowerCase().includes(ql)) s += 3;
      if ((a.context || '').toLowerCase().includes(ql)) s += 2;
      s += Math.max(0, 5 - (Date.now() - a.ts) / 3600000 * 0.1);
      return s;
    };
    return {
      artifacts: memArtifacts.filter(a =>
        (a.name||'').toLowerCase().includes(ql) || (a.lang||'').toLowerCase().includes(ql) ||
        (a.content||'').toLowerCase().includes(ql) || (a.account||'').toLowerCase().includes(ql)
      ).slice(0, limit).map(a => ({ ...a, content: (a.content||'').slice(0, 500), _score: score(a) })).sort((a,b) => b._score - a._score),
      ledger: memLedger.filter(l => (l.msg||'').toLowerCase().includes(ql)).slice(0, limit),
      downloads: memDownloads.filter(d => (d.filename||'').toLowerCase().includes(ql)).slice(0, limit),
    };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────

  function memStats() {
    const langs = {}, accounts = {}, types = {};
    for (const a of memArtifacts) {
      if (a.lang)    langs[a.lang]       = (langs[a.lang]       || 0) + 1;
      if (a.account) accounts[a.account] = (accounts[a.account] || 0) + 1;
      if (a.type)    types[a.type]       = (types[a.type]       || 0) + 1;
    }
    return {
      artifacts:         memArtifacts.length,
      ledger:            memLedger.length,
      downloads:         memDownloads.length,
      jobs:              memJobs.length,
      totalContentBytes: memArtifacts.reduce((n,a) => n + (a.content?.length||0), 0),
      langs:    Object.entries(langs).sort((a,b)=>b[1]-a[1]).slice(0,20),
      accounts: Object.entries(accounts).sort((a,b)=>b[1]-a[1]),
      types:    Object.entries(types).sort((a,b)=>b[1]-a[1]),
      uptime:   process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed/1024/1024),
      storeDir: STORE_DIR,
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  function memDashboard() {
    const ips   = getLocalIPs();
    const stats = memStats();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Memory</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#030508;--s1:#080d12;--s2:#0d1318;--border:#0f2030;--text:#c8e0f0;--muted:#3a5060;--mono:'SF Mono','Fira Code',monospace;--accent:#00c8ff}
body{background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;overflow-x:hidden}
.grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px);background-size:36px 36px}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.4;animation:scan 5s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{position:relative;z-index:10;max-width:1400px;margin:0 auto;padding:1.5rem}
h1{font-size:clamp(1.2rem,3vw,2rem);letter-spacing:.15em;color:var(--accent);text-shadow:0 0 20px rgba(0,200,255,.4);margin-bottom:1.5rem}
h1 small{color:var(--muted);font-size:.45em;display:block;letter-spacing:.1em;margin-top:4px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:1.5rem}
.stat{background:var(--s1);border:1px solid var(--border);padding:8px 12px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)}
.stat-v{color:var(--accent);font-size:1.2rem;font-weight:600}
.stat-l{color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:900px){.panels{grid-template-columns:1fr}}
.panel{background:var(--s1);border:1px solid var(--border)}
.panel-h{padding:.6rem 1rem;border-bottom:1px solid var(--border);background:var(--s2);display:flex;align-items:center;justify-content:space-between}
.panel-t{font-size:.6rem;text-transform:uppercase;letter-spacing:.15em;color:var(--accent)}
.panel-b{padding:.75rem 1rem;max-height:340px;overflow-y:auto}
.panel-b::-webkit-scrollbar{width:4px}
.panel-b::-webkit-scrollbar-thumb{background:var(--border)}
.search{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:var(--mono);font-size:.78rem;outline:none;margin-bottom:.75rem}
.search:focus{border-color:rgba(0,200,255,.4)}
.lang-bar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:.75rem}
.lc{background:var(--s2);border:1px solid var(--border);color:var(--muted);padding:2px 7px;font-size:.62rem;cursor:pointer}
.lc:hover,.lc.on{border-color:var(--accent);color:var(--accent)}
.art-row{padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer}
.art-row:hover{background:rgba(0,200,255,.03);margin:0 -1rem;padding:5px 1rem}
.art-name{color:var(--text);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art-meta{color:var(--muted);font-size:.62rem;display:flex;gap:.5rem;flex-wrap:wrap;margin-top:2px}
.art-meta .lang{color:var(--accent);opacity:.7}
.art-expand{padding:6px;background:var(--bg);border:1px solid var(--border);margin-top:4px;font-size:.68rem;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;color:#64748b}
.led-row{padding:3px 0;border-bottom:1px solid var(--border);display:flex;gap:8px}
.led-ts{color:#1e293b;font-size:.62rem;flex-shrink:0;width:60px}
.led-cat{font-size:.62rem;font-weight:700;flex-shrink:0;width:50px}
.led-msg{color:#64748b;font-size:.72rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{color:var(--muted);text-align:center;padding:2rem;font-size:.78rem}
footer{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:.62rem;color:var(--muted)}
footer span{color:var(--accent)}
</style>
</head>
<body>
<div class="grid"></div><div class="scan"></div>
<div class="app">
  <h1>Guardian Memory <small>Persistent AI Interaction Store · v1.0.0 · Port ${MEMORY_PORT}</small></h1>
  <div class="stats" id="stats"></div>
  <div class="panels">
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Artifacts</span><span id="ac" style="color:var(--muted);font-size:.65rem"></span></div>
      <div class="panel-b">
        <input class="search" id="asrch" placeholder="Search artifacts…" oninput="fa()">
        <div class="lang-bar" id="lbar"></div>
        <div id="alist"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Ledger</span><span id="lc2" style="color:var(--muted);font-size:.65rem"></span></div>
      <div class="panel-b">
        <input class="search" id="lsrch" placeholder="Search events…" oninput="fl()">
        <div id="llist"></div>
      </div>
    </div>
  </div>
  <footer>
    <span>Guardian Memory · IPs: <span>${ips.map(i=>i.address).join(' · ') || 'localhost'}</span></span>
    <span id="upt"></span>
  </footer>
</div>
<script>
let arts=[],leds=[],aLang='',aExp=new Set();
const LCAT={OUTPUT:'#a78bfa',INPUT:'#60a5fa',EVENT:'#94a3b8',GAP:'#f472b6',UPGRADE:'#34d399',SYSTEM:'#818cf8'};
const ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',py:'🐍',html:'🌐',css:'🎨',json:'📋',md:'📝',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fts(ts){return new Date(ts).toLocaleTimeString()}
function fsz(n){if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(1)+'KB';return(n/1048576).toFixed(1)+'MB'}
async function load(){
  const[sr,lr]=await Promise.all([fetch('/memory/artifacts?limit=500').then(r=>r.json()),fetch('/memory/ledger?limit=200').then(r=>r.json())]);
  arts=sr.artifacts||[];leds=lr.ledger||[];
  ls();lb();fa();fl();
}
async function ls(){
  const r=await fetch('/memory/stats').then(x=>x.json()),s=r.stats;
  document.getElementById('stats').innerHTML=
    st(s.artifacts,'Artifacts')+st(s.ledger,'Events')+st(s.downloads,'Downloads')+
    st(s.jobs,'Jobs')+st(fsz(s.totalContentBytes||0),'Content')+
    st(s.memoryMB+'MB','Heap')+st(Math.floor(s.uptime/60)+'m','Uptime');
}
function st(v,l){return'<div class="stat"><div class="stat-v">'+v+'</div><div class="stat-l">'+l+'</div></div>'}
function lb(){
  const ls=[...new Set(arts.map(a=>a.lang).filter(Boolean))];
  document.getElementById('lbar').innerHTML='<span class="lc'+(aLang===''?' on':'')+'" onclick="sl(\'\')">all</span>'+ls.map(l=>'<span class="lc'+(aLang===l?' on':'')+'" onclick="sl(\''+l+'\')">'+l+'</span>').join('');
}
function sl(l){aLang=l;lb();fa()}
function fa(){
  const q=(document.getElementById('asrch').value||'').toLowerCase();
  let list=arts.filter(a=>(!aLang||a.lang===aLang)&&(!q||(a.name||'').toLowerCase().includes(q)||(a.lang||'').toLowerCase().includes(q)||(a.content||'').toLowerCase().includes(q)));
  document.getElementById('ac').textContent=list.length+' results';
  document.getElementById('alist').innerHTML=list.length===0?'<div class="empty">No artifacts</div>':list.slice(0,100).map(a=>{
    const ic=ICONS[a.lang]||'◻',exp=aExp.has(a.hash);
    return'<div class="art-row" onclick="ta(\''+a.hash+'\')"><div class="art-name">'+ic+' '+esc(a.name||'artifact')+'</div><div class="art-meta">'+(a.lang?'<span class="lang">'+a.lang+'</span>':'')+(a.account?'<span>'+esc(a.account.slice(0,28))+'</span>':'')+'<span>'+fts(a.ts)+'</span><span>'+fsz(a.content?.length||0)+'</span></div>'+(exp?'<pre class="art-expand">'+esc((a.content||'').slice(0,800))+'</pre>':'')+'</div>';
  }).join('');
}
function ta(h){if(aExp.has(h))aExp.delete(h);else aExp.add(h);fa()}
function fl(){
  const q=(document.getElementById('lsrch').value||'').toLowerCase();
  let list=leds.filter(l=>!q||(l.msg||'').toLowerCase().includes(q));
  document.getElementById('lc2').textContent=list.length+' events';
  document.getElementById('llist').innerHTML=list.length===0?'<div class="empty">No events</div>':list.slice(0,80).map(l=>'<div class="led-row"><span class="led-ts">'+fts(l.ts)+'</span><span class="led-cat" style="color:'+(LCAT[l.category]||'#94a3b8')+'">'+l.category+'</span><span class="led-msg">'+esc(l.msg)+'</span></div>').join('');
}
function tick(){document.getElementById('upt').textContent='Last refresh: '+new Date().toLocaleTimeString()}
setInterval(()=>{load();tick()},10000);load();tick();
</script>
</body>
</html>`;
  }

  // ── HTTP server ───────────────────────────────────────────────────────────────

  function memRespond(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function memBodyJson(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
      req.on('error', reject);
    });
  }

  const memServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url   = new URL(req.url, `http://localhost:${MEMORY_PORT}`);
    // Strip leading /memory prefix if called via guardian HTTP proxy
    const rawPath = url.pathname.replace(/^\/memory/, '') || '/';
    const parts = rawPath.split('/').filter(Boolean);
    const method = req.method;

    // Dashboard
    if (method === 'GET' && parts.length === 0) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      res.end(memDashboard()); return;
    }

    // POST /ingest
    if (method === 'POST' && parts[0] === 'ingest') {
      try { const body = await memBodyJson(req); memRespond(res, 200, memIngest(body)); }
      catch(e) { memRespond(res, 400, { ok: false, error: e.message }); }
      return;
    }

    // POST /artifacts  (manual push)
    if (method === 'POST' && parts[0] === 'artifacts') {
      try { const body = await memBodyJson(req); memRespond(res, 200, memIngest({ type: 'ARTIFACT', payload: body })); }
      catch(e) { memRespond(res, 400, { ok: false, error: e.message }); }
      return;
    }

    // GET /artifacts
    if (method === 'GET' && parts[0] === 'artifacts' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'100'), 500);
      const lang   = url.searchParams.get('lang');
      const after  = parseInt(url.searchParams.get('after')||'0');
      let list = memArtifacts;
      if (lang)  list = list.filter(a => a.lang === lang);
      if (after) list = list.filter(a => a.ts > after);
      memRespond(res, 200, { ok: true, count: list.length, artifacts: list.slice(0, limit) }); return;
    }

    // GET /artifacts/:hash
    if (method === 'GET' && parts[0] === 'artifacts' && parts[1]) {
      const found = memArtifacts.find(a => a.hash === parts[1] || a.id === parts[1]);
      if (!found) { memRespond(res, 404, { ok: false, error: 'Not found' }); return; }
      memRespond(res, 200, { ok: true, artifact: found }); return;
    }

    // DELETE /artifacts/:hash
    if (method === 'DELETE' && parts[0] === 'artifacts' && parts[1]) {
      const idx = memArtifacts.findIndex(a => a.hash === parts[1] || a.id === parts[1]);
      if (idx === -1) { memRespond(res, 404, { ok: false, error: 'Not found' }); return; }
      memArtifacts.splice(idx, 1);
      memSave('artifacts', memArtifacts);
      memRespond(res, 200, { ok: true }); return;
    }

    // GET /query?q=...
    if (method === 'GET' && parts[0] === 'query') {
      const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
      if (!q) { memRespond(res, 400, { ok: false, error: 'Missing q' }); return; }
      memRespond(res, 200, { ok: true, query: q, results: memQuery(q, parseInt(url.searchParams.get('limit')||'50')) }); return;
    }

    // GET /ledger
    if (method === 'GET' && parts[0] === 'ledger') {
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'100'), 500);
      memRespond(res, 200, { ok: true, count: memLedger.length, ledger: memLedger.slice(0, limit) }); return;
    }

    // GET /downloads
    if (method === 'GET' && parts[0] === 'downloads') {
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'50'), 200);
      memRespond(res, 200, { ok: true, count: memDownloads.length, downloads: memDownloads.slice(0, limit) }); return;
    }

    // GET /context
    if (method === 'GET' && parts[0] === 'context') {
      const chatId = url.searchParams.get('chatId');
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'), 200);
      const list   = chatId ? memArtifacts.filter(a => a.chatId === chatId) : memArtifacts.slice(0, limit);
      memRespond(res, 200, { ok: true, ts: Date.now(), artifacts: list, recentLedger: memLedger.slice(0,20), recentDownloads: memDownloads.slice(0,10), stats: memStats() }); return;
    }

    // GET /stats
    if (method === 'GET' && parts[0] === 'stats') {
      memRespond(res, 200, { ok: true, stats: memStats() }); return;
    }

    // GET /health
    if (method === 'GET' && parts[0] === 'health') {
      memRespond(res, 200, { ok: true, uptime: process.uptime(), artifacts: memArtifacts.length, ledger: memLedger.length, downloads: memDownloads.length, port: MEMORY_PORT, ips: getLocalIPs() }); return;
    }

    memRespond(res, 404, { ok: false, error: 'Not found' });
  });

  memServer.listen(MEMORY_PORT, MEMORY_HOST, () => {
    const ips = getLocalIPs();

  });

  memServer.on('error', err => {
    console.error(`[memory] ERROR: ${err.message}`);
    if (err.code === 'EADDRINUSE') console.error(`[memory] Port ${MEMORY_PORT} in use — set MEMORY_PORT env var`);
  });

  // Also proxy /memory/* routes through the main HTTP server (port 7820)
  // so everything is reachable from one port if needed
  // ── JaaStore proxy — memory server is the authoritative storage layer ──────
  // When memIngest is called (from WS, userscripts, or the /memory/ingest API),
  // the data also flows into JaaStore so it's available via the main API.
  // This is the integration point: one ingest path, two read surfaces.
  const _origIngest = memIngest;
  function memIngestHooked(event) {
    const result = _origIngest(event);
    // Mirror into JaaStore tables so /artifacts, /gaps, /ledger routes are current
    try {
      const { type, payload, source, chatUrl, account, chatId } = event;
      const ts = event.ts || Date.now();
      if ((type === 'ARTIFACT' || type === 'ARTIFACT_MANUAL_PUSH') && payload?.content) {
        // Gate handles this — but if it came via HTTP POST /memory/ingest (not WS), do it here
        if (source && source.includes('userscript')) {
          bus.emit('guardian.artifact', { ...payload, chatUrl: payload.chatUrl||chatUrl, account: payload.account||account, chatId: payload.chatId||chatId, provider: payload.provider||'claude' });
        }
      }
      if (type === 'LEDGER' && payload) {
        if (source && source.includes('userscript')) {
          bus.emit('guardian.ledger', { ...payload, chatUrl, account, source: source||'memory-hook' });
        }
      }
    } catch (_) {}
    return result;
  }

  return { server: memServer, ingest: memIngestHooked, query: memQuery, stats: memStats };
}

const memoryServer = startMemoryServer();

// ── Wire GUARDIAN_ARTIFACT / LEDGER events into memory store ──────────────────
//
//  Any artifact or ledger event that hits the WSS is also forwarded into memory.
//  This means the userscript doesn't need to make a separate HTTP call —
//  guardian already has the data, memory just indexes it.

// [WSS handler removed — NCP is the transport]

module.exports = { server, wss, ncp, jobs, PROVIDERS, dropzoneServer, dropzone, memoryServer };
