'use strict';
/**
 * clear-glass/src/site-settings/profile.js — one site's settings for every feature, through one resolver (SP1, 0.60.215).
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-RESOLVER · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP1
 *
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * createSiteProfile({ store, options, net }) → {
 *   siteProfile(url)  → { origin, autofill, macros, workflows, passwords, network, resume, driver, mesh, guardian, from }
 *                       each value: the site's (the per-origin store), else the global option where one exists, else the key's default;
 *                       from['driver.navTimeoutMs'] says which ('site' | 'global' | 'default')
 *   setSite(url, key, value, { by }) → { ok, value } | { ok:false, why }      validated against keys.js
 *   clearSite(url, key)               → { ok }
 *   netRoute(url) / setNetRoute(url, via) — the network route is a netPolicy rule `site.<host>` matching the host (SP-003): one rule per site,
 *                       replaced on a change, removed on 'default'; the policy's own addRule refuses a collision, and that is said
 * }
 * store: SiteSettingsStore (get/set/deleteKey by url); options: { get() }; net: the net service (policy(), addRoute, removeRoute) — each optional,
 * so a missing one reads as "no value" and is said in `missing`.
 */
const K = require('./keys.js');

const ROUTES = Object.freeze(['default', 'direct', 'transport', 'block']);
function originOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}` : null; } catch (_) { return null; } }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (_) { return null; } }
const ruleId = (host) => `site.${host}`.replace(/[^\w.-]/g, '-').slice(0, 60);
const pathGet = (o, p) => p.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

function createSiteProfile({ store = null, options = null, net = null, emit = null } = {}) {
  const missing = [!store && 'site-settings store', !net && 'network policy'].filter(Boolean);

  function netRoute(url) {
    const host = hostOf(url);
    if (!host || !net) return { via: 'default', rule: null };
    const rules = ((net.policy && net.policy()) || {}).rules || [];
    const r = rules.find(x => x.id === ruleId(host));
    return r ? { via: r.via, rule: r.id } : { via: 'default', rule: null };
  }

  function siteProfile(url) {
    const origin = originOf(url);
    const opts = (options && typeof options.get === 'function' && options.get()) || {};
    const out = { origin, from: {}, ...(missing.length ? { missing } : {}) };
    for (const f of K.FEATURES) out[f] = {};
    for (const k of K.KEYS) {
      const name = k.key.split('.')[1];
      const site = origin && store ? store.get(url, k.key) : undefined;
      const glob = k.global ? pathGet(opts, k.global) : undefined;
      if (site !== undefined) { out[k.feature][name] = site; out.from[k.key] = 'site'; }
      else if (glob !== undefined) { out[k.feature][name] = glob; out.from[k.key] = 'global'; }
      else { out[k.feature][name] = Array.isArray(k.default) ? [...k.default] : k.default; out.from[k.key] = 'default'; }
    }
    out.network = netRoute(url);
    out.from['network.via'] = out.network.rule ? 'site' : 'default';
    return out;
  }

  function setSite(url, key, value, { by = 'person' } = {}) {
    if (key === 'network.via') return setNetRoute(url, value, { by });
    const origin = originOf(url);
    if (!origin) return { ok: false, why: `no site to set: ${JSON.stringify(url)} is not an http(s) page` };
    if (!store) return { ok: false, why: 'the site-settings store is not available' };
    const v = K.validate(key, value);
    if (!v.ok) return v;
    store.set(url, key, v.value);
    if (emit) { try { emit('site-profile.changed', { origin, key, value: v.value, by }); } catch (_) {} }
    return { ok: true, origin, key, value: v.value };
  }

  function clearSite(url, key) {
    if (key === 'network.via') return setNetRoute(url, 'default');
    const origin = originOf(url);
    if (!origin || !store) return { ok: false, why: !origin ? 'not an http(s) page' : 'the site-settings store is not available' };
    if (!K.get(key)) return { ok: false, why: K.validate(key, null).why };
    store.deleteKey(url, key);
    if (emit) { try { emit('site-profile.changed', { origin, key, value: null, by: 'person' }); } catch (_) {} }
    return { ok: true, origin, key };
  }

  function setNetRoute(url, via, { by = 'person' } = {}) {
    const host = hostOf(url);
    if (!host || !originOf(url)) return { ok: false, why: 'not an http(s) page' };
    if (!ROUTES.includes(via)) return { ok: false, why: `the route is one of ${ROUTES.join(', ')} (got ${JSON.stringify(via)})` };
    if (!net) return { ok: false, why: 'the network policy is not available' };
    const id = ruleId(host);
    const pol = net.policy() || {};
    const old = (pol.rules || []).find(r => r.id === id) || null;
    if (via !== 'default') {
      // checked first, on a copy, by the policy's own addRule: a refused route changes nothing (the site keeps the route it had)
      const Policy = require('../net/policy.js');
      const trial = Policy.addRule({ ...pol, rules: (pol.rules || []).filter(r => r.id !== id) }, { id, match: { origin: host }, via, note: `Site settings (${by})` });
      if (!trial.ok) return { ok: false, why: trial.error || 'the network policy refused the rule', kept: old ? old.via : 'default' };
    }
    if (old) { const rm = net.removeRoute(id); if (rm && rm.ok === false) return { ok: false, why: rm.error || 'the old rule was not removed' }; }
    if (via === 'default') return { ok: true, host, via, removed: !!old };
    const r = net.addRoute({ id, match: { origin: host }, via, note: `Site settings (${by})` });
    if (!r || r.ok === false) return { ok: false, why: (r && r.error) || 'the network policy refused the rule' };
    if (emit) { try { emit('site-profile.changed', { origin: originOf(url), key: 'network.via', value: via, by }); } catch (_) {} }
    return { ok: true, host, via, rule: id };
  }

  return { siteProfile, setSite, clearSite, netRoute, setNetRoute, KEYS: K.KEYS, FEATURES: K.FEATURES };
}

module.exports = { createSiteProfile, originOf, ruleId, ROUTES };
