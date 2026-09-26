/**
 * clear-glass/renderer/selector-assign/selector-assign.js — v0.39.251
 * comp_id: nexus.clear-glass.renderer.selector-assign
 * UUID: cg-renderer-selector-assign-v1-0000-2026-0925-jamesbrooks-001
 *
 * The element picker assigns selectors (handoff 2026-09-25, step 1). One area,
 * one JS + one CSS (selector-assign.css, every rule under #cg-selector-assign).
 *
 * Flow:
 *   1. A pick lands on a provider page (guardian-picker.js reports
 *      guardian.picker.picked; the fallback picker reports dom:pick-result).
 *      offer() asks main which provider the page belongs to
 *      (src/providers/registry.js hosts). Not a provider page → nothing shown.
 *   2. The bar asks: "This is <provider>'s  reply · input · send".
 *   3. choose(key) injects renderer/selector-check.js into the page and runs
 *      the live check there. The result — selector, matches, what it reads —
 *      is shown and outlined on the page. A failed check shows why and every
 *      candidate that was tried; it cannot be assigned.
 *      When only one reply is on the page (single), no check can tell a
 *      selector naming THIS reply from one naming every reply, so the person
 *      chooses among the candidates that passed — never guessed.
 *   4. Assign → ClearGlass.selectors.assign → guardian's selector map. What is
 *      shown is guardian's own answer (changed, tabs pushed, verified), or its
 *      refusal.
 *
 * Nothing here touches guardian-picker.js's look.
 */
(function () {
  'use strict';
  const LABEL = { resp: 'reply', input: 'input box', send: 'send button' };

  let ctx = null;        // { cg, wv, notify }
  let bar = null;
  let checkerSrc = null;
  let state = null;      // { provider, xpath, url, key, result, selector, single }

  function mount({ cg, wv, notify }) { ctx = { cg, wv, notify: notify || (() => {}) }; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(text, cls, onClick) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onClick); return b; }

  function ensureBar() {
    if (bar && bar.isConnected) return bar;
    bar = el('div'); bar.id = 'cg-selector-assign';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Assign provider selector');
    document.body.appendChild(bar);
    return bar;
  }
  function close() { if (bar) bar.remove(); bar = null; state = null; }

  function render(parts) {
    const b = ensureBar();
    b.replaceChildren();
    const head = el('div', 'sa-head');
    const title = el('span', 'sa-title', state && state.provider ? `◎ ${state.provider.name}` : '◎ Selector');
    if (state && state.provider && state.provider.color) title.style.setProperty('--sa-provider', state.provider.color);
    head.append(title, button('✕', 'sa-close', close));
    b.append(head, ...parts);
  }

  /** Step 1 — a pick happened. Only provider pages get an offer. */
  async function offer({ xpath, url } = {}) {
    if (!ctx || !xpath || !url) return;
    let provider = null;
    try { provider = await ctx.cg.selectors.providerFor(url); } catch (_) { return; }
    if (!provider) return;
    state = { provider, xpath, url };
    const row = el('div', 'sa-row');
    row.append(el('span', 'sa-q', 'This is its'));
    for (const key of ['resp', 'input', 'send']) row.append(button(LABEL[key], 'sa-key', () => choose(key)));
    render([row]);
  }

  async function runInPage(code) { return ctx.wv.executeJavaScript(code); }

  /** Step 3 — run the live check on the page, as the userscript will read it. */
  async function choose(key) {
    if (!state) return;
    state.key = key;
    render([el('div', 'sa-note', `Checking the ${LABEL[key]} on this page…`)]);
    let r;
    try {
      if (!checkerSrc) checkerSrc = await fetch('./selector-check.js').then(x => x.text());
      await runInPage(checkerSrc);
      r = await runInPage(`window.__cgSelectorCheck.check(${JSON.stringify({ xpath: state.xpath, key })})`);
    } catch (err) {
      r = { ok: false, why: `the check could not run on the page: ${err.message}`, tried: [] };
    }
    state.result = r;
    if (!r || !r.ok) return showFailure(r || { why: 'no result' });
    state.selector = r.selector;
    state.single = !!r.single;
    showResult();
  }

  function showFailure(r) {
    const parts = [el('div', 'sa-bad', `✗ ${LABEL[state.key]}: ${r.why}`)];
    if (r.tried && r.tried.length) {
      const d = el('details', 'sa-tried');
      d.append(el('summary', null, `${r.tried.length} candidate(s) tried`));
      const ul = el('ul');
      for (const t of r.tried) { const li = el('li'); li.append(el('code', null, t.selector), document.createTextNode(` — ${t.why}`)); ul.append(li); }
      d.append(ul); parts.push(d);
    }
    parts.push(el('div', 'sa-actions'));
    parts[parts.length - 1].append(button('Pick another role', 'sa-btn', () => offer({ xpath: state.xpath, url: state.url })), button('Cancel', 'sa-btn', close));
    render(parts);
  }

  function evidenceLine(r) {
    const reads = state.key === 'resp' ? `last of ${r.matched} match(es) reads ${r.textLength} chars` : `${r.matched} match, "${(r.text || '').slice(0, 40)}"`;
    return reads;
  }

  function showResult() {
    const r = state.result;
    const parts = [];
    const sel = el('div', 'sa-sel');
    sel.append(el('span', 'sa-k', LABEL[state.key]), el('code', null, state.selector));
    parts.push(sel);

    if (state.single) {
      parts.push(el('div', 'sa-warn', 'Only one reply is on this page, so no check can tell a selector for THIS reply from one for every reply. Choose what covers the whole reply — or ask a second question and pick again.'));
      const list = el('div', 'sa-alts');
      for (const a of r.alternatives || []) {
        const lab = el('label', 'sa-alt');
        const radio = el('input'); radio.type = 'radio'; radio.name = 'sa-alt'; radio.value = a.selector; radio.checked = a.selector === state.selector;
        radio.addEventListener('change', () => { state.selector = a.selector; markOnPage(); sel.querySelector('code').textContent = a.selector; });
        lab.append(radio, el('code', null, a.selector), el('span', 'sa-dim', ` ${a.textLength}ch · depth ${a.depth}`));
        list.append(lab);
      }
      parts.push(list);
    } else {
      parts.push(el('div', 'sa-ok', `✓ checked on this page — ${evidenceLine(r)}`));
    }
    if (r.text) parts.push(el('div', 'sa-preview', r.text.slice(0, 160)));

    const actions = el('div', 'sa-actions');
    actions.append(button('Assign', 'sa-btn sa-primary', commit), button('Back', 'sa-btn', () => offer({ xpath: state.xpath, url: state.url })), button('Cancel', 'sa-btn', close));
    parts.push(actions);
    render(parts);
    markOnPage();
  }

  function markOnPage() {
    if (!state || !state.selector) return;
    runInPage(`window.__cgSelectorCheck && window.__cgSelectorCheck.mark(${JSON.stringify(state.selector)}, ${JSON.stringify(state.key)})`).catch(() => {});
  }

  /** Step 4 — record it in guardian's selector map, show guardian's answer. */
  async function commit() {
    const r = state.result;
    // A chosen alternative has its own match count and text; the evidence must
    // describe the selector actually sent, so it is re-checked on the page.
    let evidence = { url: r.url, matched: r.matched, text: r.text, textLength: r.textLength, depth: r.depth, tag: r.tag, single: state.single };
    if (state.single && state.selector !== r.selector) {
      const a = (r.alternatives || []).find(x => x.selector === state.selector);
      const m = await runInPage(`(() => { const all = document.querySelectorAll(${JSON.stringify(state.selector)}); const l = all[all.length - 1]; const t = l ? (l.innerText || l.textContent || '').trim() : ''; return { matched: all.length, text: t.slice(0, 200), textLength: t.length }; })()`).catch(() => null);
      if (!m || !m.matched) return showFailure({ why: `"${state.selector}" no longer matches on this page`, tried: [] });
      evidence = { ...evidence, ...m, depth: a ? a.depth : null, tag: a ? a.tag : null };
    }
    if (state.single) evidence.chosenBy = 'person';
    render([el('div', 'sa-note', 'Recording in guardian…')]);
    const res = await ctx.cg.selectors.assign({ provider: state.provider.id, key: state.key, selector: state.selector, evidence }).catch(e => ({ ok: false, error: e.message }));
    const parts = [];
    if (res.ok) {
      const g = res.guardian || {};
      const v = g.map && g.map.verified ? g.map.verified[state.key] : null;
      parts.push(el('div', 'sa-ok', `✓ guardian ${g.changed ? 'recorded' : 'already had'} ${state.provider.name}'s ${LABEL[state.key]} — ${v ? 'verified' : 'not marked verified'}, pushed to ${g.pushedToTabs || 0} open tab(s)`));
      const sel = el('div', 'sa-sel'); sel.append(el('span', 'sa-k', LABEL[state.key]), el('code', null, state.selector)); parts.push(sel);
      ctx.notify(`Selector map: ${state.provider.name} ${LABEL[state.key]} → ${state.selector} (${g.changed ? 'recorded' : 'unchanged'}, ${g.pushedToTabs || 0} tab(s))`);
    } else {
      parts.push(el('div', 'sa-bad', `✗ not recorded — ${res.error || 'guardian refused'}`));
      ctx.notify(`Selector map: ${state.provider.name} ${LABEL[state.key]} NOT recorded — ${res.error || 'refused'}`);
    }
    const actions = el('div', 'sa-actions'); actions.append(button('Close', 'sa-btn', close)); parts.push(actions);
    render(parts);
  }

  window.CGSelectorAssign = { mount, offer, close };
})();
