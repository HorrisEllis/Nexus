'use strict';
/**
 * lib/opportunity/score.js — how well an opportunity fits the profile, with every point explained.
 * comp_id: nexus.lib.opportunity.score
 * Version: 1.0.0
 *
 * Pure, deterministic, no model. A score James cannot audit is a score he cannot correct, so every adjustment is a
 * reason line with its weight. hardReject is separate from a low score: an excluded company or an "avoid" keyword in
 * the title is a rule James set, not a judgement this function is entitled to soften.
 */

const STOP = new Set('a an and are as at be by for from has have i in is it its of on or our that the this to we will with you your'.split(' '));

function tokens(s) {
  return String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/[^a-z0-9+#.]+/).map(t => t.replace(/\.+$/, '')).filter(t => t && !STOP.has(t));
}
function has(haystack, needle) {
  const n = String(needle || '').toLowerCase().trim();
  if (!n) return false;
  // whole-word/phrase match; symbols (c++, c#, node.js) matched literally
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, 'i').test(haystack);
}

const DEFAULTS = Object.freeze({ shortlistAbove: 55, maxAgeDays: 30 });

/**
 * score(opp, profile, { now }) → { score 0-100, reasons: [{ w, why }], hardReject: string|null }
 * profile: { roles[], skills[], mustHave[], avoid[], excludeCompanies[], remoteOnly, locations[], minSalary, maxAgeDays, kinds[] }
 */
function score(opp, profile = {}, { now = Date.now() } = {}) {
  const reasons = [];
  const add = (w, why) => { reasons.push({ w, why }); return w; };
  const title = String(opp.title || '');
  const body = [opp.title, opp.company, opp.description, (opp.tags || []).join(' '), opp.location].join(' \n ').toLowerCase();
  let s = 30; // neutral start: an opportunity with no signal either way lands below the default shortlist line
  add(30, 'base');

  const company = String(opp.company || '').toLowerCase();
  for (const c of profile.excludeCompanies || []) {
    if (c && company && company.includes(String(c).toLowerCase())) return { score: 0, reasons: [...reasons, { w: -100, why: `company "${opp.company}" is on your exclude list` }], hardReject: `excluded company: ${c}` };
  }
  for (const a of profile.avoid || []) {
    if (has(title.toLowerCase(), a)) return { score: 0, reasons: [...reasons, { w: -100, why: `title contains avoided "${a}"` }], hardReject: `avoided keyword in title: ${a}` };
  }
  if (Array.isArray(profile.kinds) && profile.kinds.length && opp.kind && !profile.kinds.includes(opp.kind)) {
    return { score: 0, reasons: [...reasons, { w: -100, why: `kind "${opp.kind}" is not one you track (${profile.kinds.join(', ')})` }], hardReject: `kind ${opp.kind} not tracked` };
  }

  const roles = profile.roles || [];
  const roleHit = roles.find(r => has(title.toLowerCase(), r));
  if (roleHit) s += add(25, `title matches role "${roleHit}"`);
  else if (roles.length) s += add(-10, `title matches none of your roles (${roles.slice(0, 4).join(', ')}${roles.length > 4 ? '…' : ''})`);

  const skills = profile.skills || [];
  const hits = skills.filter(k => has(body, k));
  if (skills.length) {
    const w = Math.round(35 * Math.min(hits.length, 8) / Math.min(skills.length, 8));
    if (hits.length) s += add(w, `skills matched (${hits.length}/${skills.length}): ${hits.slice(0, 8).join(', ')}`);
    else s += add(-5, 'none of your skills appear');
  }

  for (const m of profile.mustHave || []) {
    if (!has(body, m)) s += add(-15, `missing must-have "${m}"`);
  }
  for (const a of profile.avoid || []) {
    if (has(body, a)) s += add(-20, `mentions avoided "${a}"`);
  }

  if (profile.remoteOnly) {
    if (opp.remote === true) s += add(5, 'remote');
    else if (opp.remote === false) s += add(-40, 'not remote (you set remoteOnly)');
    else s += add(-5, 'remote status unknown');
  }
  const locs = profile.locations || [];
  if (locs.length && opp.location) {
    const l = locs.find(x => has(String(opp.location).toLowerCase(), x));
    if (l) s += add(5, `location matches "${l}"`);
  }

  const min = +profile.minSalary || 0;
  const sal = opp.salary || {};
  if (min && (sal.max || sal.min)) {
    if (sal.max && sal.max < min) s += add(-25, `pays at most ${sal.max} (your floor ${min})`);
    else if (sal.min && sal.min >= min) s += add(10, `pays from ${sal.min} (your floor ${min})`);
  }

  const maxAge = +profile.maxAgeDays || DEFAULTS.maxAgeDays;
  if (opp.postedAt) {
    const days = (now - new Date(opp.postedAt).getTime()) / 86400000;
    if (days > maxAge) s += add(-20, `posted ${Math.round(days)} days ago (limit ${maxAge})`);
    else if (days <= 3) s += add(5, 'posted in the last 3 days');
  }

  // 0.39.272 (L4) — what past applications led to. learned = learnedWeights() from lib/opportunity (bounded ±15, only
  // where there are enough outcomes to mean something); every adjustment says what it learned from.
  const L = arguments[2] && arguments[2].learned;
  if (L) {
    const srcKey = String(opp.source || '').split(':')[0];
    const ls = L.sources && (L.sources[opp.source] || L.sources[srcKey]);
    if (ls && ls.w) s += add(ls.w, `learned: ${ls.why}`);
    let skillAdj = 0; const whys = [];
    for (const k of hits) { const lk = L.skills && L.skills[String(k).toLowerCase()]; if (lk && lk.w) { skillAdj += lk.w; whys.push(lk.why); } }
    skillAdj = Math.max(-15, Math.min(15, skillAdj));
    if (skillAdj) s += add(skillAdj, `learned: ${whys.slice(0, 3).join('; ')}`);
  }

  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons, hardReject: null };
}

/** dedupeKey(opp) — same job seen twice (two sources, or twice from one) collapses to one row. */
function dedupeKey(opp) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (opp.company && opp.title) return `ct:${norm(opp.company)}|${norm(opp.title)}`;
  if (opp.url) return `u:${String(opp.url).replace(/[?#].*$/, '').replace(/\/$/, '')}`;
  return `s:${opp.source}:${opp.externalId}`;
}

module.exports = { score, dedupeKey, tokens, has, DEFAULTS };
