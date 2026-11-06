'use strict';
// component_id: emerge.lang.contract · spec: CIE-EG §6.1, MOD-CONTRACT (emerge/spec/cie-eg.spec) · phase CIE1 (Nexus docs/2026-11-06-cie-eg-build-phasemap.spec)
// James, 2026-11-06 (D7): "New contract block".
//
// The interaction contract as data. The parser hands over what it read; this module checks it, fills the defaults, and gives the one
// canonical form and its hash. Pure: no world state. The same parse and hash are written again in Emerge (lang/cie/contract.eg) and the
// two are checked against each other (lang/test/contract.test.js).
//
//   normalize(raw)       → Contract { id, version, text, gate, roads }   or throws ContractError (a refusal, said why)
//   contractHash(c)      → 64 hex: SHA-256 over ECF(c) (§4.3), the hash §6.1 puts into the genesis and every checkpoint
//   roadsFrom(c, hook)   → the roads leaving "Comp.hook"
//
// Roads are a set: they are sorted in the canonical form, so the order they are written in does not change the hash; a road written twice
// is refused. The defaults are the primitives' own values (lang/core/primitives.eg: dispatch.max_deliveries, ledger.checkpoint_every,
// observe.gaps.block_at), so a program with a contract and no gate block runs as it did without one.

const L = require('./ledger');

const SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;                        // §2.4 segment_regex
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const TEXT = { encoding: ['utf-8'], normalization: ['nfc'] };      // §2.2, §2.3: the only text the system speaks
const DEFAULTS = Object.freeze({ text: { encoding: 'utf-8', normalization: 'nfc' }, gate: { block_at: 0.9, max_steps: 100000, checkpoint_every: 256 } });

class ContractError extends Error {
  constructor(msg, at) { super(msg); this.at = at || null; }
}

const isHook = s => typeof s === 'string' && s.split('.').length === 2 && s.split('.').every(p => SEGMENT.test(p));

/**
 * raw: { id, version, text: {k: v}, gate: {k: v}, roads: [{from, to}], at?: {…} } as read from source (strings, numbers).
 * Every refusal names what was wrong; nothing is guessed or dropped.
 */
function normalize(raw, defaults = DEFAULTS) {
  const r = raw || {};
  if (!SEGMENT.test(String(r.id || ''))) throw new ContractError(`contract id "${r.id}" is not an identifier ([A-Za-z_][A-Za-z0-9_]*, CIE-EG 2.4)`);
  if (r.version === undefined) throw new ContractError(`contract ${r.id} has no version — write version = "1.0.0"`);
  if (typeof r.version !== 'string' || !SEMVER.test(r.version)) throw new ContractError(`contract ${r.id}: version "${r.version}" is not semver (x.y.z)`);

  const text = Object.assign({}, defaults.text);
  for (const [k, v] of Object.entries(r.text || {})) {
    if (!TEXT[k]) throw new ContractError(`contract ${r.id}: text has no setting "${k}" (it has ${Object.keys(TEXT).join(', ')})`);
    if (!TEXT[k].includes(v)) throw new ContractError(`contract ${r.id}: text.${k} = "${v}" — only ${TEXT[k].map(x => `"${x}"`).join(', ')} is spoken (CIE-EG 2.2, 2.3)`);
    text[k] = v;
  }

  const gate = Object.assign({}, defaults.gate);
  for (const [k, v] of Object.entries(r.gate || {})) {
    if (!(k in DEFAULTS.gate)) throw new ContractError(`contract ${r.id}: gate has no setting "${k}" (it has ${Object.keys(DEFAULTS.gate).join(', ')})`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new ContractError(`contract ${r.id}: gate.${k} must be a number`);
    if (k === 'block_at' && (v < 0 || v > 1)) throw new ContractError(`contract ${r.id}: gate.block_at = ${v} — a pressure is in [0, 1]`);
    if (k !== 'block_at' && (!Number.isInteger(v) || v < 1)) throw new ContractError(`contract ${r.id}: gate.${k} = ${v} — a whole number, at least 1`);
    gate[k] = v;
  }

  const seen = new Set();
  const roads = [];
  for (const rd of r.roads || []) {
    for (const end of ['from', 'to']) {
      if (!isHook(rd[end])) throw new ContractError(`contract ${r.id}: road end "${rd[end]}" is not Component.hook (identifiers only, CIE-EG 2.4)`, rd.at);
    }
    const key = `${rd.from}\0${rd.to}`;
    if (seen.has(key)) throw new ContractError(`contract ${r.id}: road ${rd.from} -> ${rd.to} is written twice`, rd.at);
    seen.add(key);
    roads.push({ from: rd.from, to: rd.to });
  }
  roads.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));

  return { id: r.id, version: r.version, text, gate, roads };
}

const canonical = c => L.ecf(c, 'contract');
const contractHash = c => L.sha(Buffer.from(canonical(c), 'utf8')).toString('hex');
const roadsFrom = (c, hook) => c.roads.filter(r => r.from === hook);

module.exports = { normalize, canonical, contractHash, roadsFrom, ContractError, DEFAULTS, isHook };
