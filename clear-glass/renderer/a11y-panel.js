'use strict';
/**
 * renderer/a11y-panel.js — this site's accessibility look, traced to what turns it on and kept off by the site's settings (AC2).
 * (styles: a11y-panel.css)  Spec: clear-glass/spec/gated-flows.spec MOD-A11Y2 · Map: docs/2026-10-28-gated-flows-phasemap.spec AC2
 *
 * James, 2026-10-30, with fiverr.com in yellow-on-black links and the popup's reset saying nothing on the page was named accessibility:
 * "look at the accessability. needs to actually hook into the back end settings. looks lazy also."
 *
 * window.CGA11yPanel.build({ api, wcId }) → { el, refresh() }
 *   api  ClearGlass.siteProfile — a11yTrace(wcId), a11yKeepOff(wcId, entry, on), a11yOpenControl(wcId, n), a11yReset(wcId)
 * What it shows, each from the page or the backend, never drawn by hand:
 *   - the link as it looks now (a swatch in its colours), and whether the system's forced colours / more contrast are on;
 *   - each stylesheet rule that paints it, with the classes/attributes that switch the rule on: each has a switch, "Keep off on this site",
 *     which is the site setting accessibility.keepOff (applied by main at every load, keyboard-mode keepOffScript);
 *   - the site's own accessibility control, opened with one click (a look the site keeps on its server is turned off there);
 *   - the old sweep of storage and cookies named accessibility (0.60.283), kept as "Clear what the site stored".
 */
(function () {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const PROP = { color: 'text colour', background: 'background', underline: 'underline', spacing: 'letter spacing' };

  function build({ api, wcId } = {}) {
    const root = el('section', 'a11y-panel'); root.dataset.feature = 'accessibility-look';
    const head = el('div', 'a11y-head');
    const title = el('div', 'a11y-title', 'How this site looks');
    const find = el('button', 'a11y-btn primary', 'Find what turns it on'); find.type = 'button';
    head.append(title, find);
    const body = el('div', 'a11y-body');
    body.append(el('div', 'a11y-hint', 'Traces the look of this page’s links to the style rules that paint them and to what switches those rules on, whatever it is named. What you keep off is saved in this site’s settings and applied every time a page of it loads.'));
    const foot = el('div', 'a11y-foot');
    const clear = el('button', 'a11y-btn ghost', 'Clear what the site stored'); clear.type = 'button';
    clear.title = 'Backs up, then removes, the storage and cookies whose names say accessibility, and reloads (0.60.283)';
    const status = el('div', 'a11y-status'); status.setAttribute('role', 'status');
    foot.append(clear, status);
    root.append(head, body, foot);
    const say = (t, bad) => { status.textContent = t || ''; status.classList.toggle('bad', !!bad); };

    function swatch(link) {
      const s = el('div', 'a11y-swatch');
      const a = el('span', 'a11y-sample', 'A link on this page');
      a.style.color = link.color; a.style.background = link.background; a.style.letterSpacing = link.spacing;
      if (/underline/.test(link.decoration || '')) a.style.textDecoration = 'underline';
      if (link.outline) a.style.outline = `2px solid ${link.outline}`;
      const facts = el('div', 'a11y-facts');
      facts.append(el('span', null, `text ${link.color}`), el('span', null, `on ${link.background}`), ...(link.spacing && link.spacing !== 'normal' ? [el('span', null, `spacing ${link.spacing}`)] : []));
      s.append(a, facts);
      return s;
    }

    function keepRow(entry, label, detail, kept) {
      const r = el('label', 'a11y-row'); r.dataset.entry = entry;
      const sw = el('input', 'a11y-switch'); sw.type = 'checkbox'; sw.checked = kept;
      const what = el('div', 'a11y-what');
      what.append(el('div', 'a11y-name', label), ...(detail ? [el('div', 'a11y-detail', detail)] : []));
      const tag = el('span', `a11y-tag${kept ? ' on' : ''}`, kept ? 'kept off' : 'on');
      sw.addEventListener('change', async () => {
        sw.disabled = true;
        try {
          const r2 = await api.a11yKeepOff(wcId, entry, sw.checked);
          if (!r2 || r2.ok === false) throw new Error((r2 && r2.error) || 'no answer');
          say(sw.checked ? `Kept off on ${r2.origin}: saved in this site’s settings (accessibility.keepOff), applied now and at every load.`
            : `No longer kept off on ${r2.origin}; the page reloads to show the site’s own look.`);
          if (!sw.checked) setTimeout(refresh, 900); else refresh();
        } catch (err) { sw.checked = !sw.checked; say(`Not saved: ${err.message}`, true); }
        sw.disabled = false;
      });
      r.append(sw, what, tag);
      return r;
    }

    function draw(t) {
      body.replaceChildren();
      if (t.link) body.append(swatch(t.link));
      else body.append(el('div', 'a11y-hint', 'No link is visible on this page to trace.'));
      if (t.forced && (t.forced.colors || t.forced.contrast))
        body.append(el('div', 'a11y-warn', t.forced.colors ? 'Your system’s forced colours are on: the look may come from Windows (Settings › Accessibility › Contrast themes), not this site.' : 'Your system asks for more contrast; this site may answer it with its own look.'));
      const kept = new Set(t.keepOff || []);
      const trig = el('div', 'a11y-list');
      for (const g of t.triggers || []) {
        const entry = `${g.kind}:${g.name}`;
        trig.append(keepRow(entry, g.kind === 'class' ? `Class “${g.name}”` : `Attribute “${g.name}”${g.value ? ` = ${g.value}` : ''}`, `on ${g.on} — switches on the rules below`, kept.has(entry)));
      }
      for (const r of t.rules || []) {
        const entry = `rule:${r.selector}`;
        const row = keepRow(entry, r.selector, `${Object.keys(r.props).map(p => PROP[p] || p).join(', ')} · ${r.sheet}`, kept.has(entry));
        if (r.keepable === false) { row.querySelector('input').disabled = true; row.title = 'This selector is too long to keep off by name; keep off what switches it on instead.'; }
        trig.append(row);
      }
      for (const k of kept) if (!trig.querySelector(`[data-entry="${CSS.escape(k)}"]`)) trig.append(keepRow(k, k.replace(/^(\w+):/, '$1 '), 'kept off on this site (not on this page now)', true));
      if (trig.childNodes.length) { body.append(el('div', 'a11y-sub', 'What paints it, and what switches it on')); body.append(trig); }
      else body.append(el('div', 'a11y-hint', t.unreadable && t.unreadable.length
        ? `No rule this page lets Clear Glass read paints its links this way. ${t.unreadable.length} stylesheet(s) from other sites cannot be read: the look may be there, or kept by the site itself (below).`
        : 'No style rule paints the links this way: this is the site’s normal look, or it comes from the system (above).'));
      const ctl = el('div', 'a11y-ctl');
      for (const c of t.controls || []) {
        const b = el('button', 'a11y-btn', `Open the site’s accessibility settings${c.label ? `: ${c.label}` : ''}`); b.type = 'button';
        b.addEventListener('click', async () => {
          try { const r = await api.a11yOpenControl(wcId, c.n); if (!r || r.ok === false) throw new Error((r && r.error) || 'no answer'); say(`Opened “${r.opened || c.label}” on the page. A look the site keeps for your account is turned off there.`); }
          catch (err) { say(err.message, true); }
        });
        ctl.append(b);
      }
      if (t.widgets && t.widgets.length) ctl.append(el('div', 'a11y-hint', `The page runs ${t.widgets.join(', ')}, an accessibility widget that keeps its own settings.`));
      if (ctl.childNodes.length) { body.append(el('div', 'a11y-sub', 'The site’s own settings')); body.append(ctl); }
      if (t.applied && (t.applied.removed || t.applied.rules)) say(`Kept off on this page so far: ${t.applied.removed} switch(es) removed, ${t.applied.rules} rule(s) deleted.`);
    }

    async function refresh() {
      find.disabled = true; find.textContent = 'Tracing…';
      try {
        const t = await api.a11yTrace(wcId);
        if (!t || t.ok === false) throw new Error((t && t.error) || 'no answer');
        draw(t);
      } catch (err) { say(`Could not trace: ${err.message}`, true); }
      find.disabled = false; find.textContent = 'Trace again';
    }
    find.addEventListener('click', (e) => { e.stopPropagation(); refresh(); });
    clear.addEventListener('click', async (e) => {
      e.stopPropagation(); clear.disabled = true; say('Looking…');
      try {
        const r = await api.a11yReset(wcId);
        if (!r || r.ok === false) throw new Error((r && r.error) || 'no answer');
        const what = [].concat(r.storage.map(x => `${x.area} storage ${x.key}`), r.cookies.map(c => `cookie ${c}`), r.classes.html.concat(r.classes.body).map(c => `class ${c}`));
        say(what.length ? `Removed ${what.join(', ')} (backed up) and reloaded.` : `Nothing stored is named accessibility (looked at ${r.otherKeys.length} storage keys, ${r.otherCookies.length} cookies). Use Find what turns it on.`);
      } catch (err) { say(`Could not clear: ${err.message}`, true); }
      clear.disabled = false;
    });
    root.addEventListener('click', (e) => e.stopPropagation());
    return { el: root, refresh };
  }

  window.CGA11yPanel = { build };
})();
