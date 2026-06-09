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

// ── command: send a job ───────────────────────────────────────────────────────

async function sendCommand(raw) {
  // Check if content is piped via stdin
  let stdinContent = null;
  if (!process.stdin.isTTY) {
    stdinContent = fs.readFileSync('/dev/stdin', 'utf8');
  }

  const body = stdinContent
    ? { raw, content: stdinContent }
    : { raw };

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

async function sendFile(provider, filePath, extraPrompt) {
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
  });

  if (!result.ok) { console.error('Error:', result.error); process.exit(1); }
  console.log(`Job: ${result.jobId}  Status: ${result.status}`);
  await watchJob(result.jobId);
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
  /spec    <provider> <file|prompt>  Send a spec file
  /ask     <provider> <prompt>       General question
  /paste   <provider>                Pipe content: echo "..." | guardian /paste claude
  /multi   <p1> <p2> <prompt>        Send to multiple providers at once
  /file    <provider> <path> [note]  Send a file's contents

Server info:
  status        Show server health + connected providers
  providers     List which userscripts are connected
  jobs [n]      Show recent jobs (default 20)
  watch <id>    Stream output of a job

Options:
  --no-watch    Don't wait for the response after sending

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
      await sendFile(provider, filePath, rest.join(' ') || null);
      return;
    }

    // ── /spec with file path ─────────────────────────────────────────────────
    if (args[0] === '/spec' && args[2] && fs.existsSync(path.resolve(args[2]))) {
      await sendFile(args[1], args[2], args.slice(3).join(' ') || null);
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
      await sendCommand(args.join(' '));
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
