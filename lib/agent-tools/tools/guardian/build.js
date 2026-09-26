'use strict';
/**
 * lib/agent-tools/tools/guardian/build.js — guardian.build.tool
 *
 * James's taxonomy: "Building and coding .tools for guardian."
 *
 * §CHECKED FIRST — guardian/dispatch.js (old flat naming, still real)
 * covers agent dispatch, not building. guardian/server.js:2531's real
 * POST /build ("THE BUILD ROUTE" per its own header — spec → T0 scaffold
 * → T1 wiring → T2 Ollama → files) had zero tool coverage anywhere in
 * lib/agent-tools/tools/ — confirmed by grep across every registerTool()
 * call before writing this. This was the actual example used in
 * naming.js's own docstring (`toolName('guardian', 'build')` ->
 * 'guardian.build.tool') — that name was reserved, never built until now.
 *
 * §HONEST BOUNDARY — this is a thin, faithful wrapper. It does not
 * retry, does not second-guess RAID's own approval gate (guardian's
 * /build already 403s honestly with a reason if unapproved — that
 * response is passed straight through, not swallowed), and does not
 * invent a dry-run default beyond mirroring the route's own default
 * (dryRun=false).
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820', 10);

function _post(path, body, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: GUARDIAN_HOST, port: GUARDIAN_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: timeoutMs,
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
          catch (e) { resolve({ status: res.statusCode, error: `bad JSON from guardian: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'guardian unreachable — is it running?' }); });
    req.write(data);
    req.end();
  });
}

/** Pure precondition check, mirrors the real route's own 400 case — testable without a live guardian. */
function validate({ specPath, specText }) {
  if (!specPath && !specText) return 'specPath or specText required';
  return null;
}

module.exports = {
  name: toolName('guardian', 'build'),
  description:
    'Run a real spec through guardian\'s build pipeline (spec → scaffold → wiring → provider generation → files) ' +
    'via the real POST /build route. Pass either specPath (existing .spec file) or specText (inline spec). ' +
    'Honestly surfaces a RAID denial (403) or pipeline failure rather than pretending success.',
  parameters: {
    type: 'object',
    properties: {
      specPath: { type: 'string', description: 'path to an existing .spec file' },
      specText: { type: 'string', description: 'inline spec text, alternative to specPath' },
      name: { type: 'string', description: 'build name, used for default outputDir when specText is used' },
      outputDir: { type: 'string', description: 'optional explicit output directory' },
      provider: { type: 'string', description: 'default "ollama"' },
      dryRun: { type: 'boolean', description: 'default false' },
      verbose: { type: 'boolean', description: 'default false' },
      proof: { type: 'string', description: 'optional — proof payload for RAID\'s _approveTool gate' },
    },
  },
  execute: async (a = {}) => {
    const err = validate(a);
    if (err) return { error: err };
    const result = await _post('/build', {
      specPath: a.specPath, specText: a.specText, name: a.name, outputDir: a.outputDir,
      provider: a.provider || 'ollama', dryRun: !!a.dryRun, verbose: !!a.verbose, proof: a.proof,
    });
    if (result.error) return { error: result.error };
    if (result.status === 403) return { denied: true, reason: result.body?.reason || 'RAID approval denied' };
    return result.body;
  },
  _validate: validate, // exposed for tests, no live guardian needed
};
