'use strict';
/**
 * clear-glass/src/adblock/engine.js — the content blocker's engine: filter lists parsed, requests matched, element hiding per page
 * (AB1, 0.60.183). Spec: clear-glass/spec/adblock.spec MOD-ABK-ENGINE. comp_id: cg.adblock.engine
 *
 * James, 2026-10-21: "can you make a full adblocker". Reads the Adblock Plus / uBlock Origin syntax the standard lists are written in, and
 * hosts files. Pure (ABK-003): strings in, verdicts out; files, network and Electron live in lists.js and the wiring.
 *
 * Supported, exactly: ||host^ and |anchors|, * and ^, /regex/, @@ exceptions; options third-party/~third-party (1p, 3p, first-party),
 * resource types and their negations, domain=a|~b, important, match-case, all, document (the only way a page itself is blocked, ABK-005);
 * exception-only elemhide/generichide; ## and #@# with domains. Anything else (##+js scriptlets, $redirect, $csp, $removeparam, :has-text…)
 * is skipped and counted by its name (ABK-001), never half-applied.
 * Third-party is judged on the registrable domain: the last two labels, three under a known second-level suffix (co.uk, com.au…). An
 * approximation of the public suffix list, said here, not hidden.
 */

const TYPE = {
  script: ['script'], image: ['image'], stylesheet: ['stylesheet'], css: ['stylesheet'], object: ['object'], 'object-subrequest': ['object'],
  xmlhttprequest: ['xhr'], xhr: ['xhr'], subdocument: ['subFrame'], frame: ['subFrame'], media: ['media'], font: ['font'],
  websocket: ['webSocket'], ping: ['ping', 'cspReport'], beacon: ['ping'], other: ['other'], document: ['mainFrame'], doc: ['mainFrame'],
};
const NOT_SUPPORTED = new Set(['redirect', 'redirect-rule', 'csp', 'removeparam', 'replace', 'rewrite', 'header', 'permissions', 'to', 'from',
  'method', 'denyallow', 'badfilter', 'cname', 'empty', 'mp4', 'inline-script', 'inline-font', 'genericblock', 'urltransform', 'uritransform',
  'urlskip', 'ipaddress', 'strict1p', 'strict3p', 'webrtc', 'rewrite', 'sitekey', 'content', 'jsinject', 'stealth', 'cookie', 'network', 'app',
  'jsonprune', 'hls', 'referrerpolicy', 'extension', 'specifichide', 'shide', 'elemhide-only']);
const POPUP = new Set(['popup', 'popunder']);
const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'mil', 'nic', 'ltd', 'plc', 'nom', 'sch', 'gv']);
const PROCEDURAL = /:(?:-abp-[\w-]+|has-text|contains|xpath|matches-css(?:-before|-after)?|matches-attr|matches-path|matches-media|matches-prop|min-text-length|nth-ancestor|upward|remove(?:-attr|-class)?|style|watch-attr|others|if(?:-not)?)\(/;

/** siteOf(host) — the registrable domain, approximately (see header). */
function siteOf(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h || /^[\d.]+$/.test(h) || h.includes(':')) return h;
  const p = h.split('.');
  if (p.length <= 2) return h;
  const take = (SLD.has(p[p.length - 2]) && p[p.length - 1].length === 2) ? 3 : 2;
  return p.slice(-take).join('.');
}
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; } }
function domainMatch(host, d) { return host === d || host.endsWith('.' + d); }

function parseDomains(spec, sep) {
  const include = [], exclude = [];
  for (const raw of String(spec || '').split(sep)) {
    const d = raw.trim().toLowerCase(); if (!d) continue;
    if (d.startsWith('~')) exclude.push(d.slice(1)); else include.push(d);
  }
  return { include, exclude };
}
function domainsAllow(dom, pageHost) {
  if (!dom) return true;
  if (dom.exclude.some(d => domainMatch(pageHost, d))) return false;
  return dom.include.length === 0 || dom.include.some(d => domainMatch(pageHost, d));
}

function patternToRegex(p, matchCase) {
  let re = '', i = 0;
  if (p.startsWith('||')) { re = '^[a-z][a-z0-9+.-]*:\\/\\/(?:[^\\/?#]*\\.)?'; i = 2; }
  else if (p.startsWith('|')) { re = '^'; i = 1; }
  let end = '';
  let body = p.slice(i);
  if (body.endsWith('|')) { end = '$'; body = body.slice(0, -1); }
  for (const ch of body) {
    if (ch === '*') re += '.*';
    else if (ch === '^') re += '(?:[^\\w.%-]|$)';
    else re += ch.replace(/[.+?${}()|[\]\\\/]/g, '\\$&');
  }
  return new RegExp(re + end, matchCase ? '' : 'i');
}

// the longest run of letters/digits/%, not touching a wildcard, used to index the rule (a request is tokenised the same way)
function tokenOf(p) {
  if (p.startsWith('/') && p.endsWith('/')) return null;
  let best = null;
  const s = p.replace(/^\|\|?/, '');
  const re = /[a-z0-9%]{3,}/gi; let m;
  while ((m = re.exec(s))) {
    const before = s[m.index - 1], after = s[m.index + m[0].length];
    if (before === '*' || after === '*') continue;
    if (!best || m[0].length > best.length) best = m[0].toLowerCase();
  }
  return best;
}

/** parseNetwork(line) → { rule } | { skip: why } */
function parseNetwork(line) {
  let s = line, exception = false;
  if (s.startsWith('@@')) { exception = true; s = s.slice(2); }
  let opts = '';
  let dollar = s.lastIndexOf('$');
  if (s.startsWith('/') && dollar < s.lastIndexOf('/')) dollar = -1;   // a $ inside a /regex/ is the regex's
  if (dollar >= 0) { opts = s.slice(dollar + 1); s = s.slice(0, dollar); }
  const rule = { raw: line, exception, important: false, host: null, regex: null, token: null, types: null, notTypes: null, party: null, domains: null, matchCase: false, elemhide: false, generichide: false };
  if (opts) {
    for (const o0 of opts.split(',')) {
      const o = o0.trim(); if (!o) continue;
      const neg = o.startsWith('~'); const name = (neg ? o.slice(1) : o).split('=')[0].toLowerCase(); const val = o.includes('=') ? o.slice(o.indexOf('=') + 1) : '';
      if (name === 'third-party' || name === '3p') rule.party = neg ? 'first' : 'third';
      else if (name === 'first-party' || name === '1p') rule.party = neg ? 'third' : 'first';
      else if (name === 'domain' || name === 'from') { if (name === 'from') return { skip: 'from' }; rule.domains = parseDomains(val, '|'); }
      else if (name === 'important') rule.important = true;
      else if (name === 'match-case') rule.matchCase = true;
      else if (name === 'all') rule.types = new Set(Object.values(TYPE).flat());
      else if (name === 'elemhide' || name === 'ehide') { if (!exception) return { skip: 'elemhide-block' }; rule.elemhide = true; }
      else if (name === 'generichide' || name === 'ghide') { if (!exception) return { skip: 'generichide-block' }; rule.generichide = true; }
      else if (TYPE[name]) { const set = neg ? (rule.notTypes = rule.notTypes || new Set()) : (rule.types = rule.types || new Set()); for (const t of TYPE[name]) set.add(t); }
      else if (POPUP.has(name)) return { skip: 'popup' };
      else if (NOT_SUPPORTED.has(name)) return { skip: name };
      else return { skip: `option:${name}` };
    }
  }
  if (!s || s === '*' || s === '|' || s === '||') { if (!rule.elemhide && !rule.generichide && !rule.domains) return { skip: 'too-broad' }; s = s || '*'; }
  if (s.startsWith('/') && s.endsWith('/') && s.length > 2) {
    try { rule.regex = new RegExp(s.slice(1, -1), rule.matchCase ? '' : 'i'); } catch (_) { return { skip: 'bad-regex' }; }
  } else {
    const hm = /^\|\|([a-z0-9.-]+)(\^|\/|$)(.*)$/i.exec(s);
    if (hm && !/[*]/.test(hm[1])) rule.host = hm[1].toLowerCase();
    try { rule.regex = patternToRegex(s, rule.matchCase); } catch (_) { return { skip: 'bad-pattern' }; }
    rule.token = rule.host ? null : tokenOf(s);
  }
  return { rule };
}

/** parseCosmetic(line) → { rule } | { skip } | null when the line is not cosmetic */
function parseCosmetic(line) {
  const m = /^([^#]*?)(#@?#|#\?#|#@\?#|#\$#|#@\$#|#%#|#@%#)(.+)$/.exec(line);
  if (!m) return null;
  const [, doms, sep, sel] = m;
  if (sep !== '##' && sep !== '#@#') return { skip: sep.includes('?') ? 'procedural' : sep.includes('$') ? 'css-inject' : 'scriptlet' };
  if (sel.startsWith('+js(') || sel.startsWith('^')) return { skip: sel.startsWith('^') ? 'html-filter' : 'scriptlet' };
  if (PROCEDURAL.test(sel)) return { skip: 'procedural' };
  if (/[{}]/.test(sel)) return { skip: 'bad-selector' };
  return { rule: { selector: sel.trim(), domains: parseDomains(doms, ','), exception: sep === '#@#' } };
}

/** parseList(text) → { network, cosmetic, skipped: { why: n }, lines } */
// AB5 (0.60.184): a plain domain list (one host per line) reads its bare lines as ||host^; in ABP syntax a bare word stays a substring rule
const BARE_HOST = /^(?:\*\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)\.?$/i;
function parseList(text, { source = '', format = 'abp' } = {}) {
  const network = [], cosmetic = [], skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  let lines = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('# ') || line === '#') continue;
    lines++;
    const hosts = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)\s+([^\s#]+)/.exec(line);
    if (hosts) { const h = hosts[1].toLowerCase(); if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.localdomain') || h === 'local') continue; const r = parseNetwork(`||${h}^`); r.rule ? network.push(Object.assign(r.rule, { source })) : skip(r.skip); continue; }
    if (line.startsWith('#') && !line.startsWith('##') && !line.startsWith('#@#')) continue;   // a hosts-file comment
    if (format !== 'abp') {
      const b = BARE_HOST.exec(line.replace(/\s+#.*$/, ''));
      if (b) { const r = parseNetwork(`||${b[1].toLowerCase()}^`); r.rule ? network.push(Object.assign(r.rule, { source })) : skip(r.skip); continue; }
      if (!/^(?:\|\||@@|\||\/)/.test(line) && !/#[@?$%]?#/.test(line)) { skip('not-a-host'); continue; }   // a host list's odd line is not a substring rule
    }
    const c = parseCosmetic(line);
    if (c) { c.rule ? cosmetic.push(Object.assign(c.rule, { source })) : skip(c.skip); continue; }
    const n = parseNetwork(line);
    n.rule ? network.push(Object.assign(n.rule, { source })) : skip(n.skip);
  }
  return { network, cosmetic, skipped, lines };
}

const URL_TOKENS = /[a-z0-9%]{3,}/g;

class Engine {
  constructor() { this.lists = new Map(); this._dirty = true; }
  load(id, parsed) { this.lists.set(id, parsed); this._dirty = true; return this; }
  unload(id) { this.lists.delete(id); this._dirty = true; return this; }
  has(id) { return this.lists.has(id); }

  _build() {
    const bucket = () => ({ host: new Map(), token: new Map(), generic: [] });
    // hide: exception-only $elemhide/$generichide (they never allow a request); page: @@…$document (the whole page unfiltered)
    const idx = { block: bucket(), allow: bucket(), important: bucket(), hide: bucket(), page: bucket() };
    const cos = { generic: [], specific: [], exceptions: [] };
    const put = (b, r) => {
      if (r.host) { (b.host.get(r.host) || b.host.set(r.host, []).get(r.host)).push(r); return; }
      if (r.token) { (b.token.get(r.token) || b.token.set(r.token, []).get(r.token)).push(r); return; }
      b.generic.push(r);
    };
    for (const l of this.lists.values()) {
      for (const r of l.network) {
        if (r.exception && (r.elemhide || r.generichide)) { put(idx.hide, r); if (!(r.types && r.types.has('mainFrame'))) continue; }
        if (r.exception && r.types && r.types.has('mainFrame')) { put(idx.page, r); continue; }
        put(r.exception ? idx.allow : r.important ? idx.important : idx.block, r);
      }
      for (const c of l.cosmetic) (c.exception ? cos.exceptions : c.domains.include.length ? cos.specific : cos.generic).push(c);
    }
    const ex = new Set(cos.exceptions.filter(c => !c.domains.include.length).map(c => c.selector));
    this._idx = idx; this._cos = { ...cos, generic: cos.generic.filter(c => !ex.has(c.selector) && !c.domains.exclude.length), genericExcl: cos.generic.filter(c => c.domains.exclude.length) };
    this._genericCss = null; this._dirty = false;
  }

  _candidates(b, host, url) {
    const out = [];
    const parts = host.split('.');
    for (let i = 0; i < parts.length; i++) { const h = parts.slice(i).join('.'); const hit = b.host.get(h); if (hit) out.push(...hit); }
    const seen = new Set(); let m; URL_TOKENS.lastIndex = 0;
    const low = url.toLowerCase();
    while ((m = URL_TOKENS.exec(low))) { if (seen.has(m[0])) continue; seen.add(m[0]); const hit = b.token.get(m[0]); if (hit) out.push(...hit); }
    if (b.generic.length) out.push(...b.generic);
    return out;
  }

  _applies(r, req) {
    const t = req.type || 'other';
    if (t === 'mainFrame') { if (!r.types || !r.types.has('mainFrame')) return false; }   // ABK-005
    else if (r.types && !r.types.has(t)) return false;
    if (r.notTypes && r.notTypes.has(t)) return false;
    if (r.party && req.pageHost) { const third = siteOf(req.host) !== siteOf(req.pageHost); if ((r.party === 'third') !== third) return false; }
    if (r.domains && !domainsAllow(r.domains, req.pageHost || '')) return false;
    return r.regex.test(req.url);
  }
  _first(b, req) { for (const r of this._candidates(b, req.host, req.url)) if (this._applies(r, req)) return r; return null; }

  /** match({ url, type, pageUrl }) → { block, rule, exception } */
  match({ url, type = 'other', pageUrl = '' } = {}) {
    if (this._dirty) this._build();
    const host = hostOf(url); if (!host) return { block: false, rule: null, exception: null };
    const pageHost = hostOf(pageUrl) || (type === 'mainFrame' ? host : '');
    const req = { url, host, type, pageHost };
    if (pageUrl && this._pageAllowed(pageUrl)) return { block: false, rule: null, exception: 'page' };
    const imp = this._first(this._idx.important, req);
    if (imp) return { block: true, rule: imp.raw, exception: null };
    const blk = this._first(this._idx.block, req);
    if (!blk) return { block: false, rule: null, exception: null };
    const ok = this._first(this._idx.allow, req);
    if (ok) return { block: false, rule: blk.raw, exception: ok.raw };
    return { block: true, rule: blk.raw, exception: null };
  }

  _pageAllowed(pageUrl) {
    const host = hostOf(pageUrl); if (!host) return false;
    const req = { url: pageUrl, host, type: 'mainFrame', pageHost: host };
    return !!this._first(this._idx.page, req);
  }

  _pageFlags(pageUrl) {
    const host = hostOf(pageUrl); let elemhide = false, generichide = false;
    for (const r of this._candidates(this._idx.hide, host, pageUrl)) {
      if (!(r.elemhide || r.generichide)) continue;
      if (r.domains && !domainsAllow(r.domains, host)) continue;
      if (!r.regex.test(pageUrl)) continue;
      if (r.elemhide) elemhide = true; if (r.generichide) generichide = true;
    }
    return { elemhide, generichide };
  }

  /** cosmetics(pageUrl) → CSS that hides the page's ad boxes ('' when nothing applies) */
  cosmetics(pageUrl) {
    if (this._dirty) this._build();
    const host = hostOf(pageUrl); if (!host) return '';
    const { elemhide, generichide } = this._pageFlags(pageUrl);
    if (elemhide || this._pageAllowed(pageUrl)) return '';
    const exHere = new Set(this._cos.exceptions.filter(c => c.domains.include.some(d => domainMatch(host, d))).map(c => c.selector));
    const sels = this._cos.specific.filter(c => domainsAllow(c.domains, host) && !exHere.has(c.selector)).map(c => c.selector);
    if (!generichide) {
      for (const c of this._cos.genericExcl) if (domainsAllow(c.domains, host) && !exHere.has(c.selector)) sels.push(c.selector);
      for (const c of this._cos.generic) if (!exHere.has(c.selector)) sels.push(c.selector);
    }
    return Engine.css(sels);
  }

  /** css(selectors) — grouped in :is(), whose forgiving list drops a selector the page's engine cannot read instead of the whole group */
  static css(sels) {
    const uniq = [...new Set(sels)]; const out = [];
    for (let i = 0; i < uniq.length; i += 400) out.push(`:is(${uniq.slice(i, i + 400).join(',')}){display:none!important}`);
    return out.join('\n');
  }

  counts() {
    let network = 0, cosmetic = 0;
    for (const l of this.lists.values()) { network += l.network.length; cosmetic += l.cosmetic.length; }
    return { network, cosmetic };
  }
}

module.exports = { BARE_HOST, parseList, parseNetwork, parseCosmetic, Engine, siteOf, patternToRegex, tokenOf };
