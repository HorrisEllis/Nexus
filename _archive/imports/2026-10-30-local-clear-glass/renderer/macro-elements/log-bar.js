/**
 * clear-glass/renderer/macro-elements/log-bar.js — "Log element for macro" after an element pick (ME1, 2026-10-30). Styles: log-bar.css (#cg-macro-el).
 *
 * James, 2026-10-30: "the element picker is supposed to be linked to the macro ... like a button that says log element for macro. then have
 * it show up as an option in the macro editor." After a pick on a site (browser.js, dom:pick-result) the bar names the element (a suggestion
 * from what it says), works out a selector for it IN the page (stable attributes first, checked to match this element and only it), and saves
 * it per site through ClearGlass.macros.elementAdd (main: options macroElements). Logging a name again replaces it — that is how a broken
 * step is fixed. Settings › Macros lists them and a step's "Logged element" box fills its selector from one. Nothing is changed on the page.
 *
 *   window.CGMacroElementBar.mount({ cg, wv })      once, from browser.js
 *   window.CGMacroElementBar.offer({ xpath, url })  after a pick — an http(s) page only
 */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let ctx = null, bar = null;
  function mount({ cg, wv }) { ctx = { cg, wv }; }
  function close() { if (bar) { bar.remove(); bar = null; } }

  // Runs in the page: the element at an xpath → a selector that matches it alone, its tag, role and words.
  const describeScript = (xpath) => `(function (xp) {
    var n; try { n = document.evaluate(xp, document, null, 9, null).singleNodeValue; } catch (e) {}
    if (!n || n.nodeType !== 1) return { ok: false, why: 'the picked element is no longer on the page — pick it again' };
    var esc = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); };
    var gen = function (v) { return /[0-9a-f]{8}-[0-9a-f]{4}|\\d{4,}|^(:r|react|ember|radix|headlessui)[-\\w:]*\\d|^[a-z]{1,3}[-_]?[0-9a-f]{5,}$/i.test(String(v)); };
    var one = function (s) { try { var l = document.querySelectorAll(s); return l.length === 1 && l[0] === n; } catch (e) { return false; } };
    var trig = n.closest('[role=combobox],[aria-haspopup=listbox],select'); if (trig) n = trig;   // a dropdown is logged as the dropdown, not the word inside it
    var tag = n.tagName.toLowerCase(), cands = [], add = function (s) { if (s) cands.push(s); };
    var q = function (a, v) { return '[' + a + '="' + String(v).replace(/"/g, '\\\\"') + '"]'; };
    ['data-testid', 'data-test', 'data-qa', 'data-cy'].forEach(function (a) { var v = n.getAttribute(a); if (v && !gen(v)) { add(q(a, v)); add(tag + q(a, v)); } });
    if (n.id && !gen(n.id)) add('#' + esc(n.id));
    ['name', 'aria-label', 'placeholder', 'title', 'role'].forEach(function (a) { var v = n.getAttribute(a); if (v && !gen(v)) { add(tag + q(a, v)); } });
    var anyUp = n.closest('[data-testid],[id]'); if (anyUp && anyUp !== n && !gen(anyUp.id || anyUp.getAttribute('data-testid') || '')) {
      var base = anyUp.id ? '#' + esc(anyUp.id) : q('data-testid', anyUp.getAttribute('data-testid')); add(base + ' ' + tag); add(base + ' ' + tag + (n.getAttribute('role') ? q('role', n.getAttribute('role')) : '')); }
    var sel = null; for (var i = 0; i < cands.length; i++) if (one(cands[i])) { sel = cands[i]; break; }
    if (!sel) { var parts = [], cur = n; while (cur && cur.nodeType === 1 && parts.length < 6) { var t = cur.tagName.toLowerCase(), p = cur.parentElement,
        same = p ? Array.prototype.filter.call(p.children, function (c) { return c.tagName === cur.tagName; }) : [];
        parts.unshift(same.length > 1 ? t + ':nth-of-type(' + (same.indexOf(cur) + 1) + ')' : t); var j = parts.join(' > '); if (one(j)) { sel = j; break; } cur = p; } }
    var text = (n.innerText || n.value || n.getAttribute('aria-label') || n.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    var dd = !!(n.closest('[role=combobox],[aria-haspopup],select') || tag === 'select');
    return { ok: true, selector: sel, matched: sel ? 1 : 0, tag: tag, role: n.getAttribute('role') || null, text: text, dropdown: dd, stable: !!sel && cands.indexOf(sel) >= 0 };
  })(${JSON.stringify(String(xpath))})`;

  async function offer({ xpath, url } = {}) {
    if (!ctx || !xpath || !/^https?:/i.test(String(url || ''))) return false;
    close();
    let origin = url; try { origin = new URL(url).origin; } catch (_) {}
    let d = { ok: false, why: 'no page to read' };
    try { d = await ctx.wv.executeJavaScript(describeScript(xpath)); } catch (e) { d = { ok: false, why: e.message }; }
    bar = el('div'); bar.id = 'cg-macro-el'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Log this element for a macro');
    const title = el('div', 'me-title', `📌 Log element for macro on ${origin.replace(/^https?:\/\//, '')}: it appears in the macro editor`);
    const name = el('input', 'me-name'); name.placeholder = 'name it (e.g. delivery time dropdown)'; name.value = (d && d.text ? d.text : '').replace(/[^\w .:-]/g, '').trim().slice(0, 40);
    const sel = el('input', 'me-sel'); sel.placeholder = 'selector'; sel.value = d && d.selector ? d.selector : '';
    const say = el('div', 'me-say');
    if (d && d.ok) {
      say.textContent = `${d.dropdown ? 'A dropdown. ' : ''}${d.selector ? (d.stable ? 'Selector matches this element only.' : 'No stable attribute found — a position path is used and may break if the page changes.') : 'No selector found — the xpath is kept instead.'}`;
      say.className = 'me-say' + (d.selector && d.stable ? ' ok' : '');
    } else { say.textContent = (d && d.why) || 'could not read the element'; say.className = 'me-say bad'; }
    const save = el('button', 'me-save', 'Log element'); const x = el('button', 'me-x', '×'); x.title = 'Close';
    x.addEventListener('click', close);
    save.addEventListener('click', async () => {
      const record = { name: name.value.trim(), selector: sel.value.trim() || undefined, xpath, label: d && d.text || undefined, tag: d && d.tag || undefined, text: d && d.text || undefined };
      let r; try { r = await ctx.cg.macros.elementAdd(url, record); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) { say.textContent = (r && r.error) || 'not saved'; say.className = 'me-say bad'; return; }
      say.className = 'me-say ok'; say.textContent = `${r.replaced ? 'Replaced' : 'Logged'} “${r.element.name}” — pick it in the macro editor (Settings › Macros).`;
      setTimeout(close, 1800);
    });
    const row = el('div', 'me-row'); row.append(name, sel, save, x);
    bar.append(title, row, say);
    document.body.append(bar);
    name.focus();
    return true;
  }

  window.CGMacroElementBar = { mount, offer, close };
})();
