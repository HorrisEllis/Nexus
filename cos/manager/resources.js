'use strict';
/**
 * cos/manager/resources.js — each compartment's caps, set by layer and read back from the OS; its account of what it used; and what COS does
 * under pressure (CP6a, 0.60.356). Spec: cos/spec/compartment.spec MOD-CP-RESOURCES (built for cos-manager.spec MOD-MG-RESOURCES; MG4 superseded
 * by CP6) · Map: docs/2026-11-01-the-compartment-phasemap.spec CP6a_caps_priority_accounting, CP_D6.
 *
 * James, 2026-11-01: "then i want resource management for each cos compartment". Before it, the same day: "once each system is in cos, we can
 * have resource management per system." His boot logs that day: free memory down to 0.2%, cortex's memory_pressure in FAILURE_MODE, Ollama's
 * GPU out of memory.
 *
 * What the OS does, and what it cannot (CP_D6, said on every reading, CP-003):
 *   heap      V8's --max-old-space-size at spawn (node). Enforced at spawn; a change waits for the next start (pending). Electron: not-enforced.
 *   priority  os.setPriority(pid) at spawn and on change, read back with os.getPriority(pid). Enforced, or failed with the OS's error.
 *   rss       no hard cap without a native job object: COS watches resident memory each sample; over rssLimitMB it writes 'over-limit' and,
 *             when onOver is restart, restarts it by rule:resources. Watched.
 *   cpuShare  not-enforced: no CPU-share cap without a job object (Windows) or cgroups (Linux); the priority is what the OS gives.
 * Under the halt floor COS stops nothing by itself: it holds one proposal (rule:resources) to stop the lowest-priority, largest non-critical
 * compartment, for him to take or drop. Layers: default (the supervisor's policy) → declared (compartment.json runtime.process.resources,
 * maxOldSpaceMB) → his (cos/data/manager/caps.json, COS's own).
 *
 * Balance (CP6f, 2026-11-05; James: "build the load balancer" · his reading, asked side by side: "Balance the machine"): under pressure
 * (free memory under policy.balanceMemPct, default 15%, above the halt floor; or the compartments' CPU together over policy.balanceCpuPct of
 * the cores, default 85%), the heaviest non-critical compartment running at normal is lowered one step, to below-normal: RAID approves it by
 * rule (CP6b), the ledger says it, the OS reads it back. One act per sample. With the pressure gone (hysteresis: +5% memory, −15% CPU) each
 * one is put back, RAID-approved too. Never touched: a critical system, a priority he set above normal, one he changes while it is balanced
 * (his call wins and the balance lets go). policy.balance false turns it off. What it cannot do, said: a lower priority frees no memory;
 * under memory pressure it gives the others the CPU first, and the halt floor's proposal (above) stays the act that frees memory.
 *
 *   createResources(sup, { root, store, sampleMs, read, setPriority, getPriority, proposals, ring, approve }) →   approve: RAID's gate (CP6b; default lib/raid-port.js)
 *     { caps(name), setCaps(name, patch, { by }), all(), sample(), history(name), spawned(name, pid), heapMB(decl), balance(), stop() }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRIORITIES = Object.freeze({ high: os.constants.priority.PRIORITY_HIGH, 'above-normal': os.constants.priority.PRIORITY_ABOVE_NORMAL,
  normal: os.constants.priority.PRIORITY_NORMAL, 'below-normal': os.constants.priority.PRIORITY_BELOW_NORMAL, low: os.constants.priority.PRIORITY_LOW });
const RANK = ['low', 'below-normal', 'normal', 'above-normal', 'high'];
const nameOf = (n) => { let best = 'normal', d = Infinity; for (const [k, v] of Object.entries(PRIORITIES)) if (Math.abs(v - n) < d) { d = Math.abs(v - n); best = k; } return best; };
const KEYS = { heapMB: [64, 16384], rssLimitMB: [64, 65536] };
const BALANCE = Object.freeze({ balance: true, balanceMemPct: 0.15, balanceCpuPct: 0.85 });   // CP6f's defaults; the policy overrides each

function validate(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null && k !== 'rssLimitMB' && ['heapMB', 'onOver', 'priority'].includes(k)) { out[k] = null; continue; }   // SC2: null drops his layer (the declared value again)
    if (k === 'heapMB' || k === 'rssLimitMB') {
      if (v === null && k === 'rssLimitMB') { out[k] = null; continue; }
      const n = Number(v), [lo, hi] = KEYS[k];
      if (!Number.isFinite(n) || n < lo || n > hi) throw Object.assign(new Error(`${k} must be ${lo}–${hi} MB${k === 'rssLimitMB' ? ' or null (no limit)' : ''}, got ${JSON.stringify(v)}`), { code: 400 });
      out[k] = Math.round(n);
    } else if (k === 'onOver') {
      if (!['warn', 'restart'].includes(v)) throw Object.assign(new Error(`onOver is warn or restart, got ${JSON.stringify(v)}`), { code: 400 });
      out[k] = v;
    } else if (k === 'priority') {
      if (!PRIORITIES[v] && PRIORITIES[v] !== 0) throw Object.assign(new Error(`priority is one of ${Object.keys(PRIORITIES).join(', ')}, got ${JSON.stringify(v)}`), { code: 400 });
      out[k] = v;
    } else throw Object.assign(new Error(`no cap "${k}": heapMB, rssLimitMB, onOver, priority`), { code: 400 });
  }
  return out;
}

function createResources(sup, { root = sup.root, store = null, sampleMs = 30000, read = null, setPriority = os.setPriority, getPriority = os.getPriority,
  proposals = null, ring = 120, approve = null } = {}) {
  // 2026-11-01 CP6b — James: "cos backend, and hooking into idearium and raid. cos resource manager per compartment". An act COS takes by rule
  // on a compartment is RAID's to approve (§9.1 the only write authority for the system's own decisions, §5.2): lib/raid-port.js approveTool,
  // which fails closed (RAID unreachable → not approved). A proposal held for him stays his (USER_AUTONOMY): RAID gates rules, not him.
  const askRaid = approve || ((command, opts) => require('../../lib/raid-port.js').approveTool('cos', command, opts));
  const FILE = store || path.join(process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager'), 'caps.json');
  const reader = read || require('./usage.js').readAsync;
  let his = {}; try { his = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) {}
  const applied = new Map();   // name → { heap, priority, rss, cpuShare }
  const runs = new Map();      // name → { pid, heapMB, over: false }
  const hist = new Map();      // name → UsageSample[]
  let incident = null;         // the open pressure incident: { since, proposal }
  const balanced = new Map();  // CP6f: name → { from, to, kind, at, why } — a priority lowered by the balance, to be put back

  const declOf = (name) => { const d = sup.declarations().find(x => x.name === name); if (!d) throw Object.assign(new Error(`no system "${name}" is declared`), { code: 404 }); return d; };
  const isNode = (d) => /(^|[\\/])node(\.exe)?$/i.test(String(d.cmd || 'node'));

  function caps(name) {
    const d = declOf(name), P = sup.policy(), dr = d.resources || {};
    const def = { heapMB: P.maxOldSpaceMB, rssLimitMB: null, onOver: 'warn', priority: 'normal' };
    const decl = { ...(d.maxOldSpaceMB ? { heapMB: d.maxOldSpaceMB } : {}), ...dr };
    const mine = his[name] || {};
    const c = {}, layers = {};
    for (const k of Object.keys(def)) { if (k in mine) { c[k] = mine[k]; layers[k] = 'his'; } else if (k in decl) { c[k] = decl[k]; layers[k] = 'declared'; } else { c[k] = def[k]; layers[k] = 'default'; } }
    const run = runs.get(name) || null, v = sup.get(name), a = applied.get(name) || {};
    const heap = !isNode(d) ? { state: 'not-enforced', why: 'not a Node process: no --max-old-space-size on its command line' }
      : !v.pid ? { state: 'pending', why: 'not running: applies at its next start' }
      : run && run.heapMB === c.heapMB ? { state: 'enforced', readBack: run.heapMB, why: 'on its command line at spawn' }
      : { state: 'pending', readBack: run ? run.heapMB : null, why: `it runs with ${run ? run.heapMB : '?'} MB; ${c.heapMB} MB applies at its next start` };
    const priority0 = !v.pid ? { state: 'pending', why: 'not running: applies at its next start' } : (a.priority || { state: 'pending', why: 'not applied yet' });
    const bal = balanced.get(name);
    const priority = bal ? { ...priority0, balanced: { from: bal.from, to: bal.to, kind: bal.kind, since: bal.at, why: bal.why } } : priority0;
    const rss = c.rssLimitMB == null ? { state: 'none', why: 'no limit set' } : { state: 'watched', why: `COS reads it every ${Math.round(sampleMs / 1000)} s and ${c.onOver === 'restart' ? 'restarts it' : 'says so'} over ${c.rssLimitMB} MB; the OS does not cap it` };
    return { name, ...c, layers, applied: { heap, priority, rss, cpuShare: { state: 'not-enforced', why: 'no CPU-share cap without a job object (Windows) or cgroups; the priority is what the OS gives' } } };
  }

  function applyPriority(name, pid, want) {
    try { setPriority(pid, PRIORITIES[want]); } catch (e) { const r = { state: 'failed', why: `the OS refused ${want} for pid ${pid}: ${e.code || e.message}` }; applied.set(name, { ...(applied.get(name) || {}), priority: r }); return r; }
    let got = null; try { got = getPriority(pid); } catch (e) { const r = { state: 'failed', why: `set, but not read back: ${e.code || e.message}` }; applied.set(name, { ...(applied.get(name) || {}), priority: r }); return r; }
    const r = nameOf(got) === want ? { state: 'enforced', readBack: nameOf(got), raw: got, pid } : { state: 'failed', readBack: nameOf(got), raw: got, pid, why: `asked ${want}, the OS reads ${nameOf(got)}` };
    applied.set(name, { ...(applied.get(name) || {}), priority: r });
    return r;
  }

  function setCaps(name, patch, { by } = {}) {
    if (!by) throw Object.assign(new Error('say who acts: { "by": "person" | "rule:<id>" }'), { code: 400 });
    if (/^agent:/.test(String(by))) throw Object.assign(new Error('an agent proposes; a cap is set by a person or a rule (CP-005)'), { code: 403 });
    const before = caps(name), ok = validate(patch);
    his[name] = { ...(his[name] || {}), ...ok };
    for (const k of Object.keys(ok)) if (ok[k] === null && k !== 'rssLimitMB') delete his[name][k];
    if (!sup.note('caps', `${Object.entries(ok).map(([k, v]) => `${k} ${before[k]} → ${v}`).join(', ')}`, { by, system: name })) throw new Error('the ledger cannot be written: nothing changed');
    fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(his, null, 2));
    const v = sup.get(name);
    if ('priority' in ok && balanced.has(name)) { balanced.delete(name); sup.note('balance-released', `${name}: his priority wins; the balance lets go of it`, { by, system: name }); }
    if ('priority' in ok && v.pid) applyPriority(name, v.pid, ok.priority == null ? caps(name).priority : ok.priority);
    if ('rssLimitMB' in ok || 'onOver' in ok) { const r = runs.get(name); if (r) r.over = false; }
    try { require('../../lib/versionium-record.js').record({ kind: 'cos.caps', system: name, by, message: `COS: ${name}'s caps — ${Object.keys(ok).join(', ')}`, change: { before: Object.fromEntries(Object.keys(ok).map(k => [k, before[k]])), after: ok } }).catch(() => {}); } catch (_) {}
    return caps(name);
  }

  function spawned(name, pid) {   // the supervisor's hook: each spawn gets its heap remembered and its priority applied
    const c = caps(name);
    runs.set(name, { pid, heapMB: isNode(declOf(name)) ? c.heapMB : null, over: false });
    applyPriority(name, pid, c.priority);
  }
  const heapMB = (d) => { try { return caps(d.name).heapMB; } catch (_) { return null; } };

  async function sample() {
    const list = sup.list(), P = sup.policy();
    const u = await reader(list, P);
    for (const v of list) {
      const r = u.systems[v.name] || {};
      if (!hist.has(v.name)) hist.set(v.name, []);
      const h = hist.get(v.name), prev = h[h.length - 1];
      const s = { at: u.at, pid: v.pid || null, rssMB: r.rssMB ?? null, cpuSec: r.cpuSec ?? null, reader: r.reader || null, ...(r.notRead ? { notRead: r.notRead } : {}) };
      s.cpuPct = r.cpuPct != null ? r.cpuPct : prev && prev.pid === s.pid && prev.cpuSec != null && s.cpuSec != null && s.at > prev.at ? Math.round((s.cpuSec - prev.cpuSec) / ((s.at - prev.at) / 1000) * 1000) / 10 : null;
      if (!v.pid && prev && !prev.pid) continue;   // not running and not running before: nothing new to keep
      h.push(s); if (h.length > ring) h.shift();
      const run = runs.get(v.name);
      if (v.pid && s.rssMB != null && run && run.pid === v.pid) {
        const c = caps(v.name);
        if (c.rssLimitMB != null && s.rssMB > c.rssLimitMB && !run.over) {
          run.over = true;
          sup.note('over-limit', `resident ${s.rssMB} MB over its limit ${c.rssLimitMB} MB (${s.reader})${c.onOver === 'restart' ? ' — restarted by rule' : ' — said; onOver is warn'}`, { by: 'rule:resources', system: v.name });
          if (c.onOver === 'restart') {
            let ok = null; try { ok = await askRaid(`cos.restart ${v.name}`, { action: 'restart', intent: { action: 'restart', target: v.name }, causedBy: 'rule:resources', why: `resident ${s.rssMB} MB over ${c.rssLimitMB} MB` }); } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
            if (ok && ok.approved) { sup.note('raid-approved', `RAID approved restarting ${v.name} by rule:resources${ok.reason ? ` (${ok.reason})` : ''}`, { by: 'rule:resources', system: v.name }); try { sup.restart(v.name, { by: 'rule:resources' }); } catch (_) {} }
            else sup.note('raid-refused', `RAID did not approve restarting ${v.name}: ${(ok && ok.reason) || 'no answer'} — not restarted; it stays over its limit, said`, { by: 'rule:resources', system: v.name });
          }
        }
      }
    }
    // pressure: under the halt floor, one held proposal per incident (CP_D6) — never an act of COS's own
    const free = u.host.freeMemPct / 100;
    if (free < P.memoryHaltPct) {
      if (!incident && proposals) {
        const cand = list.filter(v => v.pid && !v.critical).map(v => ({ v, c: caps(v.name), rss: (u.systems[v.name] || {}).rssMB || 0 }))
          .sort((a, b) => RANK.indexOf(a.c.priority) - RANK.indexOf(b.c.priority) || b.rss - a.rss)[0];
        incident = { since: u.at, proposal: null };
        if (cand) { try { incident.proposal = proposals.hold({ by: 'rule:resources', verb: 'stop', target: cand.v.name,
          why: `free memory ${u.host.freeMemPct}% is under the halt floor ${Math.round(P.memoryHaltPct * 100)}%: ${cand.v.name} is the lowest-priority (${cand.c.priority}), largest (${cand.rss} MB) compartment that is not critical. Held for you; COS stops nothing by itself.` }).id; } catch (_) {} }
      }
    } else if (incident && free >= Math.min(0.3, P.memoryHaltPct * 2)) incident = null;   // the incident ends with headroom back (resource-monitor's 30%, capped)
    try { await balanceStep(u, list, P); } catch (e) { sup.note('balance-error', `the balance step failed: ${e.message} — nothing changed`, { by: 'rule:balance' }); }
    last = u;
    return u;
  }
  let last = null;

  // CP6f — balance the machine (his reading, 2026-11-05). Pure reading of the sample; one RAID-approved act per call.
  function pressureOf(u, list, P) {
    const B = { ...BALANCE, ...P }, cores = (u.host && u.host.cpus) || 1;
    const cpuSum = list.reduce((a, v) => a + (((u.systems[v.name] || {}).cpuPct) || 0), 0);
    const freePct = u.host ? u.host.freeMemPct / 100 : 1;
    return { B, cpuSum, cpuCap: B.balanceCpuPct * cores * 100, freePct,
      memory: freePct < B.balanceMemPct, cpu: cpuSum >= B.balanceCpuPct * cores * 100,
      memoryClear: freePct >= B.balanceMemPct + 0.05, cpuClear: cpuSum < (B.balanceCpuPct - 0.15) * cores * 100 };
  }
  async function balanceStep(u, list, P) {
    const pr = pressureOf(u, list, P);
    if (pr.B.balance === false) return null;
    if (pr.memory || pr.cpu) {
      const kind = pr.cpu ? 'cpu' : 'memory';
      const cand = list.filter(v => v.pid && !v.critical && !balanced.has(v.name)).map(v => ({ v, c: caps(v.name), s: u.systems[v.name] || {} }))
        .filter(x => x.c.priority === 'normal')
        .sort((a, b) => kind === 'cpu' ? (b.s.cpuPct || 0) - (a.s.cpuPct || 0) : (b.s.rssMB || 0) - (a.s.rssMB || 0))[0];
      if (!cand) return null;
      const why = kind === 'cpu' ? `the compartments use ${Math.round(pr.cpuSum)}% CPU of ${Math.round(pr.cpuCap)}% allowed: ${cand.v.name} uses the most (${cand.s.cpuPct || 0}%)`
        : `free memory ${u.host.freeMemPct}% is under the balance floor ${Math.round(pr.B.balanceMemPct * 100)}%: ${cand.v.name} is the largest at normal (${cand.s.rssMB || 0} MB)`;
      let ok = null; try { ok = await askRaid(`cos.balance ${cand.v.name}`, { action: 'balance', intent: { action: 'lower-priority', target: cand.v.name, from: 'normal', to: 'below-normal' }, causedBy: 'rule:balance', why }); } catch (_) {}
      if (!(ok && ok.approved)) { sup.note('raid-refused', `RAID did not approve lowering ${cand.v.name} to below-normal: ${(ok && ok.reason) || 'no answer'} — not lowered (${why})`, { by: 'rule:balance', system: cand.v.name }); return { act: 'refused', name: cand.v.name, kind }; }
      const r = applyPriority(cand.v.name, cand.v.pid, 'below-normal');
      if (r.state !== 'enforced') { sup.note('balance-failed', `${cand.v.name}: below-normal not applied — ${r.why || r.state}`, { by: 'rule:balance', system: cand.v.name }); return { act: 'failed', name: cand.v.name, kind }; }
      balanced.set(cand.v.name, { from: 'normal', to: 'below-normal', kind, at: u.at, why });
      sup.note('balanced', `${cand.v.name} normal → below-normal, read back ${r.readBack} (RAID approved): ${why}`, { by: 'rule:balance', system: cand.v.name });
      return { act: 'lowered', name: cand.v.name, kind };
    }
    if (!balanced.size || !(pr.memoryClear && pr.cpuClear)) return null;
    const [name, b] = [...balanced.entries()][0], v = sup.get(name);
    if (!v || !v.pid) { balanced.delete(name); sup.note('balance-released', `${name} is not running: nothing to put back`, { by: 'rule:balance', system: name }); return { act: 'released', name }; }
    let ok = null; try { ok = await askRaid(`cos.balance ${name}`, { action: 'balance', intent: { action: 'restore-priority', target: name, from: b.to, to: b.from }, causedBy: 'rule:balance', why: 'the pressure is gone' }); } catch (_) {}
    if (!(ok && ok.approved)) { sup.note('raid-refused', `RAID did not approve putting ${name} back to ${b.from}: ${(ok && ok.reason) || 'no answer'} — it stays at ${b.to}, said`, { by: 'rule:balance', system: name }); return { act: 'refused', name }; }
    const r = applyPriority(name, v.pid, b.from);
    balanced.delete(name);
    if (r.state !== 'enforced') { sup.note('balance-failed', `${name} not put back to ${b.from}: ${r.why || r.state} (raising a priority can need rights the OS did not give)`, { by: 'rule:balance', system: name }); return { act: 'failed', name }; }
    sup.note('balance-restored', `${name} ${b.to} → ${b.from}, read back ${r.readBack} (RAID approved): the pressure is gone`, { by: 'rule:balance', system: name });
    return { act: 'restored', name };
  }
  function balance() {
    const P = sup.policy(), B = { ...BALANCE, ...P };
    return { on: B.balance !== false, balanceMemPct: B.balanceMemPct, balanceCpuPct: B.balanceCpuPct,
      active: [...balanced.entries()].map(([name, b]) => ({ name, ...b })), pressure: last ? (({ memory, cpu, cpuSum, cpuCap, freePct }) => ({ memory, cpu, cpuSum, cpuCap, freePct }))(pressureOf(last, sup.list(), P)) : null };
  }

  const timer = sampleMs > 0 ? setInterval(() => { sample().catch(() => {}); }, sampleMs) : null; if (timer && timer.unref) timer.unref();

  function history(name) { declOf(name); return (hist.get(name) || []).slice(); }
  function all() {
    return { at: last ? last.at : null, host: last ? last.host : null, reader: last ? last.reader : null, sampleMs, incident, balance: balance(),
      systems: sup.list().map(v => { const h = hist.get(v.name) || [], vals = h.filter(s => s.pid === v.pid && s.rssMB != null);
        const cpu = h.filter(s => s.pid === v.pid && s.cpuPct != null);
        return { name: v.name, state: v.state, pid: v.pid, critical: v.critical, caps: caps(v.name), now: h[h.length - 1] || null,
          account: { samples: vals.length, peakRssMB: vals.length ? Math.max(...vals.map(s => s.rssMB)) : null, avgRssMB: vals.length ? Math.round(vals.reduce((a, s) => a + s.rssMB, 0) / vals.length) : null,
            avgCpuPct: cpu.length ? Math.round(cpu.reduce((a, s) => a + s.cpuPct, 0) / cpu.length * 10) / 10 : null, since: vals.length ? vals[0].at : null } }; }) };
  }

  sup.setHooks({ heapMB, spawned });
  return { caps, setCaps, all, sample, history, spawned, heapMB, balance, stop: () => { if (timer) clearInterval(timer); }, file: FILE, PRIORITIES: Object.keys(PRIORITIES) };
}

module.exports = { createResources, validate, PRIORITIES, BALANCE };
