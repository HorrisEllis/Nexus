'use strict';
/**
 * guardian/lib/account-routing.js — which signed-in account a job runs as: by hat, intent and repo.
 * comp_id: nexus.guardian.account-routing
 * UUID: nexus-guardian-account-routing-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "can we build the actual cookie vault using jaa? that way we can have actual account routing, and
 * hat specific accounts. intent routing? … needs to be in guardian maybe?"
 *
 * What already existed: Clear Glass owns WHICH accounts there are (NexusOptions accounts, asked through
 * cg-account-authority.js) and keeps each account's cookies encrypted in its JAA cookie vault (src/cookies/vault.js,
 * account_cookies). What was missing is the choice: every NCP job ran as whoever the provider tab was signed in as.
 *
 * Guardian decides here, because Guardian is where the job, its hat and its intent are. A rule says: for this provider,
 * a job with this hat / intent / repo runs as this account. route(job) takes the most specific rule that matches
 * (the more fields a rule names, the more specific; then its priority; then the newest), else the job's own accountId,
 * else nothing — and nothing means nothing changes: the tab runs as it is signed in now. Every choice is logged with
 * why. The dispatcher (lib/dispatcher.js) asks Clear Glass to switch the provider tab to the routed account
 * (POST :7702/providers/:id/account — the tab's cookies saved to the vault under the account it was, the routed
 * account's restored) BEFORE the job is typed; a switch that fails fails the job with the reason — a job never runs
 * as an identity it was not routed to.
 *
 * Storage: a JaaStore (guardian/jaa-store.js) under guardian/data/accounts/jaa — tables account_rules and
 * account_route_log. No cookie or secret is ever stored here: only which account, and why.
 */
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'guardian.account-routing';
const VERSION = '1.0.0';
const T_RULES = 'account_rules', T_LOG = 'account_route_log', T_EXH = 'account_exhausted';   // 0.60.25 T_EXH: accounts at their limit
const MATCH_FIELDS = ['hat', 'intent', 'repo'];
const LOG_KEEP = 500;

function _norm(v) { return v == null || v === '' ? null : String(v).trim().toLowerCase(); }

/** the intent of a job: its command, or the intent the caller gave it */
function intentOf(job = {}) { return _norm(job.intent || job.command); }
/** the repo a job is for: its agentId names it (repo agents are '<repo>…') unless the job says */
function repoOf(job = {}) { return _norm(job.repo || job.agentId); }

/**
 * match(rule, job) — null when the rule does not apply, else its specificity (how many fields it named and matched).
 * A field the rule leaves empty matches anything; a list matches any of its values; '*' matches anything.
 */
function match(rule, job) {
  if (!rule || rule.enabled === false) return null;
  if (_norm(rule.provider) !== _norm(job.provider)) return null;
  const facts = { hat: _norm(job.hat), intent: intentOf(job), repo: repoOf(job) };
  let named = 0;
  for (const f of MATCH_FIELDS) {
    const want = rule[f];
    if (want == null || want === '' || want === '*' || (Array.isArray(want) && !want.length)) continue;
    const list = (Array.isArray(want) ? want : [want]).map(_norm);
    if (!facts[f] || !list.includes(facts[f])) return null;
    named++;
  }
  return named;
}

/** pick(rules, job) — the winning rule: most specific, then highest priority, then newest */
function pick(rules, job) {
  let best = null;
  for (const r of rules) {
    const s = match(r, job);
    if (s == null) continue;
    const key = [s, Number(r.priority) || 0, r.updatedAt || 0];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))) best = { rule: r, key };
  }
  return best ? best.rule : null;
}

function createAccountRouting({ dir = process.env.GUARDIAN_ACCOUNTS_DIR || require('../../lib/data-home.js').home('guardian', 'accounts'), store = null, now = Date.now } = {}) {
  let _st = store;
  const st = () => {
    if (_st) return _st;
    const { JaaStore } = require('../jaa-store.js');
    _st = new JaaStore(path.join(dir, 'jaa'), { tables: [T_RULES, T_LOG, T_EXH], settings: false });
    return _st;
  };

  function rules({ provider } = {}) {
    const all = st().all(T_RULES, provider ? { provider: _norm(provider) } : undefined, { orderBy: 'updatedAt', order: 'DESC' });
    return all;
  }

  /** setRule({ id?, provider, account, hat?, intent?, repo?, priority?, label?, enabled? }) — add or change one rule */
  function setRule(r = {}) {
    const provider = _norm(r.provider), account = r.account == null ? '' : String(r.account).trim();
    if (!provider) return { ok: false, error: 'provider required' };
    if (!account) return { ok: false, error: 'account required — the Clear Glass account id this rule routes to' };
    const clean = (v) => (Array.isArray(v) ? v.map(_norm).filter(Boolean) : _norm(v));
    const named = MATCH_FIELDS.filter(f => { const v = clean(r[f]); return v && (!Array.isArray(v) || v.length) && v !== '*'; });
    const row = { id: r.id || `rule-${crypto.randomBytes(4).toString('hex')}`, provider, account,
      hat: clean(r.hat) || null, intent: clean(r.intent) || null, repo: clean(r.repo) || null,
      priority: Number(r.priority) || 0, label: r.label ? String(r.label).slice(0, 120) : null,
      enabled: r.enabled !== false, specificity: named.length, updatedAt: now() };
    st().upsert(T_RULES, row); st().flushAll();
    return { ok: true, rule: row };
  }
  function removeRule(id) {
    const n = st().delete(T_RULES, { id: String(id) }); st().flushAll();
    return { ok: true, removed: n || 0 };
  }

  /**
   * route(job, { log }) -> { accountId, why, rule } | null
   * null: no rule applies and the job names no account — the tab runs as it is signed in.
   */
  function route(job = {}, { log = true } = {}) {
    if (!job || !job.provider) return null;
    const rule = pick(rules({ provider: job.provider }), job);
    let out = null;
    if (rule) {
      const said = MATCH_FIELDS.filter(f => rule[f]).map(f => `${f} ${Array.isArray(rule[f]) ? rule[f].join('|') : rule[f]}`);
      out = { accountId: rule.account, rule: rule.id, why: said.length ? `rule ${rule.label || rule.id}: ${said.join(', ')}` : `rule ${rule.label || rule.id}: every ${job.provider} job` };
      if (job.accountId && job.accountId !== rule.account) out = { accountId: job.accountId, rule: null, why: `the job names account ${job.accountId} (rule ${rule.id} would have chosen ${rule.account})` };
    } else if (job.accountId) out = { accountId: job.accountId, rule: null, why: 'the job names its account' };
    if (out && log) {
      try {
        st().insert(T_LOG, { id: `${now()}-${crypto.randomBytes(3).toString('hex')}`, at: now(), jobId: job.id || null, provider: _norm(job.provider),
          hat: _norm(job.hat), intent: intentOf(job), repo: repoOf(job), account: out.accountId, rule: out.rule, why: out.why });
        const n = st().count(T_LOG);
        if (n > LOG_KEEP) for (const old of st().all(T_LOG, undefined, { orderBy: 'at', order: 'ASC', limit: n - LOG_KEEP })) st().delete(T_LOG, { id: old.id });
      } catch (_) { /* the log never stops a route */ }
    }
    return out;
  }
  // 0.60.25 — James: "i have like 9 or 12 accounts, and i would love to be able to add them to clearglass and use routing
  // each time tokens run out. like account routing and fallback chaining" · "check the accounts, account routing, fallback
  // routing." The chain is a provider's every-job rules (no hat/intent/repo), highest priority first. An account whose
  // tab reported its usage limit is exhausted until it resets (REST_MS, 5 h unless said); route() skips it and says so,
  // and when every account in the chain is spent, route() says that — the dispatcher fails the job as a rate limit so the
  // ladder moves on to the next agent instead of typing into a spent account.
  const REST_MS = Number(process.env.GUARDIAN_ACCOUNT_REST_MS) || 5 * 3600 * 1000;
  const _current = new Map(), _switchedAt = new Map();
  function chain(provider) {
    const seen = new Set();
    return rules({ provider }).filter(r => r.enabled !== false && !r.specificity).sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.updatedAt || 0) - (b.updatedAt || 0))
      .map(r => r.account).filter(a => !seen.has(a) && seen.add(a));
  }
  function exhausted(provider) {
    const t = now();
    return st().all(T_EXH, { provider: _norm(provider) }).filter(r => (r.until || 0) > t);
  }
  function isExhausted(provider, account) { return exhausted(provider).find(r => r.account === account) || null; }
  function markExhausted(provider, account, { until = null, why = null } = {}) {
    if (!provider || !account) return { ok: false, error: 'provider and account required' };
    const row = { id: `${_norm(provider)}:${account}`, provider: _norm(provider), account, at: now(), until: until || now() + REST_MS, why: why ? String(why).slice(0, 200) : 'its tab reported the usage limit' };
    st().upsert(T_EXH, row); st().flushAll();
    return { ok: true, exhausted: row };
  }
  function clearExhausted(provider, account) { const n = st().delete(T_EXH, account ? { id: `${_norm(provider)}:${account}` } : { provider: _norm(provider) }); st().flushAll(); return { ok: true, cleared: n || 0 }; }
  function current(provider) { return _current.get(_norm(provider)) || null; }
  function noteSwitched(provider, account) { _current.set(_norm(provider), account); _switchedAt.set(_norm(provider), now()); }
  function switchedAt(provider) { return _switchedAt.get(_norm(provider)) || 0; }
  /** fallback(job, out) — out's account at its limit (or none, with a chain): the next account in the chain that is not */
  function fallback(job, out) {
    const c = chain(job.provider);
    const want = out ? out.accountId : (current(job.provider) || null);
    const spent = want ? isExhausted(job.provider, want) : null;
    if (!spent && out) return out;
    if (!spent && !out) return null;
    const next = c.find(a => a !== want && !isExhausted(job.provider, a));
    const when = new Date(spent.until).toISOString().slice(11, 16);
    if (!next) return { accountId: null, exhaustedAll: true, why: `every ${job.provider} account in the chain is at its limit (${[...new Set([want, ...c])].join(', ')}); ${want} until ${when} UTC` };
    return { accountId: next, rule: null, fallback: true, why: `fallback: ${want} is at its limit until ${when} UTC (${spent.why}) — the next account in the chain` };
  }

  function log({ provider, limit = 50 } = {}) {
    return st().all(T_LOG, provider ? { provider: _norm(provider) } : undefined, { orderBy: 'at', order: 'DESC', limit });
  }
  function flush() { try { st().flushAll(); } catch (_) {} }

  return { MODULE_ID, VERSION, rules, setRule, removeRule, route, log, flush, chain, exhausted, isExhausted, markExhausted, clearExhausted, current, noteSwitched, switchedAt, fallback };
}

/**
 * cgUseAccount(provider, accountId, job) — Clear Glass switches the provider's tab to the account (POST
 * :7702/providers/:id/account). -> { ok, switched, error? }. switched false: the tab was that account already.
 */
function cgUseAccount(provider, accountId, job = {}, { port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), timeoutMs = 60000 } = {}) {
  const http = require('http');
  return new Promise((resolve) => {
    const data = JSON.stringify({ accountId, jobId: job.id || null, why: job.accountWhy || null });
    const req = http.request({ host: '127.0.0.1', port, path: `/providers/${encodeURIComponent(provider)}/account`, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = ''; res.on('data', (c) => { raw += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (_) {} resolve(j && typeof j === 'object' ? { ...j, ok: res.statusCode < 400 && j.ok !== false } : { ok: false, error: `Clear Glass answered ${res.statusCode}` }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: `Clear Glass unreachable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no answer in ${timeoutMs} ms` }); });
    req.write(data); req.end();
  });
}

/** cgStartProvider(provider) — 0.60.25: Clear Glass opens the provider's tab (POST :7702/providers/:id/start), hidden */
function cgStartProvider(provider, { port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), timeoutMs = 30000 } = {}) {
  const http = require('http');
  return new Promise((resolve) => {
    const data = JSON.stringify({ show: false });
    const req = http.request({ host: '127.0.0.1', port, path: `/providers/${encodeURIComponent(provider)}/start`, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => { let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body: raw.slice(0, 300) })); });
    req.on('error', (e) => resolve({ ok: false, error: `Clear Glass unreachable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no answer in ${timeoutMs} ms` }); });
    req.write(data); req.end();
  });
}

/** cgOpenProfile(provider, accountId) — §PF1 0.60.32: Clear Glass opens the account's own tab (POST :7702/providers/:id/profile)
 *  in its own session, signed in from the vault -> { ok, tabId, error? } */
function cgOpenProfile(provider, accountId, job = {}, { port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), timeoutMs = 60000 } = {}) {
  const http = require('http');
  return new Promise((resolve) => {
    const data = JSON.stringify({ accountId, jobId: (job && job.id) || null });
    const req = http.request({ host: '127.0.0.1', port, path: `/providers/${encodeURIComponent(provider)}/profile`, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = ''; res.on('data', (c) => { raw += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (_) {} resolve(j && typeof j === 'object' ? { ...j, ok: res.statusCode < 400 && j.ok !== false } : { ok: false, error: `Clear Glass answered ${res.statusCode}` }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: `Clear Glass unreachable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no answer in ${timeoutMs} ms` }); });
    req.write(data); req.end();
  });
}

let _one = null;
/** routing() — the process-wide instance (guardian/server.js and the dispatcher share it) */
function routing() { return _one || (_one = createAccountRouting()); }

module.exports = { MODULE_ID, VERSION, MATCH_FIELDS, intentOf, repoOf, match, pick, createAccountRouting, routing, cgUseAccount, cgStartProvider, cgOpenProfile };
