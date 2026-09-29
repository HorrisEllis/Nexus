'use strict';
/**
 * lib/opportunity/sources.js — where opportunities come from, each normalised to one shape.
 * comp_id: nexus.lib.opportunity.sources
 * Version: 1.0.0
 *
 * TWO KINDS OF SOURCE
 *   api     — public, no-login job APIs, fetched from James's machine (Node fetch). No scraping, no login, no ToS
 *             grey zone: these endpoints exist for exactly this. Configured per source in the profile
 *             (profile.sources: [{ type, query?, board?, company?, org?, url? , enabled }]).
 *   browser — any page Clear Glass can read (LinkedIn, Indeed, Upwork, Fiverr inbox/briefs, a company careers page).
 *             Not fetched here: captured from the page James (or an agent) has open, through clearglass.browser.tool
 *             read → capture(). The page is read the way James sees it, in his own session.
 *
 * THE ONE SHAPE every adapter returns (normalize* functions are pure and fixture-tested):
 *   { source, externalId, kind: 'job'|'gig'|'brief'|'lead', title, company, location, remote: bool|null,
 *     url, applyUrl, description (plain text), salary: { min, max, currency, period } | null, tags[], postedAt (ISO) }
 *
 * §HONEST LIMIT — the API field names below were written from each API's published shape; this build environment
 * could not reach any of them (egress allowlist), so they are verified against fixtures in the tests, not live. Every
 * normalizer reads several spellings per field and a field it cannot find is null, never invented. A source that
 * changes shape fails loudly in fetchSource() (0 normalised of N raw is reported as a problem, not as "no jobs").
 */

const UA = 'NEXUS-opportunity/1.0 (+personal job search; contact via profile)';

// Feeds often carry entity-ESCAPED html ("&lt;p&gt;"): one pass decodes it into tags, a second strips them.
function stripHtml(s) {
  const once = _strip(s);
  return /<\/?[a-z][^>]*>/i.test(once) ? _strip(once) : once;
}
function _strip(s) {
  return String(s || '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}
const iso = (v) => { if (v === null || v === undefined || v === '') return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };
const isRemote = (...xs) => { const t = xs.filter(Boolean).join(' ').toLowerCase(); if (!t) return null; if (/\b(remote|anywhere|distributed|work from home|wfh)\b/.test(t)) return true; if (/\b(on-?site|in office|hybrid)\b/.test(t)) return false; return null; };

function parseSalary(text) {
  const t = String(text || '');
  const m = t.match(/([$€£])\s?(\d[\d,.]*)\s?(k)?\s*(?:-|–|to)\s*[$€£]?\s?(\d[\d,.]*)\s?(k)?/i);
  if (!m) return null;
  const num = (n, k) => { let v = parseFloat(n.replace(/,/g, '')); if (k || v < 1000) v *= 1000; return Math.round(v); };
  const cur = { $: 'USD', '€': 'EUR', '£': 'GBP' }[m[1]] || null;
  const min = num(m[2], m[3]), max = num(m[4], m[5] || m[3]);
  if (!(min > 0 && max >= min)) return null;
  return { min, max, currency: cur, period: /hour|\/hr|hourly/i.test(t) ? 'hour' : 'year' };
}

// ── normalizers (pure) ───────────────────────────────────────────────────────────────────────────────────────────
function normalizeRemotive(j) {
  return { source: 'remotive', externalId: String(j.id), kind: 'job', title: j.title, company: j.company_name || j.company || null,
    location: j.candidate_required_location || null, remote: true, url: j.url, applyUrl: j.url,
    description: stripHtml(j.description), salary: parseSalary(j.salary), tags: [...(j.tags || []), j.category, j.job_type].filter(Boolean), postedAt: iso(j.publication_date) };
}
function normalizeArbeitnow(j) {
  return { source: 'arbeitnow', externalId: String(j.slug || j.url), kind: 'job', title: j.title, company: j.company_name || null,
    location: j.location || null, remote: typeof j.remote === 'boolean' ? j.remote : isRemote(j.location), url: j.url, applyUrl: j.url,
    description: stripHtml(j.description), salary: parseSalary(j.description), tags: [...(j.tags || []), ...(j.job_types || [])], postedAt: iso(j.created_at) };
}
function normalizeRemoteOk(j) {
  if (!j || !j.id || !(j.position || j.title)) return null; // first array element is RemoteOK's legal notice, not a job
  const sal = (j.salary_min || j.salary_max) ? { min: +j.salary_min || null, max: +j.salary_max || null, currency: 'USD', period: 'year' } : null;
  return { source: 'remoteok', externalId: String(j.id), kind: 'job', title: j.position || j.title, company: j.company || null,
    location: j.location || null, remote: true, url: j.url || (j.slug ? `https://remoteok.com/remote-jobs/${j.slug}` : null), applyUrl: j.apply_url || j.url || null,
    description: stripHtml(j.description), salary: sal, tags: j.tags || [], postedAt: iso(j.date || j.epoch) };
}
function normalizeGreenhouse(j, board) {
  const loc = j.location && (j.location.name || j.location) || null;
  const desc = stripHtml(j.content || ''); // greenhouse content is HTML-escaped HTML: stripHtml decodes, then strips
  return { source: 'greenhouse', externalId: `${board}:${j.id}`, kind: 'job', title: j.title, company: j.company_name || board,
    location: loc, remote: isRemote(loc, j.title), url: j.absolute_url, applyUrl: j.absolute_url,
    description: desc, salary: parseSalary(desc), tags: (j.departments || []).map(d => d.name).filter(Boolean), postedAt: iso(j.updated_at || j.first_published) };
}
function normalizeLever(j, company) {
  const c = j.categories || {};
  return { source: 'lever', externalId: `${company}:${j.id}`, kind: 'job', title: j.text, company,
    location: c.location || (c.allLocations || [])[0] || null, remote: j.workplaceType ? j.workplaceType === 'remote' : isRemote(c.location, c.commitment),
    url: j.hostedUrl, applyUrl: j.applyUrl || j.hostedUrl, description: j.descriptionPlain || stripHtml(j.description),
    salary: j.salaryRange ? { min: j.salaryRange.min || null, max: j.salaryRange.max || null, currency: j.salaryRange.currency || null, period: /hour/i.test(j.salaryRange.interval || '') ? 'hour' : 'year' } : null,
    tags: [c.team, c.commitment, c.department].filter(Boolean), postedAt: iso(j.createdAt) };
}
function normalizeAshby(j, org) {
  const comp = j.compensation && (j.compensation.compensationTierSummary || j.compensation.scrapeableCompensationSalarySummary);
  return { source: 'ashby', externalId: `${org}:${j.id}`, kind: 'job', title: j.title, company: org,
    location: j.location || null, remote: typeof j.isRemote === 'boolean' ? j.isRemote : isRemote(j.location, j.workplaceType),
    url: j.jobUrl, applyUrl: j.applyUrl || j.jobUrl, description: j.descriptionPlain || stripHtml(j.descriptionHtml),
    salary: parseSalary(comp), tags: [j.department, j.team, j.employmentType].filter(Boolean), postedAt: iso(j.publishedAt || j.publishedDate) };
}
// HN "Who is hiring" comments: first line is conventionally "Company | Role | Location | REMOTE | Salary"
function normalizeHn(c) {
  const text = stripHtml(c.comment_text || c.text || '');
  if (!text) return null;
  const first = text.split('\n')[0];
  const parts = first.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { source: 'hn', externalId: String(c.objectID || c.id), kind: 'job', title: parts[1] || first.slice(0, 120), company: parts[0],
    location: parts.slice(2).join(' | ') || null, remote: isRemote(first), url: `https://news.ycombinator.com/item?id=${c.objectID || c.id}`,
    applyUrl: (text.match(/https?:\/\/\S+/) || [null])[0], description: text, salary: parseSalary(first), tags: [], postedAt: iso(c.created_at_i || c.created_at) };
}
// RSS 2.0 (We Work Remotely and most job boards with a feed). A minimal reader: item/title/link/pubDate/description.
function parseRss(xml) {
  const items = [];
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : null; };
  for (const m of String(xml || '').matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    items.push({ title: tag(it, 'title'), link: tag(it, 'link'), guid: tag(it, 'guid'), pubDate: tag(it, 'pubDate'), description: tag(it, 'description'), region: tag(it, 'region'), category: tag(it, 'category') });
  }
  return items;
}
function normalizeRss(i, feedName) {
  if (!i.title || !i.link) return null;
  // WWR titles are "Company: Role"
  const m = i.title.match(/^([^:]{1,80}):\s*(.+)$/);
  const desc = stripHtml(i.description);
  return { source: `rss:${feedName}`, externalId: i.guid || i.link, kind: 'job', title: stripHtml(m ? m[2] : i.title), company: m ? stripHtml(m[1]) : null,
    location: i.region || null, remote: isRemote(i.region, i.title, feedName) ?? (/remote/i.test(feedName) ? true : null), url: i.link, applyUrl: i.link,
    description: desc, salary: parseSalary(desc), tags: [i.category].filter(Boolean), postedAt: iso(i.pubDate) };
}

// ── fetchers ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function _get(url, { timeoutMs = 20000, text = false, fetchImpl = globalThis.fetch } = {}) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: text ? 'application/rss+xml, application/xml, text/xml, */*' : 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return text ? r.text() : r.json();
}

const TYPES = Object.freeze({
  remotive:   { needs: [], describe: 'Remotive public API — remote jobs, optional search query', async fetch(c, o) { const q = c.query ? `&search=${encodeURIComponent(c.query)}` : ''; const j = await _get(`https://remotive.com/api/remote-jobs?limit=${c.limit || 100}${q}`, o); return { raw: j.jobs || [], items: (j.jobs || []).map(normalizeRemotive) }; } },
  arbeitnow:  { needs: [], describe: 'Arbeitnow public job board API (EU-heavy, remote flag)', async fetch(c, o) { const j = await _get(`https://www.arbeitnow.com/api/job-board-api?page=${c.page || 1}`, o); return { raw: j.data || [], items: (j.data || []).map(normalizeArbeitnow) }; } },
  remoteok:   { needs: [], describe: 'RemoteOK public API (remote only; one feed, filter by profile)', async fetch(c, o) { const j = await _get('https://remoteok.com/api', o); const raw = Array.isArray(j) ? j : []; return { raw, items: raw.map(normalizeRemoteOk) }; } },
  greenhouse: { needs: ['board'], describe: 'A company\'s Greenhouse board (board = the slug in boards.greenhouse.io/<board>)', async fetch(c, o) { const j = await _get(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.board)}/jobs?content=true`, o); return { raw: j.jobs || [], items: (j.jobs || []).map(x => normalizeGreenhouse(x, c.board)) }; } },
  lever:      { needs: ['company'], describe: 'A company\'s Lever postings (company = the slug in jobs.lever.co/<company>)', async fetch(c, o) { const j = await _get(`https://api.lever.co/v0/postings/${encodeURIComponent(c.company)}?mode=json`, o); const raw = Array.isArray(j) ? j : []; return { raw, items: raw.map(x => normalizeLever(x, c.company)) }; } },
  ashby:      { needs: ['org'], describe: 'A company\'s Ashby job board (org = the slug in jobs.ashbyhq.com/<org>)', async fetch(c, o) { const j = await _get(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.org)}?includeCompensation=true`, o); return { raw: j.jobs || [], items: (j.jobs || []).map(x => normalizeAshby(x, c.org)) }; } },
  hn:         { needs: [], describe: 'Hacker News "Ask HN: Who is hiring?" — this month\'s thread, optional query', async fetch(c, o) {
    const s = await _get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=3', o);
    const story = (s.hits || []).find(h => /who is hiring/i.test(h.title || ''));
    if (!story) throw new Error('no current "Who is hiring?" thread found');
    const q = c.query ? `&query=${encodeURIComponent(c.query)}` : '';
    const j = await _get(`https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=${c.limit || 300}${q}`, o);
    // only top-level comments are postings
    const raw = (j.hits || []).filter(h => String(h.parent_id) === String(story.objectID));
    return { raw, items: raw.map(normalizeHn) };
  } },
  rss:        { needs: ['url'], describe: 'Any job RSS feed (e.g. https://weworkremotely.com/categories/remote-programming-jobs.rss)', async fetch(c, o) { const x = await _get(c.url, { ...o, text: true }); const raw = parseRss(x); const name = c.name || (() => { try { return new URL(c.url).host.replace(/^www\./, ''); } catch (_) { return 'feed'; } })(); return { raw, items: raw.map(i => normalizeRss(i, name)) }; } },
});

/**
 * fetchSource(cfg, opts) → { ok, type, items[], rawCount, dropped, error? }
 * A source that returns raw rows but normalises none is reported as a shape change, not as zero jobs.
 */
async function fetchSource(cfg = {}, opts = {}) {
  const T = TYPES[cfg.type];
  if (!T) return { ok: false, type: cfg.type, items: [], error: `unknown source type "${cfg.type}" — one of: ${Object.keys(TYPES).join(', ')}` };
  const missing = T.needs.filter(k => !cfg[k]);
  if (missing.length) return { ok: false, type: cfg.type, items: [], error: `${cfg.type} needs ${missing.join(', ')}` };
  try {
    const { raw, items } = await T.fetch(cfg, opts);
    const good = items.filter(x => x && x.title && (x.url || x.applyUrl));
    const out = { ok: true, type: cfg.type, items: good, rawCount: raw.length, dropped: raw.length - good.length };
    if (raw.length && !good.length) { out.ok = false; out.error = `${cfg.type}: ${raw.length} rows came back but none normalised — the API shape may have changed`; }
    return out;
  } catch (e) {
    return { ok: false, type: cfg.type, items: [], error: `${cfg.type}: ${e.message}` };
  }
}

// ── browser capture (from clearglass.browser.tool read) ──────────────────────────────────────────────────────────
function kindForHost(host) {
  if (/(^|\.)fiverr\.com$/.test(host)) return 'lead';
  if (/(^|\.)upwork\.com$/.test(host) || /freelancer\.com$|peopleperhour\.com$|guru\.com$|toptal\.com$|contra\.com$/.test(host)) return 'gig';
  return 'job';
}
/**
 * fromPage(page) — a page Clear Glass read (page/reader.js shape) → an opportunity. Deterministic: h1 is the title
 * when there is one, the page title otherwise; the company is the first "at X" / og:site-like line if found; the
 * description is the page text (budgeted). A model can refine it later; this never invents a field.
 */
function fromPage(page = {}) {
  if (!page || !page.url) return null;
  let host = ''; try { host = new URL(page.url).host.replace(/^www\./, ''); } catch (_) {}
  const h1 = (page.headings || []).find(h => h.level === 1);
  const title = (h1 && h1.text) || String(page.title || '').split(/[|–—-]/)[0].trim() || page.url;
  const text = String(page.text || '');
  const at = text.match(/\b(?:at|@)\s+([A-Z][\w&.\- ]{1,50})\b/);
  const kind = kindForHost(host);
  const applyBtn = (page.buttons || []).find(b => /apply|submit|send|reply|offer/i.test(b.text));
  return { source: `browser:${host || 'page'}`, externalId: page.url.replace(/[?#].*$/, ''), kind, title: title.slice(0, 200),
    company: at ? at[1].trim() : null, location: null, remote: isRemote(text.slice(0, 3000)), url: page.url, applyUrl: page.url,
    description: text.slice(0, 8000), salary: parseSalary(text.slice(0, 5000)), tags: [host].filter(Boolean), postedAt: null,
    captured: { fields: (page.fields || []).length, applyButton: applyBtn ? applyBtn.text : null } };
}

module.exports = { TYPES, fetchSource, fromPage, kindForHost, stripHtml, parseSalary, parseRss, iso, isRemote,
  normalizeRemotive, normalizeArbeitnow, normalizeRemoteOk, normalizeGreenhouse, normalizeLever, normalizeAshby, normalizeHn, normalizeRss };
