'use strict';
/**
 * clear-glass/src/providers/selector-assign.js — v0.39.251
 * comp_id: nexus.clear-glass.src.providers.selector-assign
 * UUID: cg-selector-assign-v1-0000-2026-0925-jamesbrooks-001
 *
 * Main-process half of "the element picker assigns selectors" (handoff
 * 2026-09-25, step 1). The renderer's selector-assign area has already run the
 * live check on the page (renderer/selector-check.js); this module:
 *
 *   providerForUrl(url) — which NCP provider a page belongs to, read from
 *     src/providers/registry.js (Clear Glass's single source of truth for
 *     provider hosts — not a second list);
 *   assign({ provider, key, selector, evidence }) — refuses anything that does
 *     not carry the check's evidence, refuses evidence taken on another
 *     provider's page, then POSTs guardian's own route
 *     POST :7820/api/agents/:provider/selectors (guardian/lib/selector-map.js),
 *     source 'picker'. Guardian's answer comes back verbatim — including its
 *     refusals — so what the person sees is what guardian actually recorded.
 *
 * Never throws; an unreachable guardian is reported as such (§1.2), never as
 * success.
 */
const http = require('http');
const { listProviders } = require('./registry');

const MODULE_ID = 'clear-glass.selector-assign';
const VERSION = '1.0.0';
const KEYS = ['resp', 'input', 'send'];
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_HTTP_PORT || '7820', 10);

function providerForUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return null; }
  const p = listProviders().find(x => (x.hosts || []).includes(host));
  return p ? { id: p.id, name: p.name, color: p.color || null } : null;
}

function _post(path, body, { port = GUARDIAN_PORT, host = '127.0.0.1', timeoutMs = 5000, request = http.request } = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    let req;
    try {
      req = request({ hostname: host, port, path, method: 'POST', timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let buf = '';
        res.on('data', c => { buf += c; });
        res.on('end', () => {
          let json = null; try { json = JSON.parse(buf); } catch (_) {}
          resolve({ status: res.statusCode, body: json, raw: json ? null : buf.slice(0, 300) });
        });
      });
    } catch (e) { resolve({ status: 0, error: e.message }); return; }
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: `no answer in ${timeoutMs}ms` }); });
    req.write(data); req.end();
  });
}

/** Validate before anything leaves this process. Returns an error string or null. */
function validate({ provider, key, selector, evidence } = {}) {
  if (!provider || typeof provider !== 'string') return 'provider required';
  if (!KEYS.includes(key)) return `key must be one of ${KEYS.join(', ')}`;
  if (!selector || typeof selector !== 'string') return 'selector required';
  if (!evidence || typeof evidence !== 'object') return 'evidence of the live check required';
  if (!(evidence.matched >= 1)) return 'evidence.matched must be >= 1 — the selector matched nothing when checked';
  if (typeof evidence.url !== 'string') return 'evidence.url required';
  const onPage = providerForUrl(evidence.url);
  if (!onPage) return `evidence was taken on ${evidence.url}, which is not a known provider page`;
  if (onPage.id !== provider) return `evidence was taken on ${onPage.name}'s page, not ${provider}'s`;
  return null;
}

async function assign(payload = {}, opts = {}) {
  const err = validate(payload);
  if (err) return { ok: false, error: err, guardian: null };
  const { provider, key, selector, evidence } = payload;
  const r = await _post(`/api/agents/${encodeURIComponent(provider)}/selectors`, {
    selectors: { [key]: selector },
    source: 'picker',
    evidence: { ...evidence, key, checkedBy: 'clear-glass/renderer/selector-check.js' },
  }, opts);
  if (!r.status) return { ok: false, error: `guardian unreachable: ${r.error}`, guardian: null };
  const body = r.body || { ok: false, error: `guardian answered ${r.status} with no JSON`, raw: r.raw };
  return { ok: body.ok === true, status: r.status, error: body.ok ? null : (body.error || `guardian answered ${r.status}`), guardian: body };
}

module.exports = { MODULE_ID, VERSION, KEYS, providerForUrl, validate, assign };
