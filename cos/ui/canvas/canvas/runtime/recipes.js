/* ERAVOS runtime — recipes.js → window.Recipes
 * Executes recipe specs (Kernel Layer 7): mount | wire | configure | event | wait, plus ops domains add
 * with Recipes.defineOp(name, (step, {K, alias}) => …)
 * Genomes (Layer 6) + recipes are data (data/recipes.js registers them). Recipes act like a user:
 * they only spawn organisms, register kernel wires and publish ui:* events (K-3). */
(function (global) {
  'use strict';
  const recipes = new Map(), genomes = new Map(), ops = new Map(), beforeRun = [];

  function resolve(v, alias) {
    if (typeof v === 'string' && v[0] === '@') { const k = v.slice(1); return alias[k] !== undefined ? alias[k] : v; }
    if (Array.isArray(v)) return v.map(x => resolve(x, alias));
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = resolve(v[k], alias); }); return o; }
    return v;
  }

  async function run(id, o) {
    o = o || {};
    const K = o.K || global.Kernel;
    const r = recipes.get(id);
    if (!r) { K.fault('MOUNT_005', { message: `recipe ${id} not found` }); return null; }
    const alias = Object.assign({}, o.alias || {});
    const origin = o.origin || { x: 40, y: 40 };
    const report = { recipe: id, mounted: [], wires: [], faults: [] };
    // P41 catalog: a recipe that mounts tools this canvas has not installed installs them first and names them — before,
    // it opened with those parts silently missing (one tool was in 183 of 186 generated recipes)
    if (global.Catalog) {
      const got = await global.Catalog.ensure(needs(r), K);
      if (got.length && global.Shell && !o.headless) global.Shell.toast(`This uses ${got.length} tool${got.length > 1 ? 's' : ''} you hadn’t installed — installed: ${got.join(', ')}`, 'good', 6000);
    }
    beforeRun.forEach(fn => { try { fn(r, { K }); } catch (e) { K.fault('RUNTIME_003', { message: `recipe ${id}: before-run: ${e.message}` }); } });
    K.bus.publish('recipe:start', { recipe_id: id });
    const f0 = K.faults.list().length;
    K.ledger.write('recipe_started', { recipe_id: id });
    if (o.clear) global.OrganismFactory.clearAll(K);
    // 3.37 (QA: a big recipe froze the page 0.4–2.9 s): the runner yields a frame after each window it opens and reports
    // progress, so a big recipe never freezes the canvas in one block (headless runs don't yield)
    const total = r.steps.length; let done = 0;
    const breathe = () => (o.headless || !global.document || global.document.hidden) ? null : new Promise(res => setTimeout(res, 0));
    for (const s of r.steps) {
      done++;
      const st = resolve(s, alias);
      switch (st.op) {
        case 'mount': {
          const existing = st.reuse ? K.registry.byOrganism(st.organism)[0] : null;
          if (existing) { alias[st.as] = existing.instance_id; break; }
          const inst = global.OrganismFactory.spawn(st.organism, Object.assign({ K, headless: o.headless },
            st.at ? { x: origin.x + st.at[0], y: origin.y + st.at[1] } : {}, st.size ? { w: st.size[0], h: st.size[1] } : {}));
          if (inst) { alias[st.as || st.organism] = inst; report.mounted.push(inst); if (st.preset) K.bus.publish('ui:preset_load:' + inst, { name: st.preset }); }
          K.bus.publish('recipe:progress', { recipe_id: id, done, total });
          { const b = breathe(); if (b) await b; }
          break;
        }
        case 'configure': {
          const inst = alias[st.target] || st.target;
          Object.keys(st.params || {}).forEach(k => K.bus.publish('ui:config_change:' + inst, { key: k, value: st.params[k] }));
          break;
        }
        case 'event': {
          const inst = alias[st.target] || st.target;
          K.bus.publish(st.global ? st.topic : ('ui:' + st.topic + ':' + inst), st.payload || {});
          break;
        }
        case 'wire': {
          const src = { instanceId: alias[st.from[0]] || st.from[0], hookId: st.from[1] };
          const dst = { instanceId: alias[st.to[0]] || st.to[0], hookId: st.to[1] };
          const w = K.wires.register({ src, dst });
          if (w.ok) report.wires.push(w.wire_id);
          break;
        }
        case 'wait': await new Promise(res => setTimeout(res, st.ms || 0)); break;
        default:
          if (ops.has(st.op)) { try { await ops.get(st.op)(st, { K, alias }); } catch (e) { K.fault('RUNTIME_003', { message: `recipe ${id}: op ${st.op}: ${e.message}` }); } }
          else K.fault('MUTATION_002', { message: `recipe ${id}: unknown op ${st.op}` });
      }
    }
    report.faults = K.faults.list().slice(f0);
    report.alias = alias;
    K.ledger.write('recipe_finished', { recipe_id: id, mounted: report.mounted.length, wires: report.wires.length, faults: report.faults.length });
    K.bus.publish('recipe:done', { recipe_id: id, alias });
    return report;
  }

  // P13 — the canvas expands with packs: a recipe is offered only when every organism it mounts is installed
  function needs(r) { return Array.from(new Set((r.steps || []).filter(s => s && s.op === 'mount' && s.organism).map(s => s.organism))); }
  // …or the catalog offers it: running the recipe installs it (P41) — recipes no longer vanish from Start on a fresh profile
  const offered = (id) => !!(global.Catalog && global.Catalog.meta(id) && !global.Catalog.isRemoved(id));
  function available(r) { return !!global.OrganismFactory && needs(r).every(id => !!global.OrganismFactory.def(id) || offered(id)); }
  global.Recipes = {
    needs, available,
    all: () => Array.from(recipes.values()),
    register(r) { recipes.set(r.id, r); if (r.genome && r.genomeDef) genomes.set(r.genome, r.genomeDef); },
    registerGenome(g) { genomes.set(g.id, g); },
    get: (id) => recipes.get(id) || null,
    list: () => Array.from(recipes.values()).filter(available),
    genomes: () => Array.from(genomes.values()),
    genome: (id) => genomes.get(id) || null,
    run, resolve,
    defineOp(name, fn) { ops.set(name, fn); },
    onBeforeRun(fn) { beforeRun.push(fn); },
    featured: () => Array.from(recipes.values()).filter(r => r.featured && available(r)),
    attach(K) { // any organism or the shell can ask: recipe:run {recipe_id} or {organism}
      K.bus.subscribe('recipe:run', (p) => { if (!p) return; if (p.recipe_id) run(p.recipe_id, { K, origin: p.origin && typeof p.origin.x === 'number' ? p.origin : undefined }); else if (p.organism) global.OrganismFactory.spawn(p.organism, { K }); }, 'recipes');
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
