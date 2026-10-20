'use strict';
/**
 * renderer/settings/sections/import.js — Import from Firefox (BS7, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-SURFACE.
 *
 * James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.?" Each Firefox profile on this machine, what
 * it holds, and a real import (src/import/firefox.js through http://127.0.0.1:7702/cli/firefox/*): cookies into the everyday session or a
 * provider tab, bookmarks, and the profile's user agent. Firefox's databases are read from a copy, so Firefox can stay open. The report
 * counts what was skipped and why; it never shows a cookie's value.
 */
(function () {
  const { h, section, pane, row, btn, chip, field, select, toggle, toast, fail } = window.CGS;
  const BRIDGE = 'http://127.0.0.1:7702';
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try { res = await fetch(BRIDGE + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) }); }
    catch (e) { throw new Error(`Clear Glass bridge :7702 unreachable (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
    let j = null; try { j = await res.json(); } catch (_) {}
    if (!res.ok || (j && j.ok === false && !j.cookies)) throw new Error((j && (j.error || (j.errors || []).join('; '))) || `HTTP ${res.status}`);
    return j || {};
  }
  const SKIP = { expired: 'expired', container: 'in a container tab', private: 'from a private window', partitioned: 'partitioned (third-party)', bad: 'unreadable', refused: 'refused by Chromium' };

  section({
    id: 'import', group: 'Browser', icon: '🦊', label: 'Import',
    keywords: 'firefox import profile cookies bookmarks sign in logins migrate mozilla user agent persona',
    blurb: 'Bring a Firefox profile into Clear Glass: its cookies (so your sign-ins come with you), its bookmarks and its user agent. Firefox can stay open; its files are read from a copy.',
    async render({ rerender }) {
      let d;
      try { d = await api('/cli/firefox/profiles'); } catch (e) { return [pane({ title: 'Import from Firefox', body: h('div', { class: 'err-box', text: e.message }) })]; }
      const profiles = d.profiles || [];
      if (!profiles.length) return [pane({ title: 'Import from Firefox', body: [h('p', { class: 'blurb', text: 'No Firefox profile was found on this machine. Looked in:' }), h('pre', { class: 'out', text: (d.looked || []).join('\n') })] })];

      let pick = (profiles.find(p => p.isDefault) || profiles[0]).path;
      const want = { cookies: true, bookmarks: true, persona: false };
      const into = select(['default', 'ncp-chatgpt', 'ncp-claude', 'ncp-gemini', 'ncp-perplexity', 'ncp-deepseek'], 'default');
      const report = h('div', { class: 'imp-report' });
      const rows = profiles.map(p => {
        const r = row(`${p.name}`, p.path, chip(p.isDefault ? 'default' : 'profile', p.isDefault ? 'ok' : ''),
          ...['cookies', 'places', 'prefs'].map(k => chip(k === 'places' ? 'bookmarks' : k, p.has && p.has[k] ? 'ok' : '')));
        r.classList.add('imp-profile'); r.dataset.path = p.path; r.tabIndex = 0; r.setAttribute('role', 'radio');
        const choose = () => { pick = p.path; document.querySelectorAll('.imp-profile').forEach(x => x.setAttribute('aria-checked', String(x.dataset.path === pick))); };
        r.addEventListener('click', choose); r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
        r.setAttribute('aria-checked', String(p.path === pick));
        return r;
      });
      const run = btn('Import', async () => {
        if (!want.cookies && !want.bookmarks && !want.persona) return toast('choose at least one thing to bring');
        run.disabled = true; report.replaceChildren(h('p', { class: 'blurb', text: 'Importing…' }));
        try {
          const r = await api('/cli/firefox/import', { method: 'POST', body: { profile: pick, cookies: want.cookies, bookmarks: want.bookmarks, persona: want.persona, into: into.value } });
          const c = r.cookies, b = r.bookmarks;
          const skipped = c ? Object.entries(c.skipped || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${SKIP[k] || k}`) : [];
          report.replaceChildren(
            c ? row('Cookies', `${c.imported} of ${c.read} imported into ${r.into === 'default' ? 'everyday browsing' : r.into}${skipped.length ? ` · skipped: ${skipped.join(', ')}` : ''}`, chip(`${c.imported}`, 'ok')) : null,
            b ? row('Bookmarks', `${b.added} added · ${b.existing} already there`, chip(`${b.added}`, 'ok')) : null,
            r.persona ? row('User agent', r.persona.userAgent ? 'Firefox’s user agent override applied to this window’s persona' : 'This profile has no user agent override; nothing changed', chip(r.persona.userAgent ? 'applied' : 'none', r.persona.userAgent ? 'ok' : '')) : null,
            ...(r.errors || []).map(e => h('p', { class: 'warn-box', text: e })));
          toast('Firefox import done');
        } catch (e) { report.replaceChildren(h('p', { class: 'err-box', text: e.message })); fail(e); }
        finally { run.disabled = false; }
      }, 'primary');
      run.id = 'imp-run';
      return [
        pane({ title: 'Firefox profiles', sub: 'Choose the profile to bring in. The default one is the one Firefox opens.', body: h('div', { class: 'imp-list', role: 'radiogroup' }, rows) }),
        pane({ title: 'What to bring', body: [
          row('Cookies', 'Your sign-ins come with you. Container tabs, private windows and expired cookies are skipped and counted. Snowflake windows never receive them.', toggle(want.cookies, (on) => { want.cookies = on; })),
          row('Into', 'Everyday browsing (the session ordinary windows use), or one provider tab', into),
          row('Bookmarks', 'Added with the tag "firefox" and their folder; ones you already have are left alone.', toggle(want.bookmarks, (on) => { want.bookmarks = on; })),
          row('User agent', 'If the profile sets general.useragent.override, this window’s persona takes it.', toggle(want.persona, (on) => { want.persona = on; })),
          h('div', { class: 'acts imp-acts' }, run),
          report,
        ] }),
        pane({ title: 'What is not imported', body: h('p', { class: 'blurb', text: 'Saved passwords stay in Firefox: they are encrypted with Firefox’s own key (and its primary password if you set one), and reading them is not built. History is not imported either.' }) }),
      ];
    },
  });
})();
