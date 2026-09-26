'use strict';
/**
 * lib/agent-tools/tools/safe-apply.js — the real "verify before merge"
 * command. Thin wrapper (§16.5) over lib/safe-apply.js.
 * comp_id: nexus.lib.agent-tools.tools.safe-apply
 * UUID: nexus-tool-safe-apply-v1-0000-2026-0813-001
 */
const sa = require('../../../safe-apply.js');

const ACTIONS = {
  mirror: (a) => {
    if (!a.targetDir) return { error: 'mirror needs targetDir — the real directory to test changes against' };
    const { compartment } = sa.mirrorCompartment(a.targetDir, { name: a.name });
    return { ok: true, compartmentId: compartment.id, compartmentName: compartment.name, root: compartment.fs.root };
  },
  propose: async (a) => {
    if (!a.compartmentId) return { error: 'propose needs compartmentId — from a prior "mirror"' };
    if (!a.files || typeof a.files !== 'object') return { error: 'propose needs files — { "relative/path.js": "new content", ... }' };
    const { createHost } = require('../../../../cos/host/index.js');
    const host = createHost();
    const { listCompartments } = require('../../../../cos/cli/commands/list.js');
    const logs = [];
    listCompartments(host, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    let list; try { list = JSON.parse(logs.join('')); } catch (_) { list = []; }
    const compartment = list.find(c => c.id === a.compartmentId);
    if (!compartment) return { error: `no compartment "${a.compartmentId}" — mirror one first` };
    return await sa.proposeChange(compartment, a.files, { entryFile: a.entryFile, entryArgs: a.entryArgs, label: a.label });
  },
  merge: (a) => {
    if (!a.branchId || !a.targetDir) return { error: 'merge needs branchId (from "propose") and targetDir (the real directory to write into)' };
    return sa.mergeBack(a.branchId, a.targetDir, { allowUncheckedMerge: !!a.allowUncheckedMerge });
  },
};

module.exports = {
  name: 'safe_apply',
  description:
    'Real verify-before-merge for proposed file changes — isolate, apply, check, and only merge if the ' +
    'check genuinely passes. Actions: "mirror" (needs targetDir — copies a real directory into a fresh ' +
    'isolated COS compartment, returns compartmentId), "propose" (needs compartmentId + files — a real ' +
    'branch is forked, changes applied to it ONLY, optionally run with entryFile as a real check — the ' +
    'real target is never touched here), "merge" (needs branchId + targetDir — writes the branch\'s ' +
    'changes into the REAL target, but refuses if the branch was never checked or failed its check; ' +
    'RAID-governed). Nothing reaches the real target except through a passing merge.',
  parameters: {
    type: 'object',
    properties: {
      action:               { type: 'string', enum: Object.keys(ACTIONS) },
      targetDir:            { type: 'string', description: 'for "mirror"/"merge" — the real directory' },
      name:                 { type: 'string', description: 'for "mirror" — compartment name, optional' },
      compartmentId:        { type: 'string', description: 'for "propose" — from a prior mirror' },
      files:                { type: 'object', description: 'for "propose" — { "relative/path.js": "new full content" }' },
      entryFile:            { type: 'string', description: 'for "propose" — a real file to run as the check (e.g. the changed file itself)' },
      entryArgs:            { type: 'array', items: { type: 'string' }, description: 'for "propose" — extra args to the entry file' },
      label:                { type: 'string', description: 'for "propose" — human label for this branch' },
      branchId:             { type: 'string', description: 'for "merge" — from a prior propose' },
      allowUncheckedMerge:  { type: 'boolean', description: 'for "merge" — only if you genuinely want to merge an unchecked branch; refused by default' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `safe_apply ${args.action} failed: ${e.message}` }; }
  },
};
