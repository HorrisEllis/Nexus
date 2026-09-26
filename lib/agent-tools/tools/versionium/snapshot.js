'use strict';
/**
 * lib/agent-tools/tools/versionium/snapshot.js — versionium.snapshot.tool
 *
 * James's taxonomy: "Versions, revisions, and snapshots .tools for
 * versionium." This half covers a specific commit's snapshot — reading
 * its captured state, or restoring to it. See versionium.history.tool
 * for the log/calendar (browse-many) side.
 *
 * §CHECKED FIRST — GET /api/versionium/state/:commitId and
 * /api/versionium/restore/:commitId are both real, live routes in
 * versionium/routes/versionium.js, with zero tool coverage before this.
 *
 * §HONEST BOUNDARY — restore is a genuinely mutating action (the route's
 * own handler emits versionium.restore.requested/failed events and can
 * return a completion callback result). This tool does not default to
 * restore; action must be explicitly passed as "restore", same
 * no-silent-mutation posture as guardian.build.tool's RAID passthrough.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const VERSIONIUM_HOST = process.env.VERSIONIUM_HOST || '127.0.0.1';
const VERSIONIUM_PORT = parseInt(process.env.VERSIONIUM_PORT || '3754', 10);

function _get(path) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: VERSIONIUM_HOST, port: VERSIONIUM_PORT, path, method: 'GET', timeout: 8000 },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
          catch (e) { resolve({ ok: false, error: `bad JSON from versionium: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'versionium request timed out' }); });
    req.end();
  });
}

module.exports = {
  name: toolName('versionium', 'snapshot'),
  description:
    'Read or restore a specific commit\'s snapshot. action:"read" (default) returns the captured state for ' +
    'commitId. action:"restore" actually restores NEXUS to that commit — a real mutating action, not a preview.',
  parameters: {
    type: 'object',
    properties: {
      commitId: { type: 'string', description: 'the versionium commit id' },
      action: { type: 'string', enum: ['read', 'restore'], description: 'read (default) or restore' },
    },
    required: ['commitId'],
  },
  execute: async ({ commitId, action = 'read' }) => {
    if (!commitId) return { error: 'commitId is required' };
    const path = action === 'restore'
      ? `/api/versionium/restore/${encodeURIComponent(commitId)}`
      : `/api/versionium/state/${encodeURIComponent(commitId)}`;
    const result = await _get(path);
    if (!result.ok) return { error: result.error || `versionium returned status ${result.status}` };
    return result.body;
  },
};
