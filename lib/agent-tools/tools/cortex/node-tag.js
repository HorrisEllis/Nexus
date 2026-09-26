'use strict';
/**
 * lib/agent-tools/tools/cortex/node-tag.js — cortex.node_tag.tool
 *
 * James's taxonomy: "A .node tagging .tool."
 *
 * §CHECKED FIRST, NOT ASSUMED — cortex/registry-components.js already
 * declared tags.list (GET /api/tags) and tags.add (POST /api/tags) as
 * real, and orchestrator.js's own route comment documents the same
 * contract (entityId/entityType/system/tags[]). Repo-wide grep found
 * zero actual handler for either — a documented-but-dead route, the
 * same class of gap this codebase's own dangling-report.js exists to
 * catch. Closed at the source (cortex/boot.js) in the same pass as this
 * tool, not papered over — this tool calls a route that is now real.
 *
 * §SCOPE — tags any node by entityId (a component id, event uuid, spec
 * id, whatever the caller is tagging — cortex doesn't validate entityType
 * against a fixed list, same open-schema choice /api/push already makes
 * for its own tags field).
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const CORTEX_HOST = process.env.CORTEX_HOST || '127.0.0.1';
const CORTEX_PORT = parseInt(process.env.CORTEX_HTTP_PORT || '3748', 10);

function _request(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: CORTEX_HOST, port: CORTEX_PORT, path, method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        timeout: 8000,
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
          catch (e) { resolve({ ok: false, error: `bad JSON from cortex: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'cortex request timed out' }); });
    if (data) req.write(data);
    req.end();
  });
}

/** Validates the add-tag shape before ever making a network call — pure, independently testable. */
function validateAdd({ entityId, tags }) {
  if (!entityId) return 'entityId is required';
  if (!Array.isArray(tags) || !tags.length) return 'tags[] is required and must be non-empty';
  return null;
}

module.exports = {
  name: toolName('cortex', 'node_tag'),
  description:
    'List or add tags on any node (component, event, spec — any entityId) via cortex\'s real /api/tags store. ' +
    'action:"list" optionally filtered by entityId, or action:"add" with entityId + tags[] (entityType/system optional).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'add'], description: 'list or add' },
      entityId: { type: 'string', description: 'the node/entity being tagged or queried' },
      entityType: { type: 'string', description: 'optional — e.g. "component", "event", "spec"' },
      system: { type: 'string', description: 'optional — which NEXUS system owns this entity' },
      tags: { type: 'array', items: { type: 'string' }, description: 'required for action:"add"' },
    },
    required: ['action'],
  },
  execute: async ({ action, entityId, entityType, system, tags }) => {
    if (action === 'list') {
      const path = entityId ? `/api/tags?entityId=${encodeURIComponent(entityId)}` : '/api/tags';
      const result = await _request('GET', path);
      if (!result.ok) return { error: result.error || `cortex returned status ${result.status}` };
      return result.body;
    }
    if (action === 'add') {
      const err = validateAdd({ entityId, tags });
      if (err) return { error: err };
      const result = await _request('POST', '/api/tags', { entityId, entityType, system, tags });
      if (!result.ok) return { error: result.error || `cortex returned status ${result.status}` };
      return result.body;
    }
    return { error: `unknown action "${action}" — must be "list" or "add"` };
  },
  _validateAdd: validateAdd, // exposed for tests, no live cortex needed
};
