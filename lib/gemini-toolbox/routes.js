'use strict';
/**
 * lib/gemini-toolbox/routes.js — HTTP surface for the Gemini toolbox
 * UUID: nexus-gemini-toolbox-routes-v1-0000-2026-0804-001
 *
 * Mounts under /gemini-tool on guardian (:7820), so the ui/agents/gemini code
 * suite — and any system — can reach the toolbox over HTTP. Read/verify are
 * direct; APPLY does not write here — it returns the new content for RAID to
 * govern the actual write (§RAID is the decision/governance system).
 *
 * handleGeminiTool(req, res) — returns true if it handled the request, false if
 * the path isn't ours (so guardian's dispatcher falls through). §1.2 — every
 * error is a stated JSON reason, never a silent hang.
 */

const toolbox = require('./index');

function _json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function _readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', c => d += c);
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function handleGeminiTool(req, res) {
  const url = (req.url || '').split('?')[0];
  if (!url.startsWith('/gemini-tool/')) return false;
  const op = url.slice('/gemini-tool/'.length);

  if (req.method === 'OPTIONS') { _json(res, 200, { ok: true }); return true; }
  if (req.method !== 'POST') { _json(res, 405, { error: 'POST only' }); return true; }

  const body = await _readBody(req);
  try {
    switch (op) {
      case 'contract':
        _json(res, 200, toolbox.getContract()); return true;
      case 'parse':
        _json(res, 200, toolbox.parseForGemini(body.path, { maxLinesPerChunk: body.maxLinesPerChunk })); return true;
      case 'range':
        _json(res, 200, toolbox.readRange(body.path, body.startLine, body.endLine)); return true;
      case 'verify':
        _json(res, 200, toolbox.verifyEdit(body.edit)); return true;
      case 'apply': {
        // §RAID — apply produces the new content but does NOT write; it hands off
        // to RAID for the governed write. Here we return the content + a flag.
        const out = toolbox.applyEdits(body.path, body.edits || []);
        _json(res, 200, { ...out, note: out.ok ? 'content generated — write must go through RAID governance' : undefined });
        return true;
      }
      default:
        _json(res, 404, { error: `unknown gemini-tool op "${op}"` }); return true;
    }
  } catch (e) {
    _json(res, 400, { error: e.message }); return true;
  }
}

module.exports = { handleGeminiTool };
