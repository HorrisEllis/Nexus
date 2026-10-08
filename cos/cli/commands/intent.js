/**
 * cli/commands/intent.js
 * COMPARTMENT OS — cos intent <name> [--file=<intent.spec>] · cos verify <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * James (2026-10-07): "the intent of compartment is the end state." A compartment's intent (foundation/intent.js) is
 * set through the SISO gate pipeline (SetIntentGate) and checked through it (VerifyCompartmentGate):
 *   emit('host:compartment:set-intent') → SetIntentGate      → emit('host:compartment:intent-set')
 *   emit('host:compartment:verify')     → VerifyCompartmentGate → emit('host:compartment:verified')
 * The CLI is input and output only. All logic lives in the gates.
 */

'use strict';

const fs = require('fs');
const { HOST }  = require('../../foundation/event-contracts.js');
const INTENT    = require('../../foundation/intent.js');

function _dispatch(host, request, done, operation, data) {
  let result = null, errorData = null;
  const unsubDone = host.bus.on(done, ev => { if (ev.payload.name === data.name || ev.payload.compartment?.name === data.name || ev.payload.compartmentId === data.name) result = ev.payload; });
  const unsubErr  = host.bus.on(HOST.COMPARTMENT_ERROR, ev => { if (ev.payload.operation === operation) errorData = ev.payload; });
  host.bus.emit(request, { ...data, store: host.store, sysmap: host.sysmap });
  unsubDone(); unsubErr();
  if (errorData) throw new Error(errorData.reason);
  if (!result) throw new Error(`${operation}: the gate produced nothing for "${data.name}"`);
  return result;
}

/** setIntent(host, { name, intent }) → the updated compartment. intent: { endState, conditions, axioms } or a spec's text */
function setIntent(host, { name, intent }) {
  if (!name) throw new Error('intent: name is required');
  let raw = intent;
  if (typeof intent === 'string') { const p = INTENT.parse(intent); if (p.errors.length) throw new Error(`the intent was refused: ${p.errors.join('; ')}`); raw = p.intent; }
  return _dispatch(host, 'host:compartment:set-intent', HOST.COMPARTMENT_INTENT_SET, 'set-intent', { name, intent: raw }).compartment;
}

/** verifyCompartment(host, { name }) → { status, compartment } — checked against its end state and its conditions */
function verifyCompartment(host, { name }) {
  if (!name) throw new Error('verify: name is required');
  const r = _dispatch(host, 'host:compartment:verify', HOST.COMPARTMENT_VERIFIED, 'verify', { name });
  return { status: r.status, compartment: r.compartment };
}

/** intentLines(comp, store) — the intent and its last check, as status lines */
function intentLines(comp, store) {
  const eff = INTENT.effective(comp, store);
  if (INTENT.isEmpty(eff)) return ['     (none — the end state is how this compartment knows it is done: cos intent <name> --file=intent.spec)'];
  const st = comp.intentStatus && !comp.intentStatus.none ? comp.intentStatus : null;
  const mark = (list, i) => { const r = st && list && list.results && list.results[i]; return r ? (r.met ? '✓' : '✗') : '·'; };
  const lines = [];
  lines.push(`     end state:   ${st ? `${st.endState.met}/${st.endState.total} reached${st.reached ? ' — the intent is achieved' : ''}` : 'not checked yet (cos verify)'}`);
  eff.endState.forEach((e, i) => lines.push(`       ${mark(st && st.endState, i)} ${e.says}`));
  if (eff.conditions.length) {
    lines.push(`     conditions:  ${st ? (st.ok ? 'all hold' : `${st.conditions.total - st.conditions.met} broken`) : 'not checked yet'}`);
    eff.conditions.forEach((c, i) => lines.push(`       ${mark(st && st.conditions, i)} ${c.says}${c.inherited ? `  (from ${c.inherited})` : ''}`));
  }
  if (eff.axioms.length) { lines.push('     axioms:'); eff.axioms.forEach(a => lines.push(`       ◆ ${a}`)); }
  if (st) lines.push(`     checked:     ${new Date(st.ts).toISOString()}`);
  return lines;
}

function readIntentFile(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(`intent: cannot read ${file}: ${e.message}`); }
  const p = INTENT.parse(text);
  if (p.errors.length) throw new Error(`the intent in ${file} was refused: ${p.errors.join('; ')}`);
  return p.intent;
}

module.exports = { setIntent, verifyCompartment, intentLines, readIntentFile };
