'use strict';
/**
 * intelligence/consumer.js — the input half of the queue, matching
 * emerge/consumer.js's exact, established pattern. James: "input and
 * output folder, queue system." intelligence/output/ (framework-
 * builder.js's drop()) was the result half, already built; this is the
 * pending-work half — watches intelligence/input/ via the same real,
 * general lib/contract-queue.js every other real system already uses,
 * not a new queue mechanism.
 *
 * Contract shape (payload.type === 'framework_build'):
 *   { type: 'framework_build', name, agent?, description?, tags? }
 *
 * Run standalone: `node intelligence/consumer.js`
 * Or required and started programmatically: `require('./consumer').start()`
 */
const path = require('path');
const cq = require('../lib/contract-queue');
const frameworkBuilder = require('./framework-builder.js');

const MODULE_ID = 'intelligence/consumer';
const VERSION = '1.0.0';
const config = require('./config.js');
const POLL_MS = config.POLL_MS;

async function processOne(contract) {
  const { uuid } = contract;
  const type = contract.payload?.type;
  console.log(`[${MODULE_ID}] accepting ${uuid} (${type || 'unknown'})`);
  cq.accept('intelligence', uuid);

  try {
    if (type !== 'framework_build') {
      throw new Error(`unknown contract payload type: ${type || '(none)'}`);
    }
    if (!contract.payload.name) {
      throw new Error('framework_build contract has no name');
    }
    const result = frameworkBuilder.drop(contract.payload.name, {
      agent: contract.payload.agent, description: contract.payload.description, tags: contract.payload.tags,
    });
    cq.complete('intelligence', uuid, result);
    console.log(`[${MODULE_ID}] ✓ ${uuid} → ${result.outPath}`);
  } catch (e) {
    cq.fail('intelligence', uuid, e.message);
    console.warn(`[${MODULE_ID}] ✗ ${uuid} failed: ${e.message}`);
  }
}

async function tick() {
  let contracts;
  try { contracts = cq.pending('intelligence'); }
  catch (e) { console.warn(`[${MODULE_ID}] pending() failed: ${e.message}`); return; }
  for (const c of contracts) await processOne(c);
}

let _interval = null;
function start() {
  tick();
  _interval = setInterval(tick, POLL_MS);
  console.log(`[${MODULE_ID}] watching intelligence/input/ every ${POLL_MS}ms`);
  return { stop };
}
function stop() { if (_interval) clearInterval(_interval); }

if (require.main === module) start();

module.exports = { start, stop, tick, processOne, MODULE_ID, VERSION };
