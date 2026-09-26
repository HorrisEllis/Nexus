'use strict';
/**
 * lib/agent-tools/tools/diagnostic/stub-finder.js — dedicated real tool
 * for finding stubs/mocks/placeholders in the codebase.
 * comp_id: nexus.lib.agent-tools.tools.diagnostic.stub-finder
 * UUID: nexus-tool-stub-finder-v1-0000-2026-0913-jamesbrooks-001
 *
 * §BUILT 2026-09-13 — James: "no a .tool for the stubs finder to find
 * stubs in the codebase." loom_scan's "stubs" action (same pass, same
 * real scanner) already exposes this, but as one action buried in a
 * multi-purpose tool; this is the same real logic — loom/scanners/
 * stub-finder.js, not reimplemented — as its own first-class, directly
 * discoverable tool. Both stay wired; this doesn't replace that one,
 * loom_scan's own "before nexus_heal's propose" workflow still wants
 * stubs alongside dangling/closed_door in one place.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');

module.exports = {
  name: 'stub_finder',
  description:
    'Find real stubs, mocks, and placeholders left in the codebase — TODO/FIXME/STUB/MOCK/PLACEHOLDER/HACK ' +
    'comments, throw-new-Error("not implemented") bodies, and mock/stub/fake/dummy-named functions outside ' +
    'test files. Pattern matching over real source text, not static analysis — see the result\'s own caveat ' +
    'field for the honest limits. Pair with loom_scan\'s "closed_door" action (real code with zero external ' +
    'consumers) for the other real half of "is this actually built or just standing in for something real."',
  parameters: {
    type: 'object',
    properties: {
      dirs:         { type: 'array', items: { type: 'string' }, description: 'real directories to scan, relative to project root — defaults to the same real system dirs loom/scanners/closed-door.js already scans' },
      includeTests: { type: 'boolean', description: 'also scan test files for markers/throw-not-implemented (mock-named identifiers stay excluded there by design regardless) — default false' },
    },
  },
  async execute(args = {}) {
    try {
      const { scan } = require('../../../../loom/scanners/stub-finder.js');
      const opts = { rootDir: ROOT, includeTests: !!args.includeTests };
      if (Array.isArray(args.dirs) && args.dirs.length) opts.dirs = args.dirs;
      return { ok: true, ...scan(opts) };
    } catch (e) {
      return { ok: false, error: `stub_finder failed: ${e.message}` };
    }
  },
};
