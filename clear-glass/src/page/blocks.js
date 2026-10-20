'use strict';
/**
 * clear-glass/src/page/blocks.js — PM1: the page as blocks, every element of substance, each with a stable id.
 * comp_id: clear-glass.page.blocks
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM1_blocks)
 *
 * James, 2026-10-19: "like i need copilot to use clearglass more effectively. parse the dom, index each element as blocks, then
 * download into a index to chunk, then synthesize a fucking map in relation to the weboage to use as a map or reference point for
 * inputs from the cli or the intent. learns over time."
 *
 * Reuse (§8.6): the in-page walk is page/semantic-tree.js's own, in its content mode — the same roles, accessible names and
 * addresses (main › form "Apply" › textbox "Email") the agent already acts by, widened to what a page SAYS (paragraphs, lists,
 * tables, images, code, text-bearing boxes), each with its box (x, y, w, h), z (layers over its centre — the interaction field's
 * rule; -1 off-screen), text and attributes. This file is the Node side: the script to run, and normalize() → blocks.
 *
 *   pageScript(opts)          the script driver.eval runs (semantic-tree's walk with content: true)
 *   normalize(raw, opts)      → { url, title, site, blocks: [block], cut, stats }
 *     block: { id, i, kind, role, name, text, address, selector, tag, box, z, parent, depth, level?, value?, states?, attrs? }
 *     kind:  landmark | heading | field | action | link | content | container
 *     id:    stable across visits — a hash of the address without its #n and a signature of the text, numbered only when two
 *            blocks share both (so a paragraph inserted above another does not rename it)
 *   siteKey(url)              origin + path, with ids, numbers and hashes in the path generalized (/jobs/123 → /jobs/:id)
 */
const crypto = require('crypto');
const ST = require('./semantic-tree');

const MODULE_ID = 'clear-glass.page.blocks';
const VERSION = '1.0.0';
const DEFAULTS = Object.freeze({ maxBlocks: 1500, maxText: 300, minText: 24 });

const LANDMARK = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region', 'dialog', 'alertdialog']);
const CONTAINER = new Set(['article', 'log', 'feed']);
const FIELD = new Set(['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'listbox']);
const ACTION = new Set(['button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option']);

function kindOf(role) {
  if (LANDMARK.has(role)) return 'landmark';
  if (CONTAINER.has(role)) return 'container';
  if (role === 'heading') return 'heading';
  if (FIELD.has(role)) return 'field';
  if (ACTION.has(role)) return 'action';
  if (role === 'link') return 'link';
  return 'content';
}

/** siteKey(url) — one key per kind of page, not per page: /jobs/123/apply and /jobs/456/apply are the same map */
function siteKey(url) {
  let u; try { u = new URL(String(url)); } catch (_) { return String(url || '').slice(0, 200); }
  const segs = u.pathname.split('/').filter(Boolean).map(s => (/^\d+$/.test(s) || /^[0-9a-f]{8,}$/i.test(s) || /^[0-9a-f-]{20,}$/i.test(s) || (/\d/.test(s) && s.length > 12)) ? ':id' : s);
  return `${u.protocol === 'file:' ? 'file://' : u.origin}/${segs.join('/')}`;
}

const _h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const _sig = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 48);

function pageScript(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return ST.pageScript({ content: true, maxNodes: o.maxBlocks, maxText: o.maxText, minText: o.minText });
}

function normalize(raw, opts = {}) {
  const r = raw || {};
  const nodes = Array.isArray(r.nodes) ? r.nodes : [];
  const seen = new Map();
  const blocks = nodes.map((n) => {
    const base = String(n.address || '').replace(/\s+#\d+$/, '');
    const key = `${base}|${n.role}|${_sig(n.role === 'textbox' || n.role === 'searchbox' ? '' : n.text || n.name)}`;
    const c = (seen.get(key) || 0) + 1; seen.set(key, c);
    const b = { id: `b${_h(c > 1 ? `${key}|${c}` : key)}`, i: n.i, kind: kindOf(n.role), role: n.role, name: n.name || '', text: n.text || '',
      address: n.address, selector: n.selector || null, tag: n.tag || null, box: n.box || null, z: n.z === undefined ? null : n.z, parent: n.parent, depth: n.depth };
    for (const k of ['level', 'value', 'states', 'attrs']) if (n[k] != null) b[k] = n[k];
    return b;
  });
  const byKind = {}; for (const b of blocks) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
  return { url: r.url || null, title: r.title || '', site: siteKey(r.url || ''), blocks, cut: r.cut || 0, stats: { blocks: blocks.length, byKind },
    ...(r.cut ? { note: `${r.cut} element(s) past the ${opts.maxBlocks || DEFAULTS.maxBlocks}-block budget were not read` } : {}) };
}

module.exports = { MODULE_ID, VERSION, DEFAULTS, pageScript, normalize, siteKey, kindOf };
