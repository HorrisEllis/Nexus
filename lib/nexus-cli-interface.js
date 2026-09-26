'use strict';
/**
 * lib/nexus-cli-interface.js — the --cli interactive interface (with help menu)
 * UUID: nexus-cli-interface-v1-0000-2026-0808-001
 *
 * James: "npm run start:all --cli for a cli interface — when booting up, a command
 * line tool with a help menu. Add the co-pilot additions."
 *
 * Launched by autopilot when --cli is passed. Presents a help menu and routes
 * commands to the co-pilot additions built this session (§8.6 — composes them,
 * builds no new brain):
 *   copilot/lib/capabilities    — "what can you do" (real toolbox from loom)
 *   copilot/lib/nexus-awareness — rundown / what's wrong (real state + diagnostics)
 *   copilot/lib/self-model      — who am I / switch agent / govern
 *   copilot/lib/grammar-router  — natural language → capability (the grammar engine)
 *
 * §1.2 every command degrades honestly — a missing module prints a reason, never
 * throws the REPL. Read-only by default; anything that acts is clearly labelled.
 */

const HELP = `
NEXUS CLI — interactive command line (booted via: npm run start:all --cli)

  help                    show this menu
  what can you do         list NEXUS's real capabilities (from loom)
  what can <system> do    capabilities for one system (e.g. "what can cortex do")
  rundown                 full system rundown (capabilities, versions, live state)
  what's wrong            run diagnostics — findings + their conditions
  who am i                identity, from the user-model (asks back if unknown)
  switch to <agent>       route to a different model/agent (claude/gemini/…)
  roadmap [system]        the phasemap: what each system is becoming
  <anything else>         resolved via the grammar engine → the right capability
  exit / quit             leave the CLI

Everything is answered from REAL system state, never guessed.
`;

function _mod(p) { try { return require(p); } catch (_) { return null; } }

/**
 * handle(line) — route one command line to the right co-pilot addition.
 * Returns a string to print. Pure-ish (no process control); the REPL prints it.
 */
async function handle(line) {
  const t = (line || '').trim();
  const low = t.toLowerCase();
  if (!t) return '';
  if (low === 'help' || low === '?') return HELP;
  if (low === 'exit' || low === 'quit') return '__EXIT__';

  // what can you do / what can <system> do → capabilities
  if (/\bwhat can (you|i) do\b|\blist (your )?(tools|capabilities)\b/.test(low)) {
    const cap = _mod('../copilot/lib/capabilities'); if (!cap) return '(capabilities module unavailable)';
    return cap.whatCanIDo().text;
  }
  const perSys = low.match(/\bwhat can (\w[\w-]*) do\b/);
  if (perSys && perSys[1] !== 'you' && perSys[1] !== 'i') {
    const cap = _mod('../copilot/lib/capabilities'); if (!cap) return '(capabilities module unavailable)';
    return cap.capabilitiesForSystem(perSys[1]).text;
  }

  // rundown / what's wrong → nexus-awareness
  if (/\brundown\b|\bsystem status\b|\boverview\b/.test(low)) {
    const na = _mod('../copilot/lib/nexus-awareness'); if (!na) return '(awareness module unavailable)';
    return na.systemRundown().text;
  }
  if (/\bwhat('?s| is) wrong\b|\bdiagnos/.test(low)) {
    const na = _mod('../copilot/lib/nexus-awareness'); if (!na) return '(awareness module unavailable)';
    const r = await na.whatsWrong({}); return r.text || '(no diagnostic result)';
  }

  // who am i → self-model
  if (/\bwho am i\b|\bwhat('?s| is) my name\b/.test(low)) {
    const sm = _mod('../copilot/lib/self-model'); if (!sm) return '(self-model unavailable)';
    return sm.whoAmI().text;
  }
  // switch to <agent> → self-model
  const sw = low.match(/\bswitch to (\w[\w-]*)/);
  if (sw) {
    const sm = _mod('../copilot/lib/self-model'); if (!sm) return '(self-model unavailable)';
    const r = sm.switchAgent({ intent: 'directed', directed: sw[1], prompt: t });
    // §BUGFIX 2026-08-27 — same fix as copilot/server.js's HTTP
    // /api/agent/switch endpoint and the natural-language "switch to X"
    // trigger it was originally built for (2026-08-14): switchAgent() is a
    // pure local routing decision and never confirmed the target tab was
    // actually reachable. This CLI path was the remaining caller that
    // hadn't been wired to the same real, cheap verifyAgentReachable
    // round trip.
    if (!r.ok) return `Could not switch: ${r.reason}`;
    const reach = await sm.verifyAgentReachable(r.agent);
    const reachNote = reach && !reach.reachable ? ` (heads up: ${r.agent}'s tab didn't ack within the timeout — ${reach.error} — the switch is set, but that agent may not actually be reachable right now.)` : '';
    return `Routing to ${JSON.stringify(r.agent)}.${reachNote}`;
  }

  // roadmap [system] → the loom phasemap section
  if (/^roadmap\b/.test(low)) {
    const pm = _mod('../loom/scanners/phasemap-map'); if (!pm) return '(phasemap section unavailable)';
    const sys = t.split(/\s+/)[1];
    if (sys) { const r = pm.forSystem(sys); return `${sys}: ${r.total} phases — ${r.done} done, ${r.pending} pending.`; }
    return pm.summary().text;
  }

  // anything else → grammar engine resolves it to a capability
  const gr = _mod('../copilot/lib/grammar-router');
  if (gr) {
    try {
      const res = await gr.route(t, {});
      if (res && res.routed) return `→ ${res.componentId} (confidence ${res.confidence}${res.capability ? ', ' + res.capability.name : ''})`;
    } catch (_) {}
  }
  return `Unrecognized. Type "help" for the menu. (No confident capability match for "${t}".)`;
}

/**
 * start(opts) — launch the interactive REPL. Called by autopilot on --cli.
 */
function start(opts = {}) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: opts.input || process.stdin, output: opts.output || process.stdout, prompt: 'nexus> ' });
  (opts.output || process.stdout).write(HELP + '\n');
  rl.prompt();
  rl.on('line', async (line) => {
    const out = await handle(line);
    if (out === '__EXIT__') { rl.close(); return; }
    if (out) (opts.output || process.stdout).write(out + '\n');
    rl.prompt();
  });
  rl.on('close', () => { (opts.output || process.stdout).write('\nNEXUS CLI closed.\n'); if (opts.onClose) opts.onClose(); });
  return rl;
}

module.exports = { start, handle, HELP, MODULE_ID: 'nexus-cli-interface', VERSION: '1.0.0' };
