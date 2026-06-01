
// ════════════════════════════════════════════════════════════════════════════
// GUARDIAN v8.3 — NEXUS FULL PATCH
// UUID: guardian-v83-nexus-patch-v1-0-0
//
// Adds to guardian-claude-v8.3 userscript:
//   1. Cortex real-time sync (all events → 3748)
//   2. Tab discovery + auto-open if no tab found
//   3. Forge sync (seam progress → 4800)
//   4. GTCI context injection (gap questions prepended to prompt)
//   5. ChatGPT provider support (same contract)
//   6. Explicit data channel with handshake (GUARDIAN_INPUT → ACK)
//   7. Console in sync with agent chat via SSE
//
// HOW TO APPLY:
//   Add these functions to guardian-claude-v8.3.user.js
//   Replace: sendToServer(obj) calls with sendToServerAndCortex(obj)
//   Replace: handleJob injection with explicitInject(text, jobId)
//   Add: startConsoleSyncSSE() to the GUARDIAN_READY handler
//   Add: startCortexSync() to init()
// ════════════════════════════════════════════════════════════════════════════

const CORTEX_URL  = 'http://127.0.0.1:3748';
const FORGE_URL   = 'http://127.0.0.1:4800';
const CHATGPT_URLS = ['chat.openai.com', 'chatgpt.com'];

// ── 1. Cortex real-time sync ──────────────────────────────────────────────────
// Every event goes to cortex simultaneously with guardian server
function sendToServerAndCortex(obj) {
  // Send to Guardian server (7820) via WSS as before
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
  // ALSO send to Cortex (3748) in real-time
  sendToCortex(obj.type || 'guardian.event', obj);
}

function sendToCortex(type, data) {
  const body = JSON.stringify({ type, payload: data, source: 'guardian.userscript', ts: Date.now() });
  if (typeof GM_xmlhttpRequest !== 'undefined') {
    GM_xmlhttpRequest({ method: 'POST', url: `${CORTEX_URL}/guardian/event`, headers: { 'Content-Type': 'application/json' }, data: body, onerror: () => {} });
  } else {
    fetch(`${CORTEX_URL}/guardian/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  }
}

// Mirror all evLog calls to cortex
const _origEvLog = evLog;
function evLog(type, data = {}) {
  _origEvLog(type, data);
  if (!type.startsWith('dom.') && !type.startsWith('pa.chunk')) {
    sendToCortex(type, { ...data, chatId: chatIdFromUrl(), account: getAccount() });
  }
}

// ── 2. Tab discovery + auto-open ─────────────────────────────────────────────
// If no claimed tab found for a job, open one automatically
const openedTabs = new Map(); // provider → tab reference

async function discoverOrOpenTab(provider) {
  // Already claimed = good
  if (isClaimed) return true;

  // Check if another tab is claimed for this provider
  const claimedKey = `guardian_claimed_tab_${provider}`;
  if (localStorage.getItem(claimedKey)) {
    addLog('info', `Tab claimed by another window for ${provider}`);
    return false; // Let the claimed tab handle it
  }

  // No claimed tab — try to claim this one or open a new one
  if (location.hostname === providerHostname(provider)) {
    claimTab();
    return true;
  }

  // Wrong provider — open a new tab
  addLog('sys', `Opening new tab for ${provider}`);
  toast(`Opening ${provider} tab…`, 'info', 3000);
  evLog('tab.auto_open', { provider });

  try {
    const url = providerUrl(provider);
    const newTab = window.open(url, `_guardian_${provider}`);
    openedTabs.set(provider, newTab);
    // Wait for it to load and claim
    await new Promise(resolve => setTimeout(resolve, 3000));
    return false; // Will be handled by the new tab's Guardian instance
  } catch(e) {
    addLog('err', `Cannot open tab for ${provider}`, e.message);
    return false;
  }
}

function providerHostname(provider) {
  const map = { claude: 'claude.ai', chatgpt: 'chat.openai.com', gemini: 'gemini.google.com', ollama: 'localhost' };
  return map[provider] || provider;
}

function providerUrl(provider) {
  const map = { claude: 'https://claude.ai/new', chatgpt: 'https://chat.openai.com/', gemini: 'https://gemini.google.com/', ollama: 'http://localhost:11434' };
  return map[provider] || `https://${provider}`;
}

// ── 3. Explicit data channel with handshake ───────────────────────────────────
// GUARDIAN_INPUT → ACK → channel stays open → GUARDIAN_DONE closes it
async function openDataChannel(jobId, text) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) { resolve(false); return; }

    ws.send(JSON.stringify({
      type: 'GUARDIAN_INPUT', jobId, text,
      source: 'userscript.explicit',
      chatUrl: location.href, account: getAccount(), ts: Date.now(),
    }));

    // Also log to cortex immediately
    sendToCortex('guardian.input', { jobId, chars: text.length, source: 'userscript' });

    const handler = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'GUARDIAN_INPUT_ACK' && msg.jobId === jobId) {
        ws.removeEventListener('message', handler);
        addLog('ok', `Data channel OPEN`, `#${jobId.slice(0,8)} PENDING`);
        toast(`Data channel open · PENDING · #${jobId.slice(0,8)}`, 'job', 2000);
        evLog('data_channel.open', { jobId, status: 'pending' });
        resolve(true);
      }
    };
    ws.addEventListener('message', handler);
    setTimeout(() => { ws.removeEventListener('message', handler); resolve(false); }, 3000);
  });
}

// ── 4. GTCI — prepend gap questions to every prompt ───────────────────────────
async function buildGTCIContext(limit = 3) {
  try {
    const r = await fetch(`${API_URL}/gap-questions?status=pending`);
    if (!r.ok) return null;
    const data = await r.json();
    const questions = (data.gap_questions || []).slice(0, limit);
    if (!questions.length) return null;

    const blocks = questions.map((q, i) => `[${i+1}/${questions.length}] ${q.subject}\n\n${q.contextBlock}\n\n  Label your answer: "GAP ANSWER ${i+1}: <answer>"`).join('\n\n─────────────────────────────────────────\n\n');

    return `─────────────────────────────────────────────────────────\nNEXUS SYSTEM CONTEXT — OPEN GAPS REQUIRING AGENT INPUT\n(${questions.length} gap(s) injected — answer inline, clearly labelled)\n─────────────────────────────────────────────────────────\n\n${blocks}\n\nAddress these gaps BEFORE completing the primary request.\nAnswers feed directly into the self-healing loop.\n\n─────────────────────────────────────────────────────────\nPRIMARY REQUEST:\n─────────────────────────────────────────────────────────\n`;
  } catch(e) { return null; }
}

// ── 5. Explicit injection with GTCI + data channel ───────────────────────────
async function explicitInject(text, jobId, source) {
  if (!isClaimed) {
    const ok = await discoverOrOpenTab(PROVIDER);
    if (!ok) { toast('Tab not available — queued', 'warn'); return false; }
  }

  const j = jobId || uid();

  // Prepend GTCI context
  let fullPrompt = text;
  const gtciCtx = await buildGTCIContext(3);
  if (gtciCtx) {
    fullPrompt = gtciCtx + text;
    addLog('info', 'GTCI: gap questions prepended', `${fullPrompt.length - text.length}ch added`);
  }

  // Open data channel (GUARDIAN_INPUT → ACK)
  await openDataChannel(j, fullPrompt);

  // Tag PENDING immediately
  sendToServerAndCortex({ type: 'GUARDIAN_DELIVERING', jobId: j, chatUrl: location.href, account: getAccount() });

  // Inject
  const result = await gate('explicitInject', () => {
    if (!injectText(fullPrompt)) throw new Error('contenteditable not found');
    evLog('inject.explicit', { jobId: j, chars: fullPrompt.length, gtci: !!gtciCtx });
    return true;
  }, { jobId: j });

  if (!result.ok) return false;

  seenArtifactHashes.clear();
  startWatch(j, text.slice(0, 80));
  setTimeout(submit, 500);

  addLog('job', `Injected PENDING`, `#${j.slice(0,8)} ${fullPrompt.length}ch`);
  toast(`Injected → PENDING · #${j.slice(0,8)}`, 'job');
  return j;
}

// ── 6. Forge sync — keep forge IDE in sync ────────────────────────────────────
function syncToForge(type, data) {
  const body = JSON.stringify({ type, data, ts: Date.now() });
  fetch(`${FORGE_URL}/api/guardian/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}

// Hook into existing SEAM verification to push to Forge
const _origSeamVerify = seamVerifyChunk;
function seamVerifyChunk(idx, result) {
  _origSeamVerify(idx, result);
  const chunk = seamState.chunks[idx];
  if (chunk) {
    syncToForge('seam.chunk.' + result, { idx, title: chunk.title, status: chunk.status });
    sendToCortex('seam.chunk.' + result, { idx, title: chunk.title });
  }
}

// ── 7. Console sync via SSE ───────────────────────────────────────────────────
let cortexSSE = null;

function startConsoleSyncSSE() {
  if (cortexSSE) return;
  cortexSSE = new EventSource(`${CORTEX_URL}/sse`);

  cortexSSE.onopen = () => {
    addLog('sys', 'Cortex SSE sync active', CORTEX_URL);
    evLog('cortex.sse.connected', { url: CORTEX_URL });
  };

  cortexSSE.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      const type = ev.type || '';

      // Mirror cortex events to Guardian panel log
      if (type === 'agent.call.routed')   addLog('job', `RAID → ${ev.data?.payload?.agent}`, ev.data?.payload?.uuid?.slice(0,8));
      if (type === 'gap.found')           { addLog('gap', `GAP: ${ev.data?.payload?.type}`, ''); currentGaps.unshift(ev.data?.payload||{}); if (activeTab==='gaps') renderGapsTab(); }
      if (type === 'gap.resolved')        addLog('ok', `GAP resolved`, ev.data?.payload?.uuid?.slice(0,8));
      if (type === 'gap.question.created') addLog('gap', `GTCI: question generated`, ev.data?.payload?.type);
      if (type === 'system.booted')       addLog('sys', 'Cortex booted', '3748');
    } catch {}
  };

  cortexSSE.onerror = () => {
    cortexSSE = null;
    setTimeout(startConsoleSyncSSE, 5000);
  };
}

// ── 8. Init additions ─────────────────────────────────────────────────────────
// Add these to the existing init() function:
function initNexusPatch() {
  // Start cortex console sync
  startConsoleSyncSSE();
  // Log init to cortex
  sendToCortex('guardian.init', { version: VERSION, provider: PROVIDER });
  addLog('sys', 'Nexus patch active — cortex sync + GTCI + forge sync');
}

// Call from GUARDIAN_READY handler:
// initNexusPatch();
