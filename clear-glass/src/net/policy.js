'use strict';
/**
 * clear-glass/src/net/policy.js — which way does a request go? (NP2, 0.60.60). Pure: no Electron, no network.
 * comp_id: cg.net.policy
 *
 * James, 2026-10-15: "protocol specific proxy settings, with settings for global connection settings, per site settings ... provider or url specific,
 * site or cli specific." One table of rules. A rule says WHO it is for (provider, url pattern, origin, caller), WHICH protocols, and VIA what:
 *   direct | block | transport (the Snowflake/Tor SOCKS port, when it is up) | socks5://host:port | http://host:port
 * The most specific matching rule wins. Two equally specific rules that disagree are a hard error (SISO law 1: collision is never a silent winner).
 * With no rules at all nothing is routed: everything is direct, and nothing here touches a session (default posture, decision NP0b).
 *
 * FAIL CLOSED: a rule that points at the transport while the transport is down, and any `block`, compile to a proxy nothing listens on
 * (BLACKHOLE). The PAC never lists DIRECT as a second choice, so Chromium cannot fall back to a direct connection.
 */
const WEB = ['http', 'https', 'ws', 'wss', 'ftp'];
const BLACKHOLE = 'PROXY 127.0.0.1:1';
const FAILURES = ['block', 'freeze', 'kill_tabs', 'kill_compartment'];   // only `block` is enforced so far (NP15/NP17); the others are stored, and say so

// specificity: higher wins. A macro/automation caller is the most specific thing there is.
function specificity(m = {}) {
  let s = 0;
  if (m.urlPattern) s += 40;
  if (m.provider) s += 30;
  if (m.origin) s += 20;
  if (m.caller) s += /^(macro|automation):/.test(m.caller) ? 50 : 10;
  return s;
}

function globToRegex(glob) {
  return new RegExp('^' + String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
}
function parseVia(via) {
  if (via === 'direct' || via === 'block' || via === 'transport') return { kind: via };
  const m = /^(socks5|http):\/\/([^\s/@:]+):(\d{1,5})$/i.exec(String(via || ''));
  if (m && +m[3] >= 1 && +m[3] <= 65535) return { kind: m[1].toLowerCase(), host: m[2], port: +m[3] };
  return null;
}

/** validate(rule) -> { ok, rule } | { ok:false, error } — normalises; rejects what it cannot honour. */
function validate(rule) {
  if (!rule || typeof rule !== 'object') return { ok: false, error: 'a rule is an object' };
  const via = parseVia(rule.via);
  if (!via) {
    if (/@/.test(String(rule.via || ''))) return { ok: false, error: 'a proxy with a user name or password is not accepted yet: credentials need the encrypted container (NP19), and are never stored in plain text' };
    return { ok: false, error: `via must be direct, block, transport, socks5://host:port or http://host:port (got ${JSON.stringify(rule.via)})` };
  }
  const match = { ...(rule.match || {}) };
  for (const k of Object.keys(match)) if (!['provider', 'urlPattern', 'origin', 'caller'].includes(k)) return { ok: false, error: `unknown match field "${k}"` };
  if (!Object.values(match).some(Boolean)) return { ok: false, error: 'a rule must say who it is for (provider, urlPattern, origin or caller); use the policy default for everything' };
  if (match.origin) match.origin = String(match.origin).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  let protocols = rule.protocols;
  if (protocols != null) {
    protocols = [].concat(protocols).map(p => String(p).toLowerCase());
    const bad = protocols.find(p => !WEB.includes(p));
    if (bad) return { ok: false, error: `protocol "${bad}" is not one of ${WEB.join(', ')}` };
  }
  const onFailure = rule.onFailure || 'block';
  if (!FAILURES.includes(onFailure)) return { ok: false, error: `onFailure must be one of ${FAILURES.join(', ')}` };
  const id = String(rule.id || '').trim();
  if (!/^[\w.-]{1,60}$/.test(id)) return { ok: false, error: 'a rule needs an id of letters, digits, . _ - (max 60)' };
  return { ok: true, rule: { id, match, via: String(rule.via), protocols: protocols || null, incognito: !!rule.incognito, onFailure, note: rule.note ? String(rule.note).slice(0, 200) : null } };
}

function protocolOf(url) { try { return new URL(url).protocol.replace(':', '').toLowerCase(); } catch (_) { return null; } }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (_) { return null; } }

function matches(rule, req) {
  const m = rule.match;
  const proto = protocolOf(req.url);
  if (rule.protocols && !rule.protocols.includes(proto)) return false;
  if (m.provider && m.provider !== req.provider) return false;
  if (m.caller && m.caller !== req.caller) return false;
  if (m.urlPattern && !globToRegex(m.urlPattern).test(req.url || '')) return false;
  if (m.origin) { const h = hostOf(req.url); if (!h || !(h === m.origin || h.endsWith('.' + m.origin))) return false; }
  return true;
}

/**
 * resolve(policy, { url, provider?, caller? }) ->
 *   { ok:true, via, ruleId|null, why, specificity } | { ok:false, error:'collision', ids:[...], why }
 */
function resolve(policy, req) {
  const def = (policy && policy.default) || 'direct';
  const rules = ((policy && policy.rules) || []).filter(r => matches(r, req));
  if (!rules.length) return { ok: true, via: def, ruleId: null, specificity: 0, why: `no rule matches; the policy default is ${def}` };
  const best = Math.max(...rules.map(r => specificity(r.match)));
  const top = rules.filter(r => specificity(r.match) === best);
  const vias = new Set(top.map(r => r.via));
  if (vias.size > 1) return { ok: false, error: 'collision', ids: top.map(r => r.id), why: `rules ${top.map(r => r.id).join(' and ')} are equally specific and disagree (${[...vias].join(' vs ')}); make one more specific or remove one` };
  const r = top[0];
  return { ok: true, via: r.via, ruleId: r.id, specificity: best, onFailure: r.onFailure, incognito: r.incognito, why: `rule ${r.id} (${Object.entries(r.match).map(([k, v]) => `${k}=${v}`).join(', ')})` };
}

// can ONE request satisfy both rules? Conservative: only provably disjoint scopes return false.
function overlaps(a, b) {
  for (const k of ['provider', 'caller']) if (a.match[k] && b.match[k] && a.match[k] !== b.match[k]) return false;
  if (a.match.origin && b.match.origin) { const x = a.match.origin, y = b.match.origin; if (!(x === y || x.endsWith('.' + y) || y.endsWith('.' + x))) return false; }
  if (a.protocols && b.protocols && !a.protocols.some(p => b.protocols.includes(p))) return false;
  return true;
}
function conflicting(a, b) { return a.id !== b.id && specificity(a.match) === specificity(b.match) && a.via !== b.via && overlaps(a, b); }
/** conflicts(rules) -> [[idA, idB], ...] — equally specific, different route, and a request could match both */
function conflicts(rules = []) { const out = []; for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) if (conflicting(rules[i], rules[j])) out.push([rules[i].id, rules[j].id]); return out; }

/** addRule(policy, rule) -> { ok, policy } — refuses a duplicate id and a rule that would collide with an existing one over the same request space */
function addRule(policy, rule) {
  const v = validate(rule); if (!v.ok) return v;
  if ((policy.rules || []).some(r => r.id === v.rule.id)) return { ok: false, error: `a rule "${v.rule.id}" already exists` };
  const clash = (policy.rules || []).find(r => conflicting(r, v.rule));
  if (clash) return { ok: false, error: `collision: "${clash.id}" (${clash.via}) is exactly as specific as the new rule (${v.rule.via}) and one request could match both; make one more specific (add a url pattern or a protocol) or remove one` };
  return { ok: true, policy: { ...policy, rules: [...(policy.rules || []), v.rule] }, rule: v.rule };
}
function removeRule(policy, id) {
  if (!(policy.rules || []).some(r => r.id === id)) return { ok: false, error: `no rule "${id}"` };
  return { ok: true, policy: { ...policy, rules: policy.rules.filter(r => r.id !== id) } };
}

function proxyString(via, transport) {
  const p = parseVia(via);
  if (!p) return BLACKHOLE;
  if (p.kind === 'direct') return 'DIRECT';
  if (p.kind === 'block') return BLACKHOLE;
  if (p.kind === 'transport') return transport && transport.socksPort ? `SOCKS5 127.0.0.1:${transport.socksPort}` : BLACKHOLE;   // down => closed, never direct
  if (p.kind === 'socks5') return `SOCKS5 ${p.host}:${p.port}`;
  return `PROXY ${p.host}:${p.port}`;
}

/**
 * pacFor(policy, ctx:{provider?, caller?}, transport:{socksPort|null}) -> PAC text for ONE session.
 * A PAC sees only the URL, so provider and caller are decided HERE (which rules apply to this session); urlPattern, origin and protocol are decided in the PAC.
 * Returns null when no rule applies and the default is direct: the caller then leaves the session alone.
 */
/**
 * 2026-10-16 — James: "for the google login, can you do everything you can to prevent that? like across domains, contexts,
 * erosmanceros, proxy,". Google's sign-in refuses (or walls) a sign-in from a Tor exit, and a collision compiled closed
 * leaves it nowhere to go. signinRoute(policy, ctx, transport) -> { pac, why } — the route Google's sign-in hosts take
 * in this session:
 *   - what the policy resolves for https://accounts.google.com/ (a person's own http/socks proxy is honoured: one
 *     consistent egress is what Google expects);
 *   - EXCEPT the transport (Tor/Snowflake) and a collision: DIRECT, said. policy.signinOverTransport: true keeps the
 *     transport for those who want it, knowing Google may refuse;
 *   - an explicit 'block' stays blocked (that is a decision, not an accident).
 */
const SIGNIN_HOSTS_PAC = '/^accounts\\.google\\.[a-z]{2,3}(\\.[a-z]{2})?$|^accounts\\.youtube\\.com$|^gds\\.google\\.com$/';
function signinRoute(policy = {}, ctx = {}, transport = {}) {
  const r = resolve(policy, { url: 'https://accounts.google.com/', provider: ctx.provider, caller: ctx.caller });
  if (!r.ok) return { pac: 'DIRECT', why: `the rules for Google's sign-in collide (${r.ids.join(', ')}): sign-in goes direct rather than nowhere` };
  const p = parseVia(r.via) || { kind: 'direct' };
  if (p.kind === 'transport' && !policy.signinOverTransport) return { pac: 'DIRECT', why: 'Google refuses a sign-in from a Tor exit: sign-in goes direct (policy.signinOverTransport: true keeps the transport)' };
  return { pac: proxyString(r.via, transport), why: r.why };
}

/**
 * §0.60.109 TL3 — the TLS layer (cg-tls-helper, docs/2026-10-16-tls-layer-phasemap.spec). James: "fix it. i don't want the
 * trouble again". layer = { tlsPort }: in a Firefox-persona session (ctx.firefox), an https/wss request whose route is
 * direct goes through the helper, so its TLS handshake is Firefox's too. "; DIRECT" after it: a helper that is down never
 * takes a site with it. A request routed elsewhere (a person's proxy, the transport, a block) keeps its route.
 */
function pacFor(policy, ctx = {}, transport = {}, layer = {}) {
  const layerOn = !!(ctx.firefox && layer && layer.tlsPort);
  const ret = (s) => (layerOn && s === 'DIRECT' ? 'L(proto)' : JSON.stringify(s));
  const applicable = (policy.rules || []).filter(r => (!r.match.provider || r.match.provider === ctx.provider) && (!r.match.caller || r.match.caller === ctx.caller));
  const def = policy.default || 'direct';
  if (!applicable.length && def === 'direct' && !layerOn) return null;
  const ordered = [...applicable].sort((a, b) => specificity(b.match) - specificity(a.match));
  const clashing = new Set(conflicts(ordered).flat());   // a stored conflict (hand-edited file) compiles CLOSED, never to a silent winner
  const lines = ordered.map(r => {
    const conds = [];
    if (r.protocols) conds.push(`(${r.protocols.map(p => `proto === ${JSON.stringify(p)}`).join(' || ')})`);
    if (r.match.urlPattern) conds.push(`new RegExp(${JSON.stringify(globToRegex(r.match.urlPattern).source)}, "i").test(url)`);
    if (r.match.origin) conds.push(`(host === ${JSON.stringify(r.match.origin)} || host.slice(-${r.match.origin.length + 1}) === ${JSON.stringify('.' + r.match.origin)})`);
    return `  if (${conds.length ? conds.join(' && ') : 'true'}) return ${clashing.has(r.id) ? JSON.stringify(BLACKHOLE) : ret(proxyString(r.via, transport))};   // ${r.id}${clashing.has(r.id) ? ' (COLLISION: closed)' : ''}`;
  });
  return [
    '// generated by clear-glass/src/net/policy.js — do not edit',
    'function FindProxyForURL(url, host) {',
    '  host = String(host).toLowerCase(); var proto = url.split(":")[0].toLowerCase();',
    '  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return "DIRECT";   // the transport\'s own ports and local tools stay local',
    ...(layerOn ? [`  function L(p) { return (p === "https" || p === "wss") ? ${JSON.stringify(`PROXY 127.0.0.1:${layer.tlsPort}; DIRECT`)} : "DIRECT"; }   // the TLS layer (cg-tls-helper)`] : []),
    (() => { const g = signinRoute(policy, ctx, transport); return `  if (${SIGNIN_HOSTS_PAC}.test(host)) return ${ret(g.pac)};   // Google's sign-in: ${g.why.replace(/\n/g, ' ')}`; })(),
    ...lines,
    `  return ${ret(proxyString(def, transport))};`,
    '}',
  ].join('\n');
}

module.exports = { signinRoute, WEB, BLACKHOLE, FAILURES, specificity, overlaps, conflicts, globToRegex, parseVia, validate, matches, resolve, addRule, removeRule, proxyString, pacFor };
