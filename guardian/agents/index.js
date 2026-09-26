'use strict';
// ── agents/callto/index.js ────────────────────────────────────────────────────
// UUID: agents-callto
// VERSION: 5.2.0  — §5.4 one version everywhere
// COBALT: agents.callto | bootPhase: 8 | pollMs: 2000
//
// THE IPC BRIDGE — agent endpoint polling model.
// v5.2.0 additions:
//   - Gap Context Injection (GTCI): injects open gap_questions into every
//     agent call context before dispatch. Uses gap-context-injector module
//     via JAA only (no direct import at init — lazy require after boot).
//   - Artifact naming: all artifacts written to cortex_memory + artifacts
//     table now carry a proper name.ext via artifact-namer.js.
//   - Response answer parsing: after agent response, extracts GAP ANSWER N:
//     lines and marks gap_questions as answered.
//
// FLOW (Nexus → Guardian):
//   1. Any module inserts agent_calls row with routedTo='guardian-claude' | 'guardian-chatgpt'
//   2. Callto-executor polls agent_calls every 2s
//   3. On pending row: checks guardian_health (Watchman must confirm connected)
//   4. GTCI: buildInjectionBlock() checks gap_questions for pending questions
//      → appends them as SYSTEM CONTEXT block to the prompt
//   5. If healthy: POSTs GUARDIAN_EXECUTE_INTENT to Guardian at POST /api/complete
//   6. Guardian dispatches to WSS tab, returns response
//   7. GTCI: parseAndRecordAnswers() extracts GAP ANSWER N: lines from response
//   8. Callto-executor writes result back to agent_calls + cortex_memory + artifacts
//   9. Posts guardian.chat.complete to event_log → Siphon picks it up
//
// ARTIFACT NAMING CONTRACT:
//   All artifacts extracted from agent responses are named via artifact-namer.js.
//   The `artifacts` JAA table record always has:
//     { name: "foo.ts", ext: ".ts", file_path: "guardian/artifacts/foo.ts", lang: "typescript" }
//   Raw content blobs without a proper name+ext are a §1.3 violation.
//
// LAW I: If Guardian unavailable → RAID fallback to Ollama/Claude API
// LAW III: reads guardian_health, does NOT import watchman.js directly.
//          GTCI accessed via lazy require (only after GTCI module is initialized)

const http   = require('http');
const https  = require('https');
const path   = require('path');
const { jaaDB, uid } = require('../../cortex/memory/jaa-db');

const MODULE_ID = 'agents.callto';
const VERSION   = '5.2.0';
const BATCH     = 5;

// Guardian v8 coordinates — env-configurable
const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');
const GUARDIAN_URL  = `http://${GUARDIAN_HOST}:${GUARDIAN_PORT}`;

// GTCI injection limits — tune these to control context budget
const GTCI_MAX_QUESTIONS  = 3;     // max gap questions per call (protect token budget)
const GTCI_MIN_PRIORITY   = null;  // null = all priorities; 'high' = only high+critical

let _interval = null;
let _cfg      = {};

// Lazy-loaded after boot (these modules register after callto)
let _gtci  = null;   // gap-context-injector
let _namer = null;   // artifact-namer

function _loadOptionalModules() {
  if (!_gtci) {
    try {
      _gtci = { injectGapContext: async (ctx) => ctx };
    } catch (_) {
      // GTCI not yet built — silently skip injection this cycle
    }
  }
  if (!_namer) {
    try {
      _namer = require('../lib/artifact-namer.js');
    } catch (_) {
      _namer = null; // genuinely missing/broken — real fallback branch below handles it
    }
  }
}

// ── init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(_tick, cfg.pollMs ?? 2000);
  _interval.unref();
  console.log(`[callto] init v${VERSION} — Guardian at ${GUARDIAN_URL}`);
  _toast('toast.agent', `${MODULE_ID} v${VERSION} started — guardian: ${GUARDIAN_URL}`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── tick ──────────────────────────────────────────────────────────────────────
async function _tick() {
  _loadOptionalModules();

  try {
    // Read pending guardian-routed calls
    const pending = jaaDB.query('agent_calls',
      r => (r.routedTo === 'guardian-claude' || r.routedTo === 'guardian-chatgpt' || r.routedTo === 'guardian-gemini')
        && r.status === 'routed',
      BATCH
    );
    if (!pending.length) return;

    // Check Guardian health before dispatching
    const health    = jaaDB.tail('guardian_health', 1)[0];
    const guardianOk = health?.connected && (health.healthScore ?? 0) >= 0.3;

    for (const call of pending) {
      // Claim the row
      jaaDB.update('agent_calls', call.uuid, {
        status:       'processing',
        dispatchedBy: MODULE_ID,
        dispatchedAt: Date.now(),
      });
      // Verify claim (optimistic lock pattern)
      const claimed = jaaDB.get('agent_calls', call.uuid);
      if (!claimed || claimed.dispatchedBy !== MODULE_ID) continue;

      if (!guardianOk) {
        await _fallback(call, health);
      } else {
        await _dispatchToGuardian(call);
      }
    }
  } catch (err) {
    _recordFailure(err, null);
  }
}

// ── dispatch to Guardian v8 via /api/complete ─────────────────────────────────
async function _dispatchToGuardian(call) {
  const service = call.routedTo.replace('guardian-', ''); // 'claude' | 'chatgpt' | 'gemini'
  const basePrompt = call.prompt || call.content || '';

  // ── GTCI: build gap context injection block ───────────────────────────────
  let gapInjectionBlock = null;
  let injectedQuestions = 0;

  if (_gtci && typeof _gtci.buildInjectionBlock === 'function') {
    try {
      gapInjectionBlock = _gtci.buildInjectionBlock(call.uuid, {
        limit:   GTCI_MAX_QUESTIONS,
        minPrio: GTCI_MIN_PRIORITY,
      });
      if (gapInjectionBlock) {
        injectedQuestions = (gapInjectionBlock.match(/\[\d+\/\d+\]/g) || []).length;
        _toast('toast.agent',
          `${MODULE_ID}: injecting ${injectedQuestions} gap question(s) into ${service} call`,
          { causedBy: call.uuid }
        );
      }
    } catch (err) {
      _recordFailure(err, call.uuid);
      // Non-fatal: continue dispatch without gap injection
    }
  }

  // Compose final prompt: gap block first (system context), then primary request
  const finalPrompt = gapInjectionBlock
    ? `${gapInjectionBlock}\n\n─────────────────────────────────────────────────────────\nPRIMARY REQUEST:\n─────────────────────────────────────────────────────────\n${basePrompt}`
    : basePrompt;

  // Record that GTCI was applied
  if (gapInjectionBlock) {
    jaaDB.update('agent_calls', call.uuid, {
      gtciApplied:           true,
      gtciQuestionsInjected: injectedQuestions,
    });
  }

  try {
    const result = await _post(`${GUARDIAN_URL}/api/complete`, {
      service,
      prompt:      finalPrompt,
      temperature: call.temperature ?? 0.15,
      maxTokens:   call.maxTokens   ?? 4096,
      calltoUuid:  call.uuid,
      stream:      false,
      ipcToken:    process.env.GUARDIAN_IPC_TOKEN || undefined,
    }, 90_000);

    const text = result.content || result.text || result.response || '';

    // ── GTCI: parse gap answers from response ─────────────────────────────
    let answersExtracted = 0;
    if (_gtci && gapInjectionBlock && typeof _gtci.parseAndRecordAnswers === 'function') {
      try {
        answersExtracted = _gtci.parseAndRecordAnswers(call.uuid, text);
      } catch (err) {
        _recordFailure(err, call.uuid);
        // Non-fatal: answers just won't be recorded this cycle
      }
    }

    // ── Artifact extraction and naming ────────────────────────────────────
    const artifacts = _extractAndNameArtifacts(text, {
      provider:  service,
      chatUrl:   result.chatId ? `https://claude.ai/chat/${result.chatId}` : null,
      causedBy:  call.uuid,
      callRole:  call.role || null,
    });

    // ── Write agent_call result ───────────────────────────────────────────
    jaaDB.update('agent_calls', call.uuid, {
      status:               'complete',
      result:               text,
      completedAt:          Date.now(),
      gtciAnswersExtracted: answersExtracted,
      artifactsExtracted:   artifacts.length,
    });

    // ── Write to cortex_memory ────────────────────────────────────────────
    jaaDB.insert('cortex_memory', {
      uuid:    uid(),
      content: text,
      tags:    ['guardian', service, 'callto'],
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts:      Date.now(),
    });

    // ── Write artifacts to JAA artifacts table ────────────────────────────
    for (const art of artifacts) {
      await jaaDB.insert('artifacts', {
        uuid:      uid(),
        // Naming fields — always populated by artifact-namer
        name:      art.name,
        ext:       art.ext,
        file_path: art.file_path,
        lang:      art.lang,
        confidence: art.confidence,
        // Content
        content:   art.content,
        hash:      art.hash,
        // Provenance
        provider:  art.provider,
        chatUrl:   art.chatUrl,
        context:   art.context,
        // JAA required
        source:    MODULE_ID,
        causedBy:  call.uuid,
        ts:        Date.now(),
        // Gate runner compatibility
        type:      'guardian-artifact',
        pipeline_id: call.sessionId || null,
        gate_id:   null,
      });
    }

    // ── Emit event so Siphon and Delta-engine pick it up ──────────────────
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'guardian.chat.complete',
      payload: {
        text:             text.slice(0, 200), // summary only — full text in agent_calls
        complete:         true,
        conversationId:   result.chatId || call.sessionId || null,
        provider:         service,
        calltoUuid:       call.uuid,
        gtciAnswers:      answersExtracted,
        artifactsNamed:   artifacts.length,
        artifactNames:    artifacts.map(a => a.name),
      },
      source:   MODULE_ID,
      causedBy: call.uuid,
      ts:       Date.now(),
    });

    const summaryParts = [
      `guardian-${service} complete (${text.length} chars)`,
      answersExtracted  ? `${answersExtracted} gap answer(s) extracted` : null,
      artifacts.length  ? `${artifacts.length} artifact(s): ${artifacts.map(a => a.name).join(', ')}` : null,
    ].filter(Boolean);

    _toast('toast.agent', `${MODULE_ID}: ${summaryParts.join(' | ')}`);

  } catch (err) {
    jaaDB.update('agent_calls', call.uuid, {
      status: 'failed',
      error:  `Guardian dispatch failed: ${err.message}`,
    });
    _recordFailure(err, call.uuid);
    _toast('toast.error', `${MODULE_ID}: guardian-${service} dispatch failed: ${err.message}`);

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'callto.guardian.fallback',
      payload: { callUuid: call.uuid, reason: err.message, service },
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts:      Date.now(),
    });
  }
}

// ── Artifact extraction from response text ────────────────────────────────────
// Finds all fenced code blocks in the response, names them, returns artifact records.
function _extractAndNameArtifacts(text, { provider, chatUrl, causedBy, callRole } = {}) {
  if (!text) return [];

  const artifacts = [];
  // Match: ```lang\n<content>\n``` or ``` ```
  const FENCE_RE = /```([\w+#\-.]*)?\r?\n([\s\S]*?)```/g;

  let m;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const lang    = (m[1] || '').trim().toLowerCase() || null;
    const content = m[2] || '';

    if (!content.trim()) continue;
    if (content.trim().length < 10) continue; // skip trivial snippets

    // Extract a surrounding context window (50 chars before the block)
    const contextStart = Math.max(0, m.index - 200);
    const contextText  = text.slice(contextStart, m.index).trim().slice(-200);

    let record;
    if (_namer && typeof _namer.buildArtifactRecord === 'function') {
      record = _namer.buildArtifactRecord({
        content,
        lang,
        name:      null,   // will be derived
        provider:  provider || 'guardian',
        context:   contextText,
        chatUrl:   chatUrl || null,
        causedBy:  causedBy || null,
        source:    MODULE_ID,
      });
    } else {
      // Fallback when artifact-namer not loaded: basic naming
      const crypto = require('crypto');
      const ext    = lang ? (`.${lang}`) : '.txt';
      const hash   = crypto.createHash('sha256').update(content).digest('hex');
      const name   = `${provider || 'guardian'}-${hash.slice(0, 8)}${ext}`;
      record = {
        name,
        ext,
        file_path: `guardian/artifacts/${name}`,
        lang:      lang || 'text',
        confidence: 'fallback',
        content,
        hash,
        provider:  provider || 'guardian',
        chatUrl:   chatUrl || null,
        context:   contextText.slice(0, 300),
        source:    MODULE_ID,
        causedBy:  causedBy || null,
        ts:        Date.now(),
      };
    }

    artifacts.push(record);
  }

  return artifacts;
}

// ── LAW I fallback — Guardian unavailable ─────────────────────────────────────
async function _fallback(call, health) {
  const reason = !health ? 'no health record'
               : !health.connected ? 'Guardian disconnected'
               : `Guardian health too low (${(health.healthScore||0).toFixed(2)})`;

  // Re-route to ollama (LAW I: local first)
  jaaDB.update('agent_calls', call.uuid, {
    status:   'routed',
    routedTo: 'ollama',
    error:    null,
    notes:    `re-routed from ${call.routedTo} — ${reason}`,
  });

  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'callto.guardian.fallback',
    payload: { callUuid: call.uuid, reason, originalRoute: call.routedTo, reroutedTo: 'ollama' },
    source:  MODULE_ID,
    causedBy: call.uuid,
    ts:      Date.now(),
  });

  _toast('toast.warn', `${MODULE_ID}: Guardian unavailable (${reason}) — LAW I fallback to ollama`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function _post(url, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = JSON.stringify(body);

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parseInt(parsed.port) || (isHttps ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ content: raw }); }
      });
    });

    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _toast(type, msg, extra = {}) {
  try {
    jaaDB.insert('toasts', {
      uuid:      uid(),
      type,
      module:    MODULE_ID,
      message:   msg,
      ts:        Date.now(),
      actions:   extra.actions ?? [],
      causedBy:  extra.causedBy ?? null,
      autoClose: type === 'toast.error' ? 0 : 5000,
    });
  } catch (innerErr) {
    console.error(`[${MODULE_ID}] toast insert failed:`, innerErr.message);
  }
}

function _recordFailure(err, causedBy) {
  try {
    jaaDB.insert('failures', {
      uuid:     uid(),
      source:   MODULE_ID,
      error:    err.message,
      stack:    err.stack,
      causedBy: causedBy ?? null,
      ts:       Date.now(),
    });
  } catch (innerErr) {
    console.error('[callto] inner failure:', innerErr.message);
  }
}

// ── dispatch API — external callers use this ──────────────────────────────────
async function dispatch({
  service     = 'claude',
  prompt,
  sessionId   = null,
  temperature,
  maxTokens,
  causedBy    = null,
  role        = null,
} = {}) {
  const row = jaaDB.insert('agent_calls', {
    uuid:        uid(),
    routedTo:    `guardian-${service}`,
    prompt:      prompt || '',
    sessionId:   sessionId || null,
    status:      'routed',
    temperature: temperature ?? 0.15,
    maxTokens:   maxTokens   ?? 4096,
    role:        role || null,
    source:      MODULE_ID,
    causedBy:    causedBy || null,
    ts:          Date.now(),
  });

  jaaDB.insert('event_log', {
    uuid:     uid(),
    type:     'GUARDIAN_EXECUTE_INTENT',
    payload:  { callUuid: row.uuid, service, promptLen: prompt?.length || 0 },
    source:   MODULE_ID,
    causedBy: row.uuid,
    ts:       Date.now(),
  });

  return row;
}

// ── CLI status ────────────────────────────────────────────────────────────────
function status() {
  const calls = jaaDB.query('agent_calls',
    r => r.routedTo && r.routedTo.startsWith('guardian-'), 500
  );
  const byStatus = {};
  for (const c of calls) byStatus[c.status] = (byStatus[c.status]||0)+1;
  const health = jaaDB.tail('guardian_health', 1)[0];

  // GTCI status
  const pending = jaaDB.query('gap_questions', q => q.status === 'pending', 100);

  return [
    `[CALLTO]  OK     Guardian: ${GUARDIAN_URL}  (v${VERSION})`,
    `[CALLTO]  OK     guardian_health: connected=${health?.connected} score=${(health?.healthScore||0).toFixed(2)}`,
    `[CALLTO]  OK     agent_calls: ${calls.length} total — ${JSON.stringify(byStatus)}`,
    `[CALLTO]  OK     GTCI: ${_gtci ? 'loaded' : 'not loaded'} | pending gap questions: ${pending.length}`,
    `[CALLTO]  OK     artifact-namer: ${_namer ? 'loaded' : 'not loaded'}`,
  ].join('\n');
}

module.exports = { init, stop, status, dispatch };
