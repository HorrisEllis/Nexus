/**
 * cli/commands/create.js
 * COMPARTMENT OS — cos create <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Creates a compartment via the SISO gate pipeline:
 *   emit('host:compartment:create', config) → CreateCompartmentGate → emit('host:compartment:created')
 *
 * The CLI wizard is input only. All logic lives in the gate.
 *
 * Hook: hk-h-001
 * Event: host:compartment:created
 */

'use strict';

const readline = require('readline');

const { Event }       = require('../../siso/Event.js');
const { HOST }        = require('../../foundation/event-contracts.js');
const { RUNTIME_IDS } = require('../../foundation/runtime-enum.js');
const { toSlug }      = require('../../host/gates/compartment.js');

// ─── createCompartment (programmatic — dispatches through gate) ───────────────

/**
 * Create a compartment by dispatching through the SISO gate pipeline.
 *
 * Emits 'host:compartment:create' → CreateCompartmentGate transforms it
 * → emits 'host:compartment:created' with the result.
 *
 * Returns the compartment synchronously because SISO dispatch is depth-first
 * and synchronous — the gate runs before emit() returns.
 *
 * @param {object} host   — { store, bus, sysmap }
 * @param {object} config — { name, purpose, runtimeId, networkIsolated }
 * @returns {object} the created compartment
 */
function createCompartment(host, config) {
  const { name, purpose, runtimeId, networkIsolated = true } = config;

  // Validate early so we can throw synchronously for callers that expect it
  if (!name) throw new Error('create: name is required');
  const slug = toSlug(name);
  if (!slug) throw new Error(`create: invalid name "${name}" — must produce a valid slug`);

  const existing = host.store.getCompartmentByName(name);
  if (existing) throw new Error(`create: compartment "${name}" already exists (id: ${existing.id})`);

  let result     = null;
  let errorData  = null;

  // Subscribe to the result event BEFORE emitting (sync dispatch — fires immediately)
  const unsubCreated = host.bus.on(HOST.COMPARTMENT_CREATED, ev => {
    if (ev.payload.name === name) result = ev.payload.compartment;
  });
  const unsubError = host.bus.on(HOST.COMPARTMENT_ERROR, ev => {
    if (ev.payload.operation === 'create') errorData = ev.payload;
  });

  // Dispatch through the gate — depth-first sync, gate runs before this returns
  host.bus.emit('host:compartment:create', {
    name, purpose, runtimeId, networkIsolated,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubCreated();
  unsubError();

  if (errorData) throw new Error(errorData.reason);
  if (!result)   throw new Error(`create: gate did not produce a compartment for "${name}"`);

  return result;
}

// ─── Interactive wizard ───────────────────────────────────────────────────────

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, ans => resolve(ans.trim())));
}

async function runCreateWizard(host, nameArg = null, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    log('');
    log('  ╔══════════════════════════════════╗');
    log('  ║   COMPARTMENT OS — New Compartment   ║');
    log('  ╚══════════════════════════════════╝');
    log('');

    let name = nameArg || '';
    while (!name) {
      name = await prompt(rl, '  Name: ');
      if (!name) log('  Name is required.');
      else if (!toSlug(name)) { log(`  Invalid name "${name}".`); name = ''; }
    }

    const existing = host.store.getCompartmentByName(name);
    if (existing) {
      error(`  Error: compartment "${name}" already exists.`);
      rl.close();
      return null;
    }

    const purpose = await prompt(rl, '  Purpose (describe what this does): ');

    log('');
    log('  Runtimes:');
    const shortList = ['node', 'python', 'deno', 'html', 'electron', 'go', 'rust', 'shell', 'other'];
    shortList.forEach((r, i) => log(`    ${i + 1}. ${r}`));
    let runtimeId = null;
    while (!runtimeId) {
      const ans = await prompt(rl, `  Runtime [1-${shortList.length}, or type runtime id, enter to skip]: `);
      if (!ans) break;
      const num = parseInt(ans);
      if (!isNaN(num) && num >= 1 && num <= shortList.length) {
        runtimeId = shortList[num - 1] === 'other' ? null : shortList[num - 1];
        break;
      }
      if (RUNTIME_IDS.includes(ans)) { runtimeId = ans; break; }
      log(`  Unknown runtime "${ans}".`);
    }

    log('');
    const netAns = await prompt(rl, '  Network isolated? [Y/n]: ');
    const networkIsolated = netAns.toLowerCase() !== 'n';

    log('');
    log('  ── Creating compartment… ──');

    try {
      const comp = createCompartment(host, { name, purpose, runtimeId, networkIsolated });
      log('');
      log(`  ✓  Created: ${comp.name}`);
      log(`     ID:      ${comp.id}`);
      log(`     Slug:    ${comp.slug}`);
      if (comp.runtimeId) log(`     Runtime: ${comp.runtimeId}`);
      log(`     Network: ${networkIsolated ? 'isolated' : 'open'}`);
      log(`     Path:    ${comp.fs.root}`);
      log('');
      rl.close();
      return comp;
    } catch (err) {
      error(`  Error: ${err.message}`);
      rl.close();
      return null;
    }
  } catch (err) {
    error(`  Error: ${err.message}`);
    rl.close();
    return null;
  }
}

module.exports = { createCompartment, runCreateWizard, toSlug };
