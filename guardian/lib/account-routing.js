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
 * Storage: a JaaStore (guardian/jaa-store.js) under data/guardian/accounts/jaa — tables account_rules and
 * account_route_log. No cookie or secret is ever stored here: only which account, and why.
 */
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'guardian.account-routing';
const VERSION = '1.0.0';
const T_RULES = 'account_rules', T_LOG = 'account_route_log';
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

function createAccountRouting({ dir = process.env.GUARDIAN_ACCOUNTS_DIR || path.join(__dirname, '../../data/guardian/accounts'), store = null, now = Date.now } = {}) {
  let _st = store;
  const st = () => {
    if (_st) return _st;
    const { JaaStore } = require('../jaa-store.js');
    _st = new JaaStore(path.join(dir, 'jaa'), { tables: [T_RULES, T_LOG], settings: false });
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
  function log({ provider, limit = 50 } = {}) {
    return st().all(T_LOG, provider ? { provider: _norm(provider) } : undefined, { orderBy: 'at', order: 'DESC', limit });
  }
  function flush() { try { st().flushAll(); } catch (_) {} }

  return { MODULE_ID, VERSION, rules, setRule, removeRule, route, log, flush };
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

let _one = null;
/** routing() — the process-wide instance (guardian/server.js and the dispatcher share it) */
function routing() { return _one || (_one = createAccountRouting()); }

module.exports = { MODULE_ID, VERSION, MATCH_FIELDS, intentOf, repoOf, match, pick, createAccountRouting, routing, cgUseAccount };
