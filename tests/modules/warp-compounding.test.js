const { unifiedDispatch } = require(require('path').join(__dirname, '..', '..', 'warp/dispatch/index.js'));
const { PopulationStore } = require(require('path').join(__dirname, '..', '..', 'warp/dispatch/population.js'));

function makeCrystallizer() {
  const store = new Map();
  return { store, get: d => store.get(d), set: (d, v) => store.set(d, v) };
}
let generations = 0;
const cascade = async () => { generations++; return { ok: true, output: 'SPEC SECTION CONTENT', cost: 1000 }; };
const scorer  = () => 0.9;                    // above the 0.7 floor
const event   = { type: 'spec.chunk', data: { sectionId: 'purpose', spec: 'my-system' } };

async function run(exactCacheOnFirstSuccess) {
  generations = 0;
  const crystallizer = makeCrystallizer();
  const population   = new PopulationStore();
  const opts = { gateSignature:'sig', gateClass:'spec.chunk', event, axioms:[], crystallizer, population, scorer, cascade, exactCacheOnFirstSuccess };
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await unifiedDispatch({ ...opts }));
  return { generations, sources: results.map(r => r.source), costs: results.map(r => r.cost) };
}

let passed = 0, failed = 0;
const assert = (cond, name) => { if (cond) { passed++; console.log('  \u2713 ' + name); } else { failed++; console.log('  \u2717 ' + name); } };

(async () => {
  console.log('=== BEFORE (current default: off) — identical chunk, 3 builds ===');
  const off = await run(false);
  console.log('  LLM generations:', off.generations, '| sources:', off.sources.join(', '));

  console.log();
  console.log('=== AFTER (exactCacheOnFirstSuccess: true) ===');
  const on = await run(true);
  console.log('  LLM generations:', on.generations, '| sources:', on.sources.join(', '));
  console.log('  costs:', JSON.stringify(on.costs));

  console.log();
  assert(off.generations === 3, 'T-001 default OFF: identical input regenerates 3x (unchanged behaviour)');
  assert(off.sources.every(s => s === 'generated'), 'T-002 default OFF: never a crystal hit before promotion');
  assert(on.generations === 1, 'T-003 opt-in: identical input generates exactly once');
  assert(on.sources[1] === 'crystal' && on.sources[2] === 'crystal', 'T-004 opt-in: subsequent builds served from exact cache');
  assert(on.costs[1] === 0 && on.costs[2] === 0, 'T-005 opt-in: cached builds cost zero');

  const lowFitness = await (async () => {
    let gens = 0;
    const crystallizer = makeCrystallizer();
    const population = new PopulationStore();
    const res = [];
    for (let i = 0; i < 2; i++) res.push(await unifiedDispatch({
      gateSignature:'sig', gateClass:'c', event, axioms:[], crystallizer, population,
      scorer: () => 0.5,                       // BELOW the 0.7 floor
      cascade: async () => { gens++; return { ok:true, output:'x', cost:1 }; },
      exactCacheOnFirstSuccess: true,
    }));
    return { gens, sources: res.map(r => r.source) };
  })();
  assert(lowFitness.gens === 2, 'T-006 a below-floor output is NOT frozen into the exact cache');

  console.log();
  console.log(`  warp-compounding: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
