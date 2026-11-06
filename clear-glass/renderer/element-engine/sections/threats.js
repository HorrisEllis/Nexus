'use strict';
/**
 * renderer/element-engine/sections/threats.js — Element Engine → Threats  (styles: threats.css). EE3a, 0.60.416.
 * What ErosmancerOS's hostile/ sees on its pages, in plain words (ES3, GET /cli/eros/threats), refreshed every 5 s while open. A check a
 * person answers pauses a running macro and is handed to him; nothing is done to get past it (CM_D1). Read-only.
 */
(function () {
  const { h, pane, row, btn, chip, empty, onLeave, section } = window.CGS;
  const { api, matches } = window.CGL;

  section({
    id: 'threats', group: 'ErosmancerOS', icon: '⚠', label: 'Threats',
    keywords: 'hostile cloudflare captcha rate limit fingerprint bot check',
    blurb: 'Bot checks, CAPTCHAs, rate limits and fingerprinting ErosmancerOS sees. A check a person answers pauses the macro and comes to you; nothing tries to get past it.',
    async render({ rerender, query }) {
      const t = setTimeout(rerender, 5000); onLeave(() => clearTimeout(t));
      let d; try { d = await api('/cli/eros/threats'); } catch (e) { return pane({ body: empty(`ErosmancerOS is not answering (${e.message}). Threats show here when it runs.`) }); }
      const T = (d.threats || []).filter(x => matches(query, x.level, x.tab, ...(x.signals || []).map(s => s.what)));
      if (!T.length) return pane({ tools: btn('Refresh', rerender, 'sm'), body: empty((d.threats || []).length ? 'No threat matches.' : 'Nothing hostile seen.') });
      return T.map(x => pane({ title: `Page ${String(x.tab).slice(0, 8)}`, sub: `${x.level} · ${x.score}/100`, tools: chip(x.level, x.score >= 60 ? 'bad' : x.score >= 30 ? 'warn' : ''), flush: true,
        body: (x.signals || []).map(s => row(s.what, s.then)) }));
    },
  });
})();
