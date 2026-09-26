'use strict';
/**
 * lib/agent-tools/tools/query/compiler-info.js — compiler_info tool
 * UUID: nexus-tool-compiler-info-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James asked for a "compiler" tool. Checked first:
 * cos/foundation/compiler-enum.js is a real, immutable (COS-5) reference
 * table of 18 supported compilers/bundlers and their config files — but
 * there is no real "run a compile" gate anywhere in cos/host/gates/ to
 * wrap (checked all six gate files this session: archetype, blueprint,
 * playgrounds, plugin, process, vault, compartment — none of them
 * compile anything). Building a compile_run tool would be wrapping a
 * gate that doesn't exist — the exact dangling-declaration pattern
 * loom's own scanner flags. This is the honest, real scope: a lookup
 * over the actual enum, useful for an agent deciding which compiler a
 * project uses from its config file, not a fabricated build action.
 */
const { COMPILERS, COMPILER_MAP } = require('../../../../cos/foundation/compiler-enum.js');

module.exports = {
  name: 'compiler_info',
  description:
    'Look up COS\'s known compilers/bundlers and the config file each is identified by. Actions: "list" ' +
    '(all 18, with configFile), "get" (needs id — one compiler\'s detail). Read-only reference data; does ' +
    'not run a build — no real "compile" execution gate exists anywhere in COS to call.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'get'] },
      id:     { type: 'string', description: 'for "get" — a compiler id, e.g. "tsc", "webpack", "cargo"' },
    },
    required: ['action'],
  },
  async execute({ action, id } = {}) {
    if (action === 'list') return { ok: true, count: COMPILERS.length, compilers: COMPILERS };
    if (action === 'get') {
      if (!id) return { error: 'get needs id' };
      const c = COMPILER_MAP.get(id);
      return c ? { ok: true, compiler: c } : { ok: false, error: `unknown compiler id "${id}" — one of: ${[...COMPILER_MAP.keys()].join(', ')}` };
    }
    return { error: `unknown action "${action}" — one of: list, get` };
  },
};
