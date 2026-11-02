'use strict';
/**
 * cos/manager/add-system.js — adding a system to COS: a proposal, and its declaration written when it is taken (SC4, 0.60.379).
 * Spec: cos/spec/cos-manager.spec MOD-MG-ADD-SYSTEM · Map: docs/2026-11-02-cos-console-phasemap.spec SC4_add_a_system, SC_D4.
 *
 * James, 2026-11-02: "Also needs to be an add system in the proposal section, or just in the general homepage."
 *
 * An add is a held act like an agent's (proposals.js, verb add-system): who, what folder, what it runs. His own add is taken in the same click
 * (USER_AUTONOMY); an agent's waits for him. Taking it writes the system's own declaration, <folder>/compartment.json (the system's file,
 * made by his act: §5.15), and the supervisor declares it live; nothing starts until he starts it. A folder that already declares itself, a
 * name already declared, a folder outside the tree or missing, or a missing entry file is refused, said.
 *
 *   createAddSystem(sup, proposals, { root }) → { propose({ name, dir, cmd, args, port, health, by, why }) → { proposal, taken? }, check }
 */
const fs = require('fs');
const path = require('path');

const err = (msg, code = 400) => Object.assign(new Error(msg), { code });

function createAddSystem(sup, proposals, { root = sup.root } = {}) {
  function check({ target, payload = {} }) {
    const name = String(target || '');
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) throw err(`a system's name is lower case, 2–31 letters, digits or dashes: not "${name}"`);
    if (sup.declarations().some(d => d.name === name || d.system === name)) throw err(`"${name}" is already declared`, 409);
    const dir = String(payload.dir || name).replace(/[\\/]+$/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(dir) || /^(data|node_modules|_archive)$/.test(dir)) throw err(`the folder is one top-level folder of Nexus (COS reads declarations there): not "${dir}"`);
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw err(`no folder ${dir}/ in ${root}`, 404);
    for (const f of ['compartment.json', `${dir}.cos`]) if (fs.existsSync(path.join(abs, f))) throw err(`${dir}/${f} already declares a system: COS reads it at its next start (or restart COS's manager)`, 409);
    const cmd = String(payload.cmd || 'node'); const args = Array.isArray(payload.args) ? payload.args.map(String) : payload.args ? String(payload.args).split(/[ ,]+/).filter(Boolean) : ['server.js'];
    if (/^node$/i.test(cmd) && args[0] && !args[0].startsWith('-') && !fs.existsSync(path.join(abs, args[0])) && !fs.existsSync(path.join(root, args[0]))) throw err(`its entry ${dir}/${args[0]} does not exist`, 404);
    const port = payload.port == null || payload.port === '' ? null : Number(payload.port);
    if (port !== null && !(Number.isInteger(port) && port > 0 && port < 65536)) throw err(`a port is 1–65535: not "${payload.port}"`);
    const taken = port && sup.list().find(v => v.port === port); if (taken) throw err(`:${port} is ${taken.name}'s`, 409);
    const health = port ? `http://127.0.0.1:${port}${String(payload.health || '/health').startsWith('/') ? '' : '/'}${payload.health || '/health'}` : null;
    return { payload: { dir, cmd, args, port, healthUrl: health }, why: `add ${name}: ${cmd} ${args.join(' ')} in ${dir}/${port ? ` on :${port}` : ''}` };
  }

  function run(p, { by }) {
    const { dir, cmd, args, port, healthUrl } = p.payload, name = p.target, abs = path.join(root, dir);
    for (const f of ['compartment.json', `${dir}.cos`]) if (fs.existsSync(path.join(abs, f))) throw err(`${dir}/${f} appeared since the proposal: not overwritten`, 409);
    // the entry path as the supervisor runs it: from Nexus's root (every declaration's cwd), so a bare file is under its folder
    const runArgs = /^node$/i.test(cmd) && args[0] && !args[0].startsWith('-') && !args[0].includes('/') ? [`${dir}/${args[0]}`, ...args.slice(1)] : args;
    const process_ = { name, cmd, args: runArgs, phase: 5, optional: true, ...(healthUrl ? { healthUrl } : {}) };
    const decl = { schema: 'nexus.compartment/1', id: `nexus.${name}`, name, label: name, dir,
      runtime: { entry: runArgs[0] || null, port, process: process_ },
      added: { by, at: new Date().toISOString(), proposal: p.id, how: 'COS: Add system (SC4)' } };
    fs.writeFileSync(path.join(abs, 'compartment.json'), JSON.stringify(decl, null, 2) + '\n');
    try { require('../../lib/versionium-record.js').record({ kind: 'cos.add-system', system: name, by, message: `COS: ${name} added (${dir}/compartment.json)`, change: { paths: [{ path: `${dir}/compartment.json`, before: null, after: JSON.stringify(decl, null, 2) + '\n' }] } }).catch(() => {}); } catch (_) {}
    return sup.declare({ system: name, ...process_, addedBy: by });
  }

  proposals.register('add-system', { check, run, people: true });

  function propose({ name, by, why, ...payload } = {}) {
    if (!by) throw err('say who adds it: { "by": "person" | "agent:<name>" }');
    const proposal = proposals.hold({ by, verb: 'add-system', target: name, why, payload });
    if (/^agent:|^rule:/.test(String(by))) return { proposal };
    const t = proposals.take(proposal.id, { by });   // his own add: taken in the same click
    return { proposal: t.proposal, taken: t.proposal, system: t.result };
  }
  return { propose, check };
}

module.exports = { createAddSystem, MODULE_ID: 'cos.manager.add-system', VERSION: '1.0.0' };
