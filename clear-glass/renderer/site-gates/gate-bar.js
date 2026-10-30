/**
 * clear-glass/renderer/site-gates/gate-bar.js — "Gate this element" after an element pick (UG5, 0.60.292). Styles: gate-bar.css (#cg-gate-bar).
 * Spec: clear-glass/spec/gated-flows.spec MOD-UG5 · Map: docs/2026-10-28-gated-flows-phasemap.spec UG5
 *
 * James, 2026-10-30: "it needs to be universal for all dom elements. like for the job applications for instance, even if we need a way to create
 * them per page using the element picker, per site settings, macros and automation features. stop thinking so narrow"
 *
 * After a pick on a site (browser.js, dom:pick-result), the bar offers: what must hold at this element (holds what was typed, holds exactly,
 * matches a pattern, shows a choice, is ticked, is clear, contains text, is visible, is gone), on this whole site or only this page, Save.
 * Saved through ClearGlass.shortcuts.gateAdd (main: options siteGates, src/page/element-gate.js validates). 2026-10-30, his correction ("gates
 * are for the pipelines for macro atuomation"): a gate is a block — a pipeline task's gate, a workflow's "Wait at a gate", a macro step's
 * gate (use: <id>) — which the flow waits on; nothing checks it behind a write. Settings ›
 * ClearDriver › Gates on sites lists, checks and removes them. Nothing is sent to the page; the bar lives in the chrome.
 *
 *   window.CGGateBar.mount({ cg })          once, from browser.js
 *   window.CGGateBar.offer({ xpath, url })  after a pick — an http(s) page only
 */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // what must hold → the gate's field; needs: what the extra box asks for
  const KINDS = [
    ['typed', 'Holds what was typed', null], ['equals', 'Holds exactly…', 'the value'], ['matches', 'Matches a pattern…', '/^\\S+@\\S+$/ (an email)'],
    ['shows', 'Shows the choice…', 'the option'], ['checked', 'Is ticked', null], ['unchecked', 'Is clear', null],
    ['text', 'Contains the text…', 'the text'], ['visible', 'Is visible', null], ['gone', 'Is gone', null],
  ];
  let ctx = null, bar = null;
  function mount({ cg }) { ctx = { cg }; }
  function close() { if (bar) { bar.remove(); bar = null; } }

  function gateOf(kind, extra) {
    if (kind === 'typed') return { value: '{{value}}' };
    if (kind === 'checked') return { checked: true };
    if (kind === 'unchecked') return { checked: false };
    if (kind === 'visible') return { visible: true };
    if (kind === 'gone') return { gone: true };
    return { [kind]: extra };
  }

  function offer({ xpath, url } = {}) {
    if (!ctx || !xpath || !/^https?:/i.test(String(url || ''))) return false;
    close();
    let origin = url, pageGlob = null; try { const u = new URL(url); origin = u.origin; pageGlob = `${u.origin}${u.pathname}*`; } catch (_) {}
    bar = el('div'); bar.id = 'cg-gate-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Gate this element');
    const title = el('div', 'gb-title', `⛩ Gate this element on ${origin.replace(/^https?:\/\//, '')}: a gate your pipelines, workflows and macros can wait on`);
    const kind = el('select', 'gb-kind'); for (const [v, l] of KINDS) { const o = el('option', null, l); o.value = v; kind.append(o); }
    const extra = el('input', 'gb-extra'); extra.style.display = 'none';
    const scope = el('select', 'gb-scope'); for (const [v, l] of [['site', 'Whole site'], ['page', 'Only this page']]) { const o = el('option', null, l); o.value = v; scope.append(o); }
    const label = el('input', 'gb-label'); label.placeholder = 'name (optional)';
    const say = el('div', 'gb-say');
    const save = el('button', 'gb-save', 'Save gate'); const x = el('button', 'gb-x', '×'); x.title = 'Close';
    kind.addEventListener('change', () => { const k = KINDS.find(k => k[0] === kind.value); extra.style.display = k && k[2] ? '' : 'none'; extra.placeholder = (k && k[2]) || ''; });
    x.addEventListener('click', close);
    save.addEventListener('click', async () => {
      const k = KINDS.find(k => k[0] === kind.value);
      if (k[2] && !extra.value.trim()) { say.textContent = `say ${k[2]}`; say.className = 'gb-say bad'; return; }
      const gate = { xpath, ...gateOf(kind.value, extra.value.trim()), label: label.value.trim() || undefined, page: scope.value === 'page' ? pageGlob : undefined };
      let r; try { r = await ctx.cg.shortcuts.gateAdd(url, gate); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) { say.textContent = (r && r.error) || 'not saved'; say.className = 'gb-say bad'; return; }
      say.className = 'gb-say ok'; say.textContent = `gate ${r.gate.id} saved on ${r.origin.replace(/^https?:\/\//, '')}`;
      setTimeout(close, 1400);
    });
    bar.append(title, el('div', 'gb-row', null), say);
    bar.children[1].append(kind, extra, scope, label, save, x);
    document.body.append(bar);
    return true;
  }

  window.CGGateBar = { mount, offer, close };
})();
