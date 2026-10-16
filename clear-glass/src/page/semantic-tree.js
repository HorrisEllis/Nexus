'use strict';
/**
 * clear-glass/src/page/semantic-tree.js — SP1: the page as a semantic tree, for Clear Glass's own browser agent.
 * comp_id: clear-glass.page.semantic-tree
 * Map: docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec (SP1)
 *
 * James (2026-10-15): "what about a semantic tree for our own browser agent?"
 *
 * WHY. The agent found things by CSS (page/reader.js) and the userscripts by selectors in a field map. Sites rename
 * their classes; his last run lost Claude's reply ("needs-you") and saved ChatGPT's placeholder as the send button.
 * What a person (and a screen reader) goes by does not churn: a ROLE and a NAME — button "Send prompt", textbox
 * "Message ChatGPT", inside main › form. That is the address here:
 *     main › form "chat" › button "Send prompt"            (#2 appended when two nodes share role, name and path)
 *
 * TWO SOURCES, ONE SHAPE.
 *   fromAX(axNodes)   the browser's own accessibility tree (CDP Accessibility.getFullAXTree, readAX below) — exact,
 *                     for the agent driving a page through Clear Glass.
 *   _inPageTree(opts) the same tree computed in the page from roles and accessible names (explicit role, the implicit
 *                     role of the tag, aria-label / aria-labelledby / <label> / alt / title / text / placeholder) — for
 *                     code that runs IN the page (the provider userscripts cannot reach CDP; SP2). Serialised with
 *                     toString(), so the page runs the code the tests run in jsdom (the reader.js rule).
 *   node: { i, role, name, address, parent, depth, level?, value?, states: [..], selector?, backendId? }
 * Kept: landmarks (banner, navigation, main, complementary, contentinfo, search, form, region with a name, dialog),
 * headings, articles / log / feed (chat messages), and everything you can act on. Budgeted: maxNodes, cut said.
 *   pageScript(opts) · resolveScript(address) → the in-page element's CSS selector for an address (exact, else by
 *   role + name when that is unique) · normalize(raw, opts) · readAX(webContents, opts) (Electron) · address helpers.
 */

const MODULE_ID = 'clear-glass.page.semantic-tree';
const VERSION = '1.1.0';
const DEFAULTS = Object.freeze({ maxNodes: 400, maxName: 80 });

const LANDMARKS = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region', 'dialog', 'alertdialog'];
const CONTAINERS = ['article', 'log', 'feed'];
const ACTIONABLE = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'listbox'];
const KEEP = new Set([...LANDMARKS, ...CONTAINERS, 'heading', ...ACTIONABLE]);
const PATH_ROLES = new Set([...LANDMARKS, ...CONTAINERS]);

const _q = (s) => JSON.stringify(String(s));
/** addressOf(chain, role, name) — "main › form \"chat\" › button \"Send\"" */
function addressOf(chain, role, name) {
  const part = (r, n) => (n ? `${r} ${_q(n)}` : r);
  return [...chain.map(c => part(c.role, c.name)), part(role, name)].join(' › ');
}
/** parseAddress(a) → [{ role, name, nth }] */
function parseAddress(a) {
  return String(a || '').split(' › ').map(seg => {
    const m = seg.match(/^([a-z]+)(?:\s+("(?:[^"\\]|\\.)*"))?(?:\s+#(\d+))?$/);
    return m ? { role: m[1], name: m[2] ? JSON.parse(m[2]) : '', nth: m[3] ? Number(m[3]) : 1 } : { role: seg, name: '', nth: 1 };
  });
}

/**
 * The in-page builder (runs in the page; must not close over anything in this module — it is serialised).
 */
function _inPageTree(opts) {
  const o = opts || {};
  const LM = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region', 'dialog', 'alertdialog'];
  const CT = ['article', 'log', 'feed'];
  const ACT = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'listbox'];
  const KEEP = new Set(LM.concat(CT, ['heading'], ACT));
  const PATH = new Set(LM.concat(CT));
  const doc = document;
  const clip = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > (o.maxName || 80) ? t.slice(0, (o.maxName || 80) - 1) + '…' : t; };
  const hidden = (el) => {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
    if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'hidden') return true;
    const st = window.getComputedStyle ? getComputedStyle(el) : null;
    return !!(st && (st.display === 'none' || st.visibility === 'hidden'));
  };
  const roleOf = (el) => {
    const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (explicit) return explicit === 'presentation' || explicit === 'none' ? null : explicit;
    const t = el.tagName.toLowerCase();
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'textarea') return 'textbox';
    if (t === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (t === 'option') return 'option';
    if (t === 'input') {
      const ty = String(el.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(ty)) return 'button';
      if (ty === 'checkbox') return 'checkbox'; if (ty === 'radio') return 'radio'; if (ty === 'range') return 'slider';
      if (ty === 'number') return 'spinbutton'; if (ty === 'search') return 'searchbox';
      return 'textbox';
    }
    const editable = (e) => !!e && (e.isContentEditable === true || ['', 'true', 'plaintext-only'].includes(e.getAttribute && e.getAttribute('contenteditable')));
    if (editable(el) && !editable(el.parentElement)) return 'textbox';
    if (t === 'main') return 'main'; if (t === 'nav') return 'navigation'; if (t === 'article') return 'article';
    if (t === 'dialog') return 'dialog'; if (t === 'aside') return 'complementary';
    if (t === 'header') return el.closest('article,aside,main,nav,section') ? null : 'banner';
    if (t === 'footer') return el.closest('article,aside,main,nav,section') ? null : 'contentinfo';
    if (t === 'form') return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('name')) ? 'form' : 'form';
    if (t === 'section') return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'region' : null;
    return null;
  };
  const byIds = (ids) => ids.split(/\s+/).map(id => doc.getElementById(id)).filter(Boolean).map(e => e.textContent).join(' ');
  const nameOf = (el, role) => {
    const al = el.getAttribute('aria-labelledby'); if (al) { const t = clip(byIds(al)); if (t) return t; }
    const a = el.getAttribute('aria-label'); if (a && a.trim()) return clip(a);
    if (el.id) { const l = doc.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]'); if (l && l.textContent.trim()) return clip(l.textContent); }
    const wrap = el.closest && el.closest('label'); if (wrap && wrap !== el && ['textbox', 'checkbox', 'radio', 'combobox', 'slider', 'spinbutton', 'searchbox'].includes(role)) { const t = clip(wrap.textContent); if (t) return t; }
    if (el.tagName === 'IMG' || (el.tagName === 'INPUT' && el.type === 'image')) { const t = el.getAttribute('alt'); if (t) return clip(t); }
    if (['button', 'link', 'heading', 'tab', 'menuitem', 'option', 'menuitemcheckbox', 'menuitemradio'].includes(role)) {
      const t = clip(el.textContent); if (t) return t;
      const img = el.querySelector && el.querySelector('img[alt],svg[aria-label]'); if (img) return clip(img.getAttribute('alt') || img.getAttribute('aria-label'));
      if (el.tagName === 'INPUT') return clip(el.value);
    }
    const ti = el.getAttribute('title'); if (ti) return clip(ti);
    const ph = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || (el.dataset && el.dataset.placeholder); if (ph) return clip(ph);
    return '';
  };
  const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  const selectorFor = (el) => {
    if (el.id && doc.querySelectorAll('#' + cssEsc(el.id)).length === 1) return '#' + cssEsc(el.id);
    const tid = el.getAttribute('data-testid'); if (tid) { const s = '[data-testid="' + tid.replace(/"/g, '\\"') + '"]'; if (doc.querySelectorAll(s).length === 1) return s; }
    const parts = []; let cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
      if (cur.id && doc.querySelectorAll('#' + cssEsc(cur.id)).length === 1) { parts.unshift('#' + cssEsc(cur.id)); break; }
      let i = 1, sib = cur; while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      parts.unshift(cur.tagName.toLowerCase() + ':nth-of-type(' + i + ')'); cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const nodes = []; let cut = 0;
  // SP2: the address of ONE element (the picker's pick, by its xpath): the node made for it, else the deepest kept node
  // that contains it (a reply's text sits inside its article)
  let tgt = null, exact = null, within = null;
  if (o.targetXpath) { try { tgt = doc.evaluate(o.targetXpath, doc, null, 9, null).singleNodeValue; } catch (_) { tgt = null; } }
  const q = (s) => JSON.stringify(String(s));
  const part = (r, n) => (n ? r + ' ' + q(n) : r);
  const seen = {};
  const walk = (el, chain, parent, depth) => {
    if (!el || el.nodeType !== 1 || hidden(el)) return;
    const role = roleOf(el);
    let nextChain = chain, nextParent = parent;
    if (role && KEEP.has(role) && !(role === 'region' && !nameOf(el, role))) {
      if (nodes.length >= (o.maxNodes || 400)) cut++;
      else {
        const name = nameOf(el, role);
        // chain is the nearest path ancestor's own address (with its #n), so a child of the 2nd article says so
        const base = (chain ? chain + ' › ' : '') + part(role, name);
        const c = (seen[base] || 0) + 1; seen[base] = c;
        const n = { i: nodes.length, role, name, address: c > 1 ? base + ' #' + c : base, parent, depth };
        if (role === 'heading') n.level = Number((el.getAttribute('aria-level') || el.tagName.slice(1))) || null;
        const st = [];
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') st.push('disabled');
        if (el.checked || el.getAttribute('aria-checked') === 'true') st.push('checked');
        if (el.getAttribute('aria-expanded') === 'true') st.push('expanded');
        if (el.required || el.getAttribute('aria-required') === 'true') st.push('required');
        if (doc.activeElement === el) st.push('focused');
        if (st.length) n.states = st;
        if (['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider'].includes(role)) { const v = el.value != null && el.tagName !== 'DIV' ? el.value : el.textContent; if (v) n.value = clip(v); }
        if (ACT.includes(role) || role === 'article') n.selector = selectorFor(el);
        nodes.push(n);
        if (tgt) { if (el === tgt) exact = n; else if (el.contains(tgt)) within = n; }
        nextParent = n.i;
        if (PATH.has(role)) nextChain = n.address;
      }
    }
    for (const c of el.children) walk(c, nextChain, nextParent, depth + 1);
    if (el.shadowRoot) for (const c of el.shadowRoot.children) walk(c, nextChain, nextParent, depth + 1);
  };
  walk(doc.body || doc.documentElement, '', null, 0);
  const out = { url: location.href, title: doc.title, source: 'page', nodes, cut };
  if (o.targetXpath) { const t = exact || within; out.target = t ? { address: t.address, role: t.role, name: t.name, exact: !!exact } : null; }
  return out;
}

/** _inPageResolve(address) — the element an address names (in the page): exact address, else role + name when unique */
function _inPageResolve(arg) {
  const t = (arg.tree || {}).nodes || [];
  const want = arg.address;
  let n = t.find(x => x.address === want);
  let how = 'address';
  if (!n) {
    const segs = String(want).split(' › '); const last = segs[segs.length - 1].replace(/\s+#\d+$/, '');
    const same = t.filter(x => { const s = x.address.split(' › '); return s[s.length - 1].replace(/\s+#\d+$/, '') === last; });
    if (same.length === 1) { n = same[0]; how = 'role+name'; }
    else return { ok: false, why: same.length ? `${same.length} nodes are ${last} — the address must say which` : `nothing on this page is ${last}` };
  }
  if (!n.selector) return { ok: false, why: `${n.address} is a ${n.role}, not something to act on` };
  return { ok: true, address: n.address, role: n.role, name: n.name, selector: n.selector, how };
}

/** pageScript(opts) — the code driver.eval runs */
function pageScript(opts = {}) { return `(${_inPageTree.toString()})(${JSON.stringify({ ...DEFAULTS, ...opts })})`; }
/** resolveScript(address, opts) — builds the tree in the page and resolves the address against it */
function resolveScript(address, opts = {}) {
  return `(function(){ var tree = (${_inPageTree.toString()})(${JSON.stringify({ ...DEFAULTS, ...opts, maxNodes: 5000 })}); return (${_inPageResolve.toString()})({ tree: tree, address: ${JSON.stringify(String(address))} }); })()`;
}

/**
 * addressScript(xpath) — SP2: the semantic address of the element at an xpath (the picker's pick) →
 * { address, role, name, exact } | null. exact: false when the element itself is not a kept node and the address is its
 * nearest kept container's (a reply's <div> → its article).
 */
function addressScript(xpath, opts = {}) {
  return `(function(){ var t = (${_inPageTree.toString()})(${JSON.stringify({ ...DEFAULTS, ...opts, maxNodes: 5000, targetXpath: String(xpath) })}); return t.target || null; })()`;
}
/** preludeSource() — SP2: the in-page tree and resolver as window.NexusSemantic, for the provider userscripts' field map */
function preludeSource() {
  return `(function(root){ if (root.NexusSemantic) return; root.NexusSemantic = { VERSION: ${JSON.stringify(VERSION)}, tree: ${_inPageTree.toString()}, resolve: ${_inPageResolve.toString()} }; })(typeof window !== 'undefined' ? window : globalThis);`;
}
/** roleFits(key, role) — SP2: a pick's role fits its field: send is a button, input is a text box; a reply is anything */
const FIELD_ROLES = Object.freeze({ send: ['button'], input: ['textbox', 'searchbox', 'combobox'] });
function roleFits(key, role) { const want = FIELD_ROLES[key]; return !want || !role || want.includes(role); }

/**
 * fromAX(axNodes, opts) — pure: CDP Accessibility.getFullAXTree's nodes → the same tree (the browser's own roles and names).
 * CDP roles are mostly the ARIA ones; 'RootWebArea' and generic containers are walked through, not kept.
 */
function fromAX(axNodes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const byId = new Map((axNodes || []).map(n => [n.nodeId, n]));
  const val = (x) => (x && x.value != null ? String(x.value) : '');
  const clip = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > o.maxName ? t.slice(0, o.maxName - 1) + '…' : t; };
  const ALIAS = { textField: 'textbox', TextField: 'textbox', searchBox: 'searchbox', comboBoxMenuButton: 'combobox', textbox: 'textbox' };
  const roots = (axNodes || []).filter(n => !n.parentId || !byId.has(n.parentId));
  const nodes = []; let cut = 0; const seen = new Map();
  const walk = (ax, chain, parent, depth) => {
    if (!ax) return;
    let role = ALIAS[val(ax.role)] || val(ax.role);
    let nextChain = chain, nextParent = parent;
    const name = clip(val(ax.name));
    if (!ax.ignored && KEEP.has(role) && !(role === 'region' && !name)) {
      if (nodes.length >= o.maxNodes) cut++;
      else {
        const base = (chain ? `${chain} › ` : '') + (name ? `${role} ${_q(name)}` : role);
        const c = (seen.get(base) || 0) + 1; seen.set(base, c);
        const n = { i: nodes.length, role, name, address: c > 1 ? `${base} #${c}` : base, parent, depth };
        const props = Object.fromEntries((ax.properties || []).map(p => [p.name, p.value && p.value.value]));
        if (role === 'heading' && props.level) n.level = Number(props.level);
        const st = ['disabled', 'checked', 'expanded', 'required', 'focused'].filter(k => props[k] === true || props[k] === 'true');
        if (st.length) n.states = st;
        const v = clip(val(ax.value)); if (v) n.value = v;
        if (ax.backendDOMNodeId != null) n.backendId = ax.backendDOMNodeId;
        nodes.push(n);
        nextParent = n.i;
        if (PATH_ROLES.has(role)) nextChain = n.address;
      }
    }
    for (const id of ax.childIds || []) walk(byId.get(id), nextChain, nextParent, depth + 1);
  };
  for (const r of roots) walk(r, '', null, 0);
  return { source: 'ax', nodes, cut };
}

/** normalize(raw, opts) — pure: a tree as an agent gets it, the cut said */
function normalize(raw, opts = {}) {
  if (!raw || !Array.isArray(raw.nodes)) return { ok: false, error: 'the page returned no tree (no document, or the eval was blocked)' };
  const counts = {};
  for (const n of raw.nodes) counts[n.role] = (counts[n.role] || 0) + 1;
  return { ok: true, url: raw.url || null, title: raw.title || '', source: raw.source || 'page', nodes: raw.nodes, counts,
    ...(raw.cut ? { cut: { shown: raw.nodes.length, more: raw.cut, why: `maxNodes ${opts.maxNodes || DEFAULTS.maxNodes}` } } : {}) };
}

/** outline(tree) — the tree as indented lines, for a small model's prompt */
function outline(tree, { max = 200 } = {}) {
  const lines = [];
  for (const n of (tree.nodes || []).slice(0, max)) {
    const ind = '  '.repeat(Math.min(10, n.parent == null ? 0 : (_depthOf(tree.nodes, n))));
    lines.push(`${ind}${n.role}${n.name ? ` ${_q(n.name)}` : ''}${n.level ? ` (h${n.level})` : ''}${n.value ? ` = ${_q(n.value)}` : ''}${n.states ? ` [${n.states.join(', ')}]` : ''}`);
  }
  return lines.join('\n');
}
function _depthOf(nodes, n) { let d = 0, p = n.parent; while (p != null && d < 50) { d++; p = nodes[p] ? nodes[p].parent : null; } return d; }

/**
 * readAX(webContents, opts) — Electron: the browser's own tree through CDP. Attaches the debugger only if no one holds
 * it, and detaches what it attached; a page whose debugger is taken (DevTools open) falls back to the page tree, said.
 */
async function readAX(wc, opts = {}) {
  const dbg = wc && wc.debugger;
  if (!dbg) throw new Error('no webContents debugger');
  let attachedHere = false;
  if (!dbg.isAttached()) { try { dbg.attach('1.3'); attachedHere = true; } catch (e) { return { ok: false, fallback: true, why: `the debugger is in use (${e.message})` }; } }
  try {
    await dbg.sendCommand('Accessibility.enable');
    const r = await dbg.sendCommand('Accessibility.getFullAXTree', {});
    const t = fromAX(r.nodes || [], opts);
    let url = ''; try { url = wc.getURL(); } catch (_) {}
    return normalize({ ...t, url, title: (() => { try { return wc.getTitle(); } catch (_) { return ''; } })() }, opts);
  } finally { if (attachedHere) { try { dbg.detach(); } catch (_) {} } }
}

module.exports = { MODULE_ID, VERSION, DEFAULTS, KEEP: [...KEEP], FIELD_ROLES, addressOf, parseAddress, pageScript, resolveScript, addressScript, preludeSource, roleFits, fromAX, normalize, outline, readAX, _inPageTree, _inPageResolve };
