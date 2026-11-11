'use strict';
/**
 * cortex/core/raid/input.js — every input reaches RAID first, kept as a .input node (phase RD9 slice a).
 * James, 2026-11-12: "I want raid to get done. That way we can have the cli in nexus hooked into raid, inputs into raid, saved as a .input
 * node, then raid decides what to do with using the routing."
 *
 *   take({ text, from, by, args }, { dir, decide }) → { ok, id, file, envelopeId, decision }
 *   list({ dir, limit }) → the latest inputs, newest first
 *
 * The input is written BEFORE RAID decides (nothing is lost if deciding fails). Then RAID's envelope is made (envelope.js), the decision
 * taken (decide: RAID's own, handed in by Cortex), and the decision and its why written back on the node. Slice a records; it does not
 * act (slice b). JavaScript, said: Cortex's RAID is JavaScript; no .eg port of RAID is mapped yet.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const envelopeLib = require('./envelope.js');
const NE = require('../../../lib/node-export.js');
const fileOf = (dir, id) => path.join(dir, `${id}.input`);
const write = (dir, id, payload, summary) => { fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fileOf(dir, id), NE.toYaml(NE.wrap('input', id, payload, { system: 'cortex', context: 'an input to RAID, kept before it is routed (RD9)', intent: String(payload.text).slice(0, 120), summary }))); };

async function take({ text, from, by, args } = {}, { dir, decide, now = Date.now } = {}) {
  const words = String(text == null ? '' : text).trim();
  if (!words) return { ok: false, code: 400, error: 'an input needs its words: { "text": "…" }' };
  if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
  const at = now(), id = `in-${at}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = { id, text: words, args: args || null, from: from || 'unknown', by, at, envelopeId: null, decision: null };
  write(dir, id, payload, 'not routed yet');
  const env = envelopeLib.make(words, { from: payload.from, payload: { text: words, args: args || null, input: id }, ts: at });
  let decision; try { decision = { ...(await decide(words, env)), at: now() }; } catch (e) { decision = { error: `RAID could not decide: ${e.message}`, at: now() }; }
  payload.envelopeId = env.envelopeId; payload.decision = decision;
  write(dir, id, payload, decision.error ? 'not decided' : `routed: ${decision.provider || decision.target || decision.agent || 'decided'}`);
  return { ok: true, id, file: fileOf(dir, id), envelopeId: env.envelopeId, decision };
}
function list({ dir, limit = 50 } = {}) {
  let names = []; try { names = fs.readdirSync(dir).filter(f => f.endsWith('.input')).sort().reverse().slice(0, limit); } catch (_) {}
  return names.map(f => { try { return NE.fromYaml(fs.readFileSync(path.join(dir, f), 'utf8')).payload; } catch (_) { return null; } }).filter(Boolean);
}
module.exports = { take, list, MODULE_ID: 'cortex.raid.input' };
