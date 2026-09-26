'use strict';
/**
 * lib/agent-tools/tools/diagnostic/mock-data-finder.js — dedicated real
 * tool for finding literal fake/placeholder data left in the codebase.
 * comp_id: nexus.lib.agent-tools.tools.diagnostic.mock-data-finder
 * UUID: nexus-tool-mock-data-finder-v1-0000-2026-0913-jamesbrooks-001
 *
 * §BUILT 2026-09-13 — James: "can you create a .tool to find mock data
 * also." Real, distinct from stub_finder (same pass) — that tool finds
 * CODE SHAPES (a stub function, a mock-named identifier); this finds
 * literal DATA VALUES (placeholder emails/names/lorem-ipsum/phone
 * numbers) that read as real content but are conventional fakes,
 * regardless of what the surrounding code is named. See loom/scanners/
 * mock-data-finder.js's own header for the exact 4 signal classes and
 * their honest limits.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');

module.exports = {
  name: 'mock_data_finder',
  description:
    'Find real, literal placeholder/fake data left in the codebase — example.com/test.com/foo.com email ' +
    'addresses, "John Doe"/"Jane Doe"/"Foo Bar" stand-in names, lorem-ipsum text, and the reserved 555-01xx ' +
    '(or 123-456-7890) placeholder phone number patterns. Pattern matching over real source text, not ' +
    'data-flow tracing — see the result\'s own caveat field for the honest limits. Pair with stub_finder ' +
    '(code SHAPES that look fake) for the other real half of "is this actually real content."',
  parameters: {
    type: 'object',
    properties: {
      dirs:         { type: 'array', items: { type: 'string' }, description: 'real directories to scan, relative to project root — defaults to the same real system dirs loom/scanners/closed-door.js already scans' },
      includeTests: { type: 'boolean', description: 'also scan test files — placeholder data there is expected and excluded by default, since a real test fixture legitimately uses it' },
    },
  },
  async execute(args = {}) {
    try {
      const { scan } = require('../../../../loom/scanners/mock-data-finder.js');
      const opts = { rootDir: ROOT, includeTests: !!args.includeTests };
      if (Array.isArray(args.dirs) && args.dirs.length) opts.dirs = args.dirs;
      return { ok: true, ...scan(opts) };
    } catch (e) {
      return { ok: false, error: `mock_data_finder failed: ${e.message}` };
    }
  },
};
