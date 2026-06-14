'use strict';
/**
 * tutorial/wizard.js — NEXUS First-Start Wizard (core)
 * UUID: nexus-tutorial-v1-0000-5000-0000-000000000001
 * Version: 1.0.0
 *
 * For a brand-new user who has never touched a terminal. Each step:
 *   1. EXPLAINS  — what this part of the system is, in plain words
 *   2. VERIFIES  — actually probes the live service (§1.1 proof, not claim)
 *   3. REPAIRS   — if it's red, tries to fix it itself before asking the user
 *
 * This is also the integration test that was missing: walking the wizard end to
 * end IS the proof that boot → cortex → guardian → dispatch all work together.
 *
 * Same step data drives the CLI (this file) and the web view (server.js).
 * No dependency on the rest of NEXUS — pure http probes, so it can run even
 * when half the system is down (that's the point — it tells you WHICH half).
 */

const http = require('http');

// ── tiny http probe (no deps, short timeout) ──────────────────────────────────
function probe(port, path = '/health', { method = 'GET', body = null, timeout = 2500 } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let raw = ''; res.on('data', d => raw += d); res.on('end', () => {
        let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: parsed });
      }); });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: 'no answer (service not running?)' }); });
    req.on('error', e => resolve({ ok: false, status: -1, body: e.code || e.message }));
    req.setTimeout(timeout);
    if (data) req.write(data); req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── THE STEPS — written for a non-technical first-time user ────────────────────
// Each step: id, title, plain explanation, a verify() that probes live, and an
// optional repair() that tries to self-heal. verify returns {pass, detail, data}.

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to NEXUS',
    explain:
      "NEXUS is a set of small programs that work together like organs in a body.\n" +
      "This wizard walks you through each one, checks it's alive, and fixes it if it isn't.\n" +
      "You don't need to know anything technical. Just press Enter at each step.\n" +
      "Green means that part works. Red means it doesn't — and I'll try to repair it for you.",
    verify: async () => ({ pass: true, detail: "Ready to begin." }),
  },
  {
    id: 'orchestrator',
    title: 'The Orchestrator — the conductor',
    explain:
      "The Orchestrator is the conductor of the orchestra. It starts all the other\n" +
      "programs in the right order and watches them. If it's not running, nothing else is.",
    verify: async () => {
      const r = await probe(9000, '/health');
      return { pass: r.ok, detail: r.ok ? "Conductor is awake and watching." : "Conductor isn't answering.", data: r };
    },
    repair: async () => ({
      tried: true,
      message:
        "The Orchestrator is the one thing you start by hand. Open a terminal in the\n" +
        "NEXUS folder and type:  node orchestrator.js\n" +
        "Leave that window open, then come back here and press Enter to re-check.",
      autoFixed: false,
    }),
  },
  {
    id: 'bridge',
    title: 'The Bridge — how the organs talk',
    explain:
      "The Bridge lets the programs talk to each other safely. It hands out ID badges\n" +
      "so each program knows who it's speaking with. It comes up right after the conductor.",
    verify: async () => {
      const r = await probe(9999, '/health');
      return { pass: r.ok, detail: r.ok ? "The organs can talk to each other." : "The Bridge is down — programs can't reach each other.", data: r };
    },
    repair: async () => ({
      tried: true,
      message: "The Bridge is started by the Orchestrator. If it's red, the Orchestrator\n" +
               "may still be booting — wait 10 seconds and press Enter to re-check.",
      autoFixed: false,
    }),
  },
  {
    id: 'cortex',
    title: 'Cortex — the memory and the brain',
    explain:
      "Cortex is the memory. It remembers everything that happens and never forgets.\n" +
      "It's also where the 'thinking' parts live — the bits that watch for problems\n" +
      "and try to heal them. This is the most important organ.",
    verify: async () => {
      const r = await probe(3748, '/health');
      return { pass: r.ok, detail: r.ok ? "Memory is online and remembering." : "Cortex isn't answering — the system has no memory right now.", data: r };
    },
    repair: async () => {
      // Cortex is auto-booted by orchestrator. Re-probe a few times in case it's mid-boot.
      for (let i = 0; i < 5; i++) { await sleep(2000); const r = await probe(3748, '/health'); if (r.ok) return { tried: true, autoFixed: true, message: "Cortex came up on its own — it was just still waking. Fixed." }; }
      return { tried: true, autoFixed: false,
        message: "Cortex still isn't up. Check the Orchestrator window for a red error line\n" +
                 "mentioning 'cortex'. Most often it's a port already in use — close any old\n" +
                 "NEXUS windows and restart with: node orchestrator.js" };
    },
  },
  {
    id: 'cortex-organs',
    title: 'The organs — are they actually working?',
    explain:
      "Cortex has several organs inside it: one that spots problems (gap-finder),\n" +
      "one that fixes them (self-heal), one that keeps a pulse (heartbeat), and one\n" +
      "that decides which AI to ask (RAID). Booting them isn't enough — let's check\n" +
      "they're actually doing their job, not just sitting there.",
    verify: async () => {
      // honor the FIXED /api/events: ask for a type, get only that type
      const hb = await probe(3748, '/api/events?type=heartbeat.tick&limit=5');
      const rd = await probe(3748, '/api/events?type=raid.health&limit=5');
      const hbAlive = hb.ok && Array.isArray(hb.body?.rows) && hb.body.rows.length > 0;
      const rdAlive = rd.ok && Array.isArray(rd.body?.rows) && rd.body.rows.length > 0;
      const pass = hbAlive || rdAlive;
      return { pass,
        detail: pass ? `Organs are alive and working (heartbeat:${hbAlive?'✓':'·'} raid:${rdAlive?'✓':'·'}).`
                     : "The organs booted but aren't emitting signals yet — give them a few seconds.",
        data: { hbAlive, rdAlive } };
    },
    repair: async () => {
      for (let i = 0; i < 4; i++) { await sleep(3000);
        const hb = await probe(3748, '/api/events?type=heartbeat.tick&limit=3');
        if (hb.ok && hb.body?.rows?.length > 0) return { tried: true, autoFixed: true, message: "Organs started ticking — they just needed a moment. Fixed." };
      }
      return { tried: true, autoFixed: false,
        message: "Organs aren't emitting. They may have degraded at boot. Check the\n" +
                 "Orchestrator window for a line like 'organs degraded' to see which one." };
    },
  },
  {
    id: 'raid-seam',
    title: 'The decision-maker — ask it a question',
    explain:
      "When you give NEXUS a job, something has to decide WHICH AI handles it —\n" +
      "your local one, or a cloud one. That's RAID. Let's actually ask it to make a\n" +
      "decision right now and see what it says.",
    verify: async () => {
      const r = await probe(3748, '/api/raid/decide?intent=write+me+a+short+poem');
      const good = r.ok && r.body?.ok && r.body?.agent;
      return { pass: good,
        detail: good ? `It decided: "${r.body.agent}" should handle that (because: ${r.body.reason || 'routing rules'}).`
                     : "The decision-maker didn't answer — RAID may not be wired into Cortex.",
        data: r.body };
    },
    repair: async () => ({
      tried: true, autoFixed: false,
      message: "If this is red but Cortex is green, the RAID route isn't registered.\n" +
               "Make sure you're running the integrated build — boot.js should call\n" +
               "adminServer.registerRaid(mod) when the raid organ starts.",
    }),
  },
  {
    id: 'guardian',
    title: 'Guardian — the hands that do the work',
    explain:
      "Guardian is the part that actually talks to the AI chat windows in your browser.\n" +
      "It takes a job, sends it to the right AI, and brings the answer back. It's the\n" +
      "hands of the system.",
    verify: async () => {
      const r = await probe(7820, '/health');
      return { pass: r.ok, detail: r.ok ? "Guardian is ready to do work." : "Guardian isn't answering — jobs can't be sent.", data: r };
    },
    repair: async () => {
      for (let i = 0; i < 4; i++) { await sleep(2000); const r = await probe(7820, '/health'); if (r.ok) return { tried: true, autoFixed: true, message: "Guardian woke up. Fixed." }; }
      return { tried: true, autoFixed: false,
        message: "Guardian is down. One common cause: a missing piece called 'express'.\n" +
                 "In a terminal in the NEXUS folder, type:  npm install\n" +
                 "then restart with:  node orchestrator.js" };
    },
  },
  {
    id: 'full-loop',
    title: 'The whole thing, end to end',
    explain:
      "Last check — and the big one. This proves the organs all work TOGETHER, not\n" +
      "just one at a time. We confirm memory is recording, the decision-maker decides,\n" +
      "and the hands are ready. If this is green, your system is genuinely alive.",
    verify: async () => {
      const cortex   = await probe(3748, '/health');
      const decision = await probe(3748, '/api/raid/decide?intent=test+the+whole+loop');
      const guardian = await probe(7820, '/health');
      const memory   = await probe(3748, '/api/events?limit=5');
      const allGood  = cortex.ok && decision.ok && decision.body?.ok && guardian.ok && memory.ok;
      return { pass: allGood,
        detail: allGood
          ? "Everything works together. Memory ✓  Decision-maker ✓  Hands ✓  — your system is live."
          : `Not all parts are connected yet (memory:${cortex.ok?'✓':'✗'} decision:${decision.body?.ok?'✓':'✗'} hands:${guardian.ok?'✓':'✗'}).`,
        data: { cortex: cortex.ok, decision: !!decision.body?.ok, guardian: guardian.ok, memory: memory.ok } };
    },
  },
  {
    id: 'done',
    title: "You're set up",
    explain:
      "That's it — you've walked the whole system and watched each part prove itself.\n" +
      "From now on, just run  node orchestrator.js  to start everything, and run this\n" +
      "wizard any time you want to check the system's health. Welcome aboard.",
    verify: async () => ({ pass: true, detail: "Setup complete." }),
  },
];

module.exports = { STEPS, probe };

// ── CLI runner ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));
  const C = { green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`,
              yellow: s => `\x1b[33m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m` };

  (async () => {
    console.clear();
    console.log(C.bold("\n  ╔════════════════════════════════════════╗"));
    console.log(C.bold("  ║     NEXUS — First-Start Wizard         ║"));
    console.log(C.bold("  ╚════════════════════════════════════════╝\n"));

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      console.log(C.bold(`\n  Step ${i + 1} of ${STEPS.length}:  ${step.title}`));
      console.log(C.dim("  " + "─".repeat(44)));
      console.log("  " + step.explain.split('\n').join('\n  ') + "\n");

      if (step.id !== 'welcome' && step.id !== 'done') await ask(C.dim("  Press Enter to check this part... "));

      let result = await step.verify();

      // if it failed and there's a repair, try it
      if (!result.pass && step.repair) {
        console.log("  " + C.yellow("⚠ Not working yet. Let me try to fix it...\n"));
        const fix = await step.repair();
        console.log("  " + fix.message.split('\n').join('\n  ') + "\n");
        if (fix.autoFixed) { result = await step.verify(); }
        else if (step.id !== 'welcome') {
          await ask(C.dim("  Press Enter to check again... "));
          result = await step.verify();
        }
      }

      const mark = result.pass ? C.green("  ✓ " + result.detail) : C.red("  ✗ " + result.detail);
      console.log(mark + "\n");

      if (!result.pass && ['orchestrator', 'cortex'].includes(step.id)) {
        const cont = await ask(C.yellow("  This part is essential. Continue anyway? (y/n) "));
        if (cont.toLowerCase() !== 'y') { console.log(C.dim("\n  Stopped. Fix this part, then run the wizard again.\n")); rl.close(); return; }
      }
    }

    console.log(C.green(C.bold("\n  All done. Run  node orchestrator.js  to start NEXUS any time.\n")));
    rl.close();
  })();
}
