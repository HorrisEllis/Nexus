'use strict';
// guardian/routes/settings.js — the real /settings cluster (3 routes),
// extracted verbatim from guardian/server.js.
//
// §DECOMPOSED 2026-08-29 — Phase 116's first real slice for guardian
// itself (docs/NEXUS-PHASE-MAP.md), the smallest of the 67 real,
// depth-aware-detected clusters (chosen deliberately first — same
// proof-before-scale discipline already proven twice this session on
// copilot/server.js's person-model routes and the full ollama/server.js
// decomposition). Same real handle(req, res, ctx) -> boolean contract —
// one proven pattern reused a third time, not a fourth differently-
// shaped experiment.
//
// jaa is a real, stateful JaaStore class instance (guardian/server.js's
// own `new JaaStore(STORE_DIR, ...)`), NOT a shared-singleton lib module
// the way ollama's lib/state.js is — re-instantiating a second JaaStore
// pointed at the same real on-disk data here would risk two independent
// in-memory copies desyncing. Injected via ctx instead, matching
// person-model.js's exact proven approach (json/readBody passed in, not
// required fresh) rather than restructuring guardian's own module
// organization as a side effect of this extraction.

function handle(req, res, ctx) {
  const { method, url, jaa, pRes, bodyJ } = ctx;

  if (method === 'GET' && url.pathname === '/settings') {
    const settings = jaa.all('settings') || [];
    const out = {};
    for (const s of settings) if (s.key) out[s.key] = s.value;
    pRes(res, 200, { ok: true, settings: out });
    return true;
  }

  if (method === 'PUT' && url.pathname.startsWith('/settings/')) {
    const key = decodeURIComponent(url.pathname.slice(10));
    bodyJ(req).then(body => {
      const existing = (jaa.all('settings') || []).filter(s => s.key === key);
      if (existing.length) jaa.update('settings', { uuid: existing[0].uuid }, { value: body.value });
      else jaa.insert('settings', { uuid: require('crypto').randomUUID(), key, value: body.value });
      pRes(res, 200, { ok: true, key, value: body.value });
    }).catch(e => pRes(res, 500, { ok: false, error: e.message }));
    return true;
  }

  if (method === 'POST' && url.pathname === '/settings/reset') {
    // §BUGFIX 2026-08-29 — found by this extraction's own real
    // end-to-end test, not assumed: jaa.query() does not exist on the
    // real JaaStore class (guardian/jaa-store.js only has insert/all/
    // update) — confirmed via git show HEAD that this exact call was
    // already broken in the committed code, not introduced by this
    // extraction. Every real call to /settings/reset would have thrown
    // a real, uncaught TypeError. Fixed using the real, correct method
    // — all(table) with no where filter is semantically identical to
    // the original's () => true predicate (match everything).
    //
    // §HONEST LIMIT — jaa.query() is called in 4 OTHER real places in
    // guardian/server.js (gaps, sessions x2, queue_compartments), all
    // with real, non-trivial function predicates (e.g. s => s.chatId
    // === chatId) that can't be blindly translated to all()'s object-
    // based where-matching without knowing _matches()'s real matching
    // semantics. Genuinely out of scope for this /settings extraction —
    // named directly, not silently left for someone to rediscover the
    // same way this one was found.
    // §BUGFIX 2026-08-29, second real bug found by the same test —
    // jaa.update()'s real where param is matched via Object.entries(),
    // requiring a real object shape ({uuid: ...}), not a bare string.
    // The original passed s.uuid directly (confirmed via git show HEAD
    // — pre-existing, not introduced here). This route had two
    // independent real bugs stacked on each other and had genuinely
    // never worked. Fixed using the exact real, correct shape the PUT
    // handler above already uses.
    jaa.all('settings').forEach(s =>
      jaa.update('settings', { uuid: s.uuid }, { value: null })
    );
    pRes(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handle };
