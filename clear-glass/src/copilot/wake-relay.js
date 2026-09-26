'use strict';
/**
 * src/copilot/wake-relay.js — closes the real loop James described:
 * "hey nexus" said in any agent tab -> guardian/cortex detects it
 * server-side -> relayed to co-pilot -> the real answer injected back
 * into that exact tab, not just printed somewhere else.
 *
 * Complements cli/nexus-repl.js's `wake` command rather than replacing
 * it — that one is for a human watching a terminal; this one is for
 * ClearGlass itself to close the loop automatically, live, in the
 * browser, since only this process holds the real BrowserWindow map
 * (ProviderHost.windows) needed to inject back into the right tab.
 */
const http = require('http');

function startWakeRelay(providerHost, opts = {}) {
  const cortexHost = opts.cortexHost || '127.0.0.1';
  const cortexPort = opts.cortexPort || 3748;
  // §FIX 2026-09-07 — REGRESSION, caught from James's own live screenshots
  // and log: "[wake-relay] no answer available for chatgpt (guardian and
  // mesh both failed/unavailable)" — the exact old symptom, because this
  // file still POSTed to guardianHost:guardianPort's '/copilot/prompt',
  // a route that no longer exists (removed along with guardian's old
  // dispatch path this session). Real, current, confirmed target is
  // copilot's own POST /bridge/deliver (copilot/server.js:1620) — the
  // same real endpoint tv-shell's _copilotDispatch already uses
  // successfully. This fix was made once already earlier this session;
  // it did not survive an intermediate merge — reapplied here, verified
  // against copilot/server.js's actual current handler, not memory.
  const copilotHost = opts.copilotHost || '127.0.0.1';
  const copilotPort = opts.copilotPort || 3750;
  // §BUILT 2026-09-11 — James: "wake word needs to create a job using
  // guardian to simulate input from user into the provider chat...
  // copilot's response should use /guardian /ask and paste copilot's
  // response and create a job in guardian so nexus can respond to the
  // provider." Real gap: everything below this point already got a real
  // answer out of copilot, but the only thing done with it was
  // providerHost.injectAnswer() — and that call's own header says
  // exactly what it does: renders a closeable overlay via the page's
  // NexusWake.showAnswer(), and explicitly does NOT type into the real
  // chat input (host.js:342-343), specifically so it can never interfere
  // with something the person is actually typing. That's correct for the
  // "new chat" intro banner it was built for, but wrong for this: an
  // overlay only the person sees is not "nexus responding to the
  // provider" — chatgpt (or whichever agent) never actually receives
  // copilot's answer as a message, so there is no real back-and-forth.
  // guardian/server.js's real POST /command already does exactly what's
  // needed here — createJob + dispatchJob — the same real path
  // guardian/ask.js's askSync() and /command/tools use to get a prompt
  // typed into a provider's actual composer and submitted via that
  // provider's own userscript (guardian/userscript-<agent>.js, real NCP
  // round trip), not a second, parallel injection mechanism. source:
  // 'copilot' (not 'wake-relay', which isn't a registered RAID contract
  // and would 403 under _default's proof_required — checked in
  // cortex/contract/index.js before choosing this) because this really
  // is copilot's own answer being delivered, just from this process.
  const guardianHost = opts.guardianHost || '127.0.0.1';
  const guardianPort = opts.guardianPort || 7820;
  const log = opts.log || (() => {});
  // §HOOK 2026-08-29 — optional AgentMesh instance, wired in from
  // main/index.js. Real gap: this file's whole job is "a wake word said
  // in any agent tab gets a real answer injected back into that tab" —
  // but the only answer path was Guardian's /copilot/prompt. If Guardian
  // is down (or the specific provider Guardian would use for `d.agent`
  // is unhealthy), the wake event was previously just dropped (logged,
  // not answered) even though AgentMesh — a second, independent way to
  // reach a live agent — might be perfectly healthy. mesh is optional and
  // backward-compatible: omit it and behavior is unchanged from before.
  const mesh = opts.mesh || null;

  let stopped = false;

  function connect() {
    if (stopped) return;
    const req = http.request(
      { hostname: cortexHost, port: cortexPort, path: '/sse', method: 'GET', headers: { Accept: 'text/event-stream' } },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const l of lines) {
            if (!l.startsWith('data:')) continue;
            let d; try { d = JSON.parse(l.slice(5).trim()); } catch (_) { continue; }
            if (d.type !== 'nexus.wake.detected') continue;
            handleWake(d);
          }
        });
        res.on('end', () => { if (!stopped) setTimeout(connect, 3000); });
      }
    );
    req.on('error', () => { if (!stopped) setTimeout(connect, 3000); });
    req.end();
  }

  async function handleWake(d) {
    // §0.39.252 — James (2026-09-25): "is supposed to be injected into the chat like a job. it is for the agents to talk
    // to nexus. not me." An AGENT's wake (the assistant's own "hey nexus, …") is answered by guardian's wake-loop
    // (guardian/lib/wake-loop.js) from the COMPLETED reply, as a wake-reply job sent into the same tab. This relay heard
    // it from cortex's /api/meta/observe, which the userscript calls when a reply first APPEARS — still streaming — so it
    // answered the first fragment ("hey nexus, w") a second time, as a job that queued behind the unfinished reply.
    // Cortex still records the event (nexus_wake_events, the REPL); this relay just no longer answers it.
    if (d.role === 'assistant') { log(`[wake-relay] agent wake from ${d.agent || '?'} left to guardian's wake-loop (answered on the completed reply)`); return; }
    if (!d.agent) { log(`[wake-relay] event with no agent, cannot inject back — ${d.request?.slice(0,60)}`); return; }
    log(`[wake-relay] wake from ${d.agent}${d.account ? ' ('+d.account+')' : ''}: ${d.request?.slice(0,80)}`);
    let text = null;
    try {
      const r = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ request: { uuid: require('crypto').randomUUID(), payload: { prompt: d.request, channel: 'wake-relay', sessionId: `wake-${d.agent}` } } });
        const req2 = http.request(
          { hostname: copilotHost, port: copilotPort, path: '/bridge/deliver', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
          (res2) => { let b=''; res2.on('data',c=>b+=c); res2.on('end',()=>{ try{resolve(JSON.parse(b));}catch(e){reject(e);} }); }
        );
        req2.on('error', reject);
        req2.write(body); req2.end();
      });
      text = r.text || r.response || (r.toolResult ? JSON.stringify(r.toolResult.result || r.toolResult, null, 2) : null);
    } catch (e) {
      log(`[wake-relay] copilot relay failed: ${e.message}${mesh ? ' — falling back to agent mesh' : ''}`);
    }

    // §HOOK 2026-08-29 — mesh fallback: only taken if Guardian's real
    // path above genuinely failed or returned nothing, never as a
    // first choice — Guardian's /copilot/prompt carries real Cortex
    // context (memory, CFR, DOM) that a bare mesh.route() prompt
    // doesn't have, so it stays primary. `preferAgent: d.agent` asks
    // the mesh to answer via the SAME agent the wake word came from
    // when it can (a Claude tab saying "hey nexus" getting answered by
    // ChatGPT would be a confusing identity mismatch); mesh.route()'s
    // own agent-router-driven fallback still applies if that agent is
    // unhealthy.
    if (!text && mesh) {
      try {
        const r = await mesh.route({ prompt: d.request, preferAgent: d.agent });
        text = r.response || null;
        if (text) log(`[wake-relay] answered via agent mesh (${r.agentKey})`);
      } catch (e) {
        log(`[wake-relay] agent mesh fallback also failed: ${e.message}`);
      }
    }

    if (!text) { log(`[wake-relay] no answer available for ${d.agent} (guardian and mesh both failed/unavailable)`); return; }

    // Primary: create a real guardian job so the answer gets typed into
    // d.agent's actual chat composer and submitted — a real message the
    // provider itself receives and can respond to, not just something
    // shown to the person watching.
    const dispatched = await dispatchToGuardian(d.agent, text, { accountId: d.account, agentId: d.agentId });
    if (dispatched.ok) {
      log(`[wake-relay] guardian job ${dispatched.jobId} → ${d.agent}: answer dispatched as real chat input`);
      return;
    }
    log(`[wake-relay] guardian job dispatch failed for ${d.agent}: ${dispatched.error} — falling back to overlay`);

    // Fallback only: the overlay is real feedback (the person can still
    // see the answer) even when the real send-back-into-the-chat path is
    // down, but it is not a substitute for it — see the header note above.
    try {
      const injected = await providerHost.injectAnswer(d.agent, text);
      if (!injected.ok) log(`[wake-relay] injectAnswer fallback also failed for ${d.agent}: ${injected.reason}`);
    } catch (e) {
      log(`[wake-relay] injectAnswer fallback failed: ${e.message}`);
    }
  }

  // dispatchToGuardian(provider, text) — POST /command, the same real
  // createJob+dispatchJob path guardian's own askSync()/'/command/tools'
  // use. Fire-and-forget from this caller's point of view: the job's
  // eventual reply comes back through guardian's normal NCP flow (visible
  // via GET /jobs, cockpit, etc.), not through this function — this only
  // needs to know the job was accepted for dispatch, not how it resolves.
  function dispatchToGuardian(provider, text, who = {}) {
    return new Promise((resolve) => {
      // 2026-09-19: only the AGENT says "hey nexus". The event came from a userscript tab, so the answer goes back into THAT tab
      // (the userscript, by NCP). Under
      // mesh-first a reply would otherwise open a different mesh tab. transport:'ncp' pins it; accountId/agentId identify the
      // account so the right cookie-vault identity/tab is used.
      const body = JSON.stringify({ provider, command: 'wake-reply', prompt: text, source: 'copilot', transport: 'ncp',
        accountId: who.accountId || undefined, agentId: who.agentId || undefined });
      const req = http.request(
        { hostname: guardianHost, port: guardianPort, path: '/command', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(b); } catch (e) { resolve({ ok: false, error: `bad JSON from guardian: ${e.message}` }); return; }
            if (!parsed.ok) { resolve({ ok: false, error: parsed.error || `guardian returned ${res.statusCode}` }); return; }
            resolve({ ok: true, jobId: parsed.jobId, status: parsed.status });
          });
        }
      );
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.write(body);
      req.end();
    });
  }

  connect();
  return { stop: () => { stopped = true; } };
}

module.exports = { startWakeRelay };
