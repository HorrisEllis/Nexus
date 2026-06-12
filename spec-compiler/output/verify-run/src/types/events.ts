// Event type constants — generated from spec
// Source: spec-compiler.spec events block

export const Events = {
  'compiler.t0.emitted': 'compiler.t0.emitted',
  'compiler.t1.emitted': 'compiler.t1.emitted',
  'compiler.cortex.queried': 'compiler.cortex.queried',
  'compiler.cortex.skipped': 'compiler.cortex.skipped',
  'compiler.chunk.built': 'compiler.chunk.built',
  'compiler.chunk.over_budget': 'compiler.chunk.over_budget',
  'compiler.file.emitted': 'compiler.file.emitted',
  'compiler.file.skipped': 'compiler.file.skipped',
  'compiler.failure': 'compiler.failure',
} as const;

export type EventType = keyof typeof Events;