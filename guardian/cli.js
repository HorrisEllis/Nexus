#!/usr/bin/env node
/**
 * guardian/cli.js  (or: add `guardian` to your PATH)
 * ─────────────────────────────────────────────────────────────────────────────
 * Guardian CLI — sends commands to the bridge server
 *
 * Usage:
 *   guardian /code claude make me a hat
 *   guardian /spec chatgpt ./spec.md
 *   guardian /ask gemini "what is entropy"
 *   guardian /paste claude < ./file.txt
 *   guardian /multi claude chatgpt "explain recursion"
 *   guardian status
 *   guardian jobs
 *   guardian providers
 *   guardian watch <jobId>
 *
 * The server must be running:
 *   node server.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const PORT = process.env.GUARDIAN_HTTP_PORT || 7820;
const BASE = `http://${HOST}:${PORT}`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function get(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${endpoint}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Bad JSON response')); }
      });
    }).on('error', () => reject(new Error(
      `Cannot reach guardian server at ${BASE}\nStart it: node server/server.js`
    )));
  });
}

function post(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request(`${BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve(JSON.parse(out)); }
        catch { reject(new Error('Bad JSON response')); }
      });
    });
    req.on('error', () => reject(new Error(
      `Cannot reach guardian server at ${BASE}\nStart it: node server/server.js`
    )));
    req.write(data);
    req.end();
  });
}

// ── SSE stream watcher ────────────────────────────────────────────────────────

function watchJob(jobId) {
  return new Promise((resolve) => {
    console.log(`\n[watching ${jobId}]\n`);
    process.stdout.write('');

    const req = http.get(`${BASE}/stream/${jobId}`, res => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.text)   process.stdout.write(msg.text);
            if (msg.done) { process.stdout.write('\n'); resolve(); }
          } catch {}
        }
      });
      res.on('end', resolve);
    });

    req.on('error', () => {
      console.error('Stream error — polling instead');
      pollUntilDone(jobId).then(resolve);
    });
  });
}

// ── polling fallback (no SSE) ─────────────────────────────────────────────────

async function pollUntilDone(jobId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const result = await get(`/response/${jobId}`).catch(() => null);
    if (!result) continue;
    if (result.status === 'complete') {
      console.log('\n' + result.response);
      return;
    }
    if (result.status === 'failed') {
      console.error('\nFailed:', result.error);
      return;
    }
    process.stdout.write('.');
  }
  console.error('\nTimed out waiting for response');
}

// ── watch a SEAM queue's chunk-by-chunk progress ──────────────────────────────
// §NOTE: GET /seam/queues/:id only checks the in-memory _activeQueues map —
// onComplete() deletes the queue from it, so a 404 here is ambiguous between
// "never existed" and "just finished." Treat a 404 *after* having seen the
// queue at least once as completion, not failure — querying too fast after
// the last chunk verifies will otherwise misreport a successful run as an error.
async function watchSeam(queueId, timeoutMs = 600_000) {
  console.log(`\n[watching SEAM queue ${queueId}]\n`);
  const deadline = Date.now() + timeoutMs;
  let sawQueue = false;
  let lastPct = -1;

  while (Date.now() < deadline) {
    const result = await get(`/seam/queues/${queueId}`).catch(() => null);

    if (!result || !result.ok) {
      if (sawQueue) {
        console.log(`\nQueue no longer active — treating as complete. Final state is in JAA: GET ${BASE}/seam/sessions (filter by uuid ${queueId}).`);
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    sawQueue = true;
    const q = result.queue;
    const pct = q.stats.pct;
    if (pct !== lastPct) {
      console.log(`[${pct}%] verified:${q.stats.verified} active:${q.stats.active} retrying:${q.stats.retrying} queued:${q.stats.queued} escalated:${q.stats.escalated}  (${q.stats.total} total)`);
      lastPct = pct;
    }

    if (q.completedAt) {
      console.log(`\nDone — ${q.stats.verified}/${q.stats.total} verified, ${q.stats.escalated} escalated.`);
      return;
    }

    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('\nTimed out watching SEAM queue');
}

// ── command: send a job ───────────────────────────────────────────────────────

async function sendCommand(raw, agentId = null) {
  // Check if content is piped via stdin
  let stdinContent = null;
  if (!process.stdin.isTTY) {
    stdinContent = fs.readFileSync('/dev/stdin', 'utf8');
  }

  const body = stdinContent
    ? { raw, content: stdinContent, agentId }
    : { raw, agentId };

  const result = await post('/command', body);

  if (!result.ok) {
    console.error('Error:', result.error);
    process.exit(1);
  }

  console.log(`Job: ${result.jobId}  Status: ${result.status}`);

  // Auto-watch unless --no-watch flag
  if (!process.argv.includes('--no-watch')) {
    await watchJob(result.jobId);
  }
}

// ── command: send a file as content ──────────────────────────────────────────

async function sendFile(provider, filePath, extraPrompt, agentId = null) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const content = fs.readFileSync(abs, 'utf8');
  const prompt  = extraPrompt || `Here is the file: ${path.basename(abs)}`;

  const result = await post('/command', {
    command:  'spec',
    provider: provider,
    prompt,
    content,
    source: 'cli',
    agentId,
  });

  if (!result.ok) { console.error('Error:', result.error); process.exit(1); }
  console.log(`Job: ${result.jobId}  Status: ${result.status}`);
  await watchJob(result.jobId);
}

// §SEAM-GLUE-FIX: sendFile() above sends `content`, which guardian/server.js's
// /command handler never checks (it only checks body.spec/specText/specFile —
// see guardian/server.js ~2565) — so /spec was silently falling through to
// the same single-blob path as /file, never reaching the real parseSpec() +
// SEAMQueue pipeline that already exists and works. This is the actual SEAM
// entry point: real chunking, real retry state machine, real session.
async function sendSpec(provider, filePath, title) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const specText = fs.readFileSync(abs, 'utf8');

  const result = await post('/command', {
    command: 'spec',
    provider,
    specText,
    title: title || path.basename(abs),
    source: 'cli',
  });

  if (!result.ok) { console.error('Error:', result.error); process.exit(1); }
  console.log(`SEAM queue: ${result.queueId}`);
  console.log(`Title: ${result.title}   Provider: ${result.provider}   Chunks: ${result.total}`);
  if (result.meta?.name) console.log(`Spec: ${result.meta.name}`);
  console.log(`\nWatch progress:  guardian /seam ${result.queueId}`);
  console.log(`Or poll:         GET /seam/queues/${result.queueId}`);
}

// ── command: multi-provider ───────────────────────────────────────────────────

async function sendMulti(providers, prompt) {
  const jobIds = [];

  for (const provider of providers) {
    const result = await post('/command', {
      command: 'multi',
      provider,
      prompt,
    });
    if (result.ok) {
      console.log(`${provider}: ${result.jobId}`);
      jobIds.push({ provider, jobId: result.jobId });
    } else {
      console.error(`${provider}: ${result.error}`);
    }
  }

  // Watch all in parallel
  await Promise.all(jobIds.map(({ provider, jobId }) => {
    console.log(`\n── ${provider} ──`);
    return watchJob(jobId);
  }));
}

// ── display helpers ───────────────────────────────────────────────────────────

function statusIcon(s) {
  return { pending: '⏳', delivered: '📤', streaming: '⚡', complete: '✓', failed: '✗' }[s] || '?';
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Guardian CLI — route commands to AI tabs via browser userscript

Commands that go to AI:
  /code    <provider> <prompt>       Ask for code
  /spec    <provider> <file|prompt>  Send a spec file — real SEAM chunking, not a single blob
  /seam    <queueId>                 Watch a SEAM queue's chunk-by-chunk progress
  /seam    interrupted               List SEAM chunks in INTERRUPTED state (abrupt stop)
  /seam    resume <queueId>          Force-retry the active chunk in a stalled queue
  /ask     <provider> <prompt>       General question
  /paste   <provider>                Pipe content: echo "..." | guardian /paste claude
  /multi   <p1> <p2> <prompt>        Send to multiple providers at once
  /file    <provider> <path> [note]  Send a file's contents

Server info:
  status        Show server health + connected providers
  providers     List which userscripts are connected
  jobs [n]      Show recent jobs (default 20)
  watch <id>    Stream output of a job
  seam interrupted        List interrupted SEAM chunks needing attention
  seam resume <queueId>  Force-retry the active chunk in a stalled queue

Options:
  --no-watch          Don't wait for the response after sending
  --agent <agentId>   Target one repo's own dedicated tab (repo-<uuid>,
                       the TR1/TR2 convention) instead of the shared
                       provider tab. Works on /code, /ask, /paste, /file,
                       and sync. A repo with no live tab of its own fails
                       loudly rather than silently falling back.

Providers: claude, chatgpt, gemini, ollama

Examples:
  guardian /code claude "make me a hat in Python"
  guardian /spec chatgpt ./NEXUS-SPEC-v7.md
  guardian /ask gemini "explain entropy"
  guardian /multi claude chatgpt "what is recursion"
  cat ./main.js | guardian /paste claude
  guardian /file claude ./src/app.js "what's wrong with this?"
`);
    return;
  }

  try {
    // ── /multi ──────────────────────────────────────────────────────────────
    if (args[0] === '/multi') {
      // /multi claude chatgpt "prompt here"
      const prompt    = args[args.length - 1];
      const providers = args.slice(1, -1);
      if (providers.length < 2) {
        console.error('Usage: guardian /multi <provider1> <provider2> "prompt"');
        process.exit(1);
      }
      await sendMulti(providers, prompt);
      return;
    }

    // ── /file ────────────────────────────────────────────────────────────────
    if (args[0] === '/file') {
      const [, provider, filePath, ...rest] = args;
      const agentFlagIdx = rest.indexOf('--agent');
      let fileAgentId = null;
      if (agentFlagIdx !== -1) { fileAgentId = rest[agentFlagIdx + 1] || null; rest.splice(agentFlagIdx, 2); }
      await sendFile(provider, filePath, rest.join(' ') || null, fileAgentId);
      return;
    }

    // ── /spec with file path — real SEAM chunking, not a plain file send ──────
    if (args[0] === '/spec' && args[2] && fs.existsSync(path.resolve(args[2]))) {
      await sendSpec(args[1], args[2], args.slice(3).join(' ') || null);
      return;
    }

    // ── server info commands ─────────────────────────────────────────────────
    if (args[0] === 'status') {
      const h = await get('/health');
      console.log(`\nGuardian server — uptime: ${Math.round(h.uptime)}s`);
      console.log(`Jobs tracked: ${h.jobs}   WS clients: ${h.wsClients}`);
      console.log('\nProviders:');
      for (const [name, status] of Object.entries(h.providers)) {
        console.log(`  ${status === 'connected' ? '●' : '○'} ${name.padEnd(10)} ${status}`);
      }
      return;
    }

    if (args[0] === 'providers') {
      const r = await get('/providers');
      for (const [name, status] of Object.entries(r.providers)) {
        console.log(`${status === 'connected' ? '●' : '○'} ${name.padEnd(12)} ${status}`);
      }
      return;
    }

    if (args[0] === 'jobs') {
      const limit = parseInt(args[1] || '20');
      const r = await get(`/jobs?limit=${limit}`);
      if (!r.jobs.length) { console.log('No jobs yet'); return; }
      for (const job of r.jobs) {
        const age = Math.round((Date.now() - job.ts) / 1000);
        console.log(
          `${statusIcon(job.status)} ${job.id.slice(0, 8)}  ${job.provider.padEnd(10)}  /${job.command.padEnd(8)}  ${age}s ago  ${job.prompt.slice(0, 50)}`
        );
      }
      return;
    }

    if (args[0] === 'watch') {
      if (!args[1]) { console.error('Usage: guardian watch <jobId>'); process.exit(1); }
      await watchJob(args[1]);
      return;
    }

    // §BUILT 2026-09-17 — James: "why can't we manipulate the entire
    // dom... use that as a way to synchronize the chats." Hits guardian's
    // new POST /sync (guardian/lib/chat-sync.js's requestSync()), then
    // feeds the real result into the artifact-chat-index compartment
    // (clear-glass/src/downloads/artifact-chat-index.js's
    // recordResponse()) — this is the actual "synchronize" step, not
    // just a print. --no-store skips that write for a dry-run look.
    if (args[0] === 'sync') {
      if (!args[1]) { console.error('Usage: guardian sync <provider> [--agent <agentId>] [--no-store]'); process.exit(1); }
      const provider = args[1];
      // §FIX 2026-09-22 — James: "the cli in clearglass to stream the dom
      // to the agent tabs of the repos." --agent <agentId> targets one
      // repo's own dedicated tab (repo-<uuid>, the TR1/TR2 convention)
      // instead of every connected tab for the provider.
      const agentFlagIdx = args.indexOf('--agent');
      const agentId = agentFlagIdx !== -1 ? args[agentFlagIdx + 1] : null;
      const result = await post('/sync', { provider, agentId });
      if (!result.ok) { console.error(`Sync failed: ${result.reason || result.error}`); process.exit(1); }

      const chat = result.chat;
      const msgCount = chat?.messages?.length || 0;
      console.log(`Synced ${provider}: ${msgCount} message(s)${chat?.partial ? ' (partial — ' + chat.note + ')' : ''}`);

      if (!process.argv.includes('--no-store')) {
        try {
          const { ensureCompartment, recordResponse } = require('../clear-glass/src/downloads/artifact-chat-index.js');
          const { createHost } = require('../cos/host/index.js'); // real COS host bootstrap — confirmed the actual export, not guessed
          const host = createHost();
          const compartment = ensureCompartment(host);
          const root = compartment.fs?.root || compartment.root;
          const stored = recordResponse(root, { kind: 'chat', provider, chatId: chat?.chatId, raw: chat });
          console.log(`Stored: ${stored.responsePath}`);
        } catch (e) {
          console.error(`Warning: sync succeeded but storing to the index failed: ${e.message}`);
          console.error('(the chat was still read from the DOM — this only affects the durable index write)');
        }
      }
      return;
    }

    // ── /seam <queueId> — watch a SEAM queue's chunk-by-chunk progress ─────────
    if (args[0] === '/seam') {
      if (!args[1]) { console.error('Usage: guardian /seam <queueId>'); process.exit(1); }

      // ── seam interrupted — list all INTERRUPTED chunks ────────────────────
      if (args[1] === 'interrupted') {
        const result = await get('/seam/queues').catch(e => { console.error(e.message); process.exit(1); });
        const queues = result.queues || [];
        const interrupted = [];
        for (const q of queues) {
          for (const c of (q.compartments || [])) {
            if (c.state === 'GENERATING' && c.updatedAt && (Date.now() - c.updatedAt) > 30000) {
              interrupted.push({ queueId: q.uuid, queueTitle: q.title, chunkIdx: c.chunkIdx,
                chunkTitle: c.chunkTitle, stuckSecs: Math.round((Date.now() - c.updatedAt)/1000),
                watchdogRetries: c.watchdogRetries });
            }
          }
        }
        if (!interrupted.length) {
          console.log('No interrupted SEAM chunks found (nothing stuck > 30s in GENERATING state).');
          process.exit(0);
        }
        console.log(`
${interrupted.length} interrupted chunk(s):
`);
        for (const c of interrupted) {
          console.log(`  Queue: ${c.queueId.slice(0,8)}  "${c.queueTitle}"`);
          console.log(`  Chunk ${c.chunkIdx + 1}: "${c.chunkTitle}"  stuck ${c.stuckSecs}s  watchdog:${c.watchdogRetries}`);
          console.log(`  Resume: guardian /seam resume ${c.queueId}
`);
        }
        process.exit(0);
      }

      // ── seam resume <queueId> — force-retry active chunk ─────────────────
      if (args[1] === 'resume') {
        const queueId = args[2];
        if (!queueId) { console.error('Usage: guardian /seam resume <queueId>'); process.exit(1); }
        const result = await post('/seam/retry', { queueId, reason: 'cli_resume' })
          .catch(e => { console.error(e.message); process.exit(1); });
        if (!result.ok) { console.error(`Resume failed: ${result.error || 'unknown'}`); process.exit(1); }
        if (result.escalated) {
          console.log(`⚠  Chunk escalated — watchdog budget exhausted. Chunk is now ESCALATED (gap logged).`);
        } else {
          console.log(`✓  Retry forced on queue ${queueId.slice(0,8)}.`);
          console.log(`   Watch progress: guardian /seam ${queueId}`);
        }
        process.exit(0);
      }
      await watchSeam(args[1]);
      return;
    }

    if (args[0] === 'log') {
      const r = await get('/log?limit=20');
      for (const entry of r.log) {
        console.log(`\n── ${entry.provider} / ${entry.command} ──`);
        console.log(`Prompt: ${entry.prompt.slice(0, 80)}`);
        console.log(`Response: ${entry.response.slice(0, 200)}...`);
      }
      return;
    }

    // ── /code /ask /paste /spec (raw command) ────────────────────────────────
    if (args[0].startsWith('/')) {
      // §FIX 2026-09-22 — James: "maybe the job created from the cli
      // needs to use the agentid." guardian/server.js's /command handler
      // already reads body.agentId and threads it into createJob() (the
      // exact same field TR1's dispatcher.js/lib/repo-agent.js path
      // uses) — the CLI itself never sent one. Stripped out of the args
      // BEFORE building the raw command string, so it never corrupts the
      // actual prompt text sent to the parser.
      const cmdArgs = [...args];
      const agentFlagIdx = cmdArgs.indexOf('--agent');
      let agentId = null;
      if (agentFlagIdx !== -1) { agentId = cmdArgs[agentFlagIdx + 1] || null; cmdArgs.splice(agentFlagIdx, 2); }
      await sendCommand(cmdArgs.join(' '), agentId);
      return;
    }

    console.error(`Unknown command: ${args[0]}\nRun guardian --help for usage.`);
    process.exit(1);

  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
