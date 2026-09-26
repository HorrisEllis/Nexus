'use strict';
/**
 * meta/rfr2/index.js — RFR2 Causal Toolkit entry point
 * UUID: nexus-rfr2-index-v1-0000-2026-0702-jamesbrooks-001
 */
module.exports = {
  get observer()       { return require('./observer/index.js'); },
  get delta()          { return require('./delta/index.js'); },
  get clip()           { return require('./clip/index.js'); },
  get enforcement()    { return require('./enforcement/index.js'); },
  get context()        { return require('./context/index.js'); },
  get compress()       { return require('./compress/index.js'); },
  get query()          { return require('./query/index.js'); },
  get time()           { return require('./time/index.js'); },
  get identity()       { return require('./identity/index.js'); },
  get adapterSandbox() { return require('./adapter-sandbox/index.js'); },
  get versionGate()    { return require('./version-gate/index.js'); },
  // §JOB 2 2026-07-24 — harvested from meta/causal-nexus/modules/ (the
  // decided-canonical rfr2 tree per the 2026-07-21 audit) to unblock
  // clip/compress/context, which needed all four and didn't exist in rfr2
  // before this. All four converted to CJS alongside the harvest, not left
  // as a second ESM island.
  get kernel()         { return require('./kernel/index.js'); },
  get sigma()          { return require('./sigma/index.js'); },
  get adapter()        { return require('./adapter/index.js'); },
  get causality()      { return require('./causality/index.js'); },
  // §JOB 2b 2026-07-24 — forge harvested separately from the other 4: it's
  // the ONE real, live, external consumer meta/causal-nexus actually has
  // (nexus-healer/api/index.js) that the 2026-07-21 audit's '2 consumers'
  // count included — the OTHER named consumer (a loom scanner) turned out
  // on inspection to be a comment mentioning the path, not a real require().
  get forge()          { return require('./forge/index.js'); },
};
