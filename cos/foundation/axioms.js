/**
 * foundation/axioms.js
 * COMPARTMENT OS — Enforced Axioms
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Axioms are not guidelines. Violation throws a CosAxiomError.
 * Every axiom has: id, description, enforce(ctx) function.
 * enforce() throws if violated, returns void if satisfied.
 */

'use strict';

// ─── CosAxiomError ────────────────────────────────────────────────────────────

class CosAxiomError extends Error {
  constructor(axiomId, message, context = {}) {
    super(`[${axiomId}] ${message}`);
    this.name       = 'CosAxiomError';
    this.axiomId    = axiomId;
    this.context    = context;
  }
}

// ─── Axiom Registry ───────────────────────────────────────────────────────────

const AXIOMS = Object.freeze([

  {
    id:          'COS-1',
    description: 'Nothing exists until proven — no stubs, no silently failing code.',
    // Enforced at schema validation time: COS-1 is checked by schema-engine,
    // not as a runtime guard here. The axiom is declared for documentation
    // and system map inclusion.
    enforce: (_ctx) => { /* structural axiom — enforced by schema-engine */ },
  },

  {
    id:          'COS-2',
    description: 'CLI first — if it can\'t be done in CLI it doesn\'t exist yet.',
    enforce: (_ctx) => { /* architectural axiom — enforced by build order */ },
  },

  {
    id:          'COS-3',
    description: 'Every hook has UUID + contract + version.',
    /**
     * @param {{ hook: object }} ctx
     */
    enforce: (ctx) => {
      const { hook } = ctx;
      if (!hook) throw new CosAxiomError('COS-3', 'hook is required', ctx);
      if (!hook.id)               throw new CosAxiomError('COS-3', 'hook.id (UUID) is required', { hook });
      if (!hook.version)          throw new CosAxiomError('COS-3', 'hook.version is required',   { hook });
      if (!hook.contract)         throw new CosAxiomError('COS-3', 'hook.contract is required',  { hook });
      if (!hook.bindings?.event)  throw new CosAxiomError('COS-3', 'hook.bindings.event is required', { hook });
    },
  },

  {
    id:          'COS-4',
    description: 'Compartments never share memory — events only.',
    /**
     * @param {{ sourceId: string, targetId: string, method: string }} ctx
     */
    enforce: (ctx) => {
      const { method } = ctx;
      if (method === 'direct-import' || method === 'shared-memory') {
        throw new CosAxiomError('COS-4',
          `Cross-compartment communication via '${method}' is forbidden. Use events or pipes.`,
          ctx
        );
      }
    },
  },

  {
    id:          'COS-5',
    description: 'Foundation never changes after v1.0.0.',
    enforce: (_ctx) => { /* build-time axiom — enforced by version check */ },
  },

  {
    id:          'COS-6',
    description: 'UI is disposable — schema survives any UI swap.',
    enforce: (_ctx) => { /* architectural axiom */ },
  },

  {
    id:          'COS-7',
    description: 'System map is always current — update on every mutation.',
    /**
     * @param {{ mapUpdated: boolean }} ctx
     */
    enforce: (ctx) => {
      if (ctx.mapUpdated === false) {
        throw new CosAxiomError('COS-7',
          'A mutation occurred without updating the system map.',
          ctx
        );
      }
    },
  },

  {
    id:          'COS-8',
    description: 'Auto-detect before prompting — ask only what can\'t be inferred.',
    enforce: (_ctx) => { /* behavioral axiom — enforced by auto-detect module */ },
  },

  {
    id:          'COS-9',
    description: 'Every variable is declared in the system map.',
    enforce: (_ctx) => { /* enforced by schema-engine variable registry */ },
  },

  {
    id:          'COS-10',
    description: 'All inter-compartment communication via host event bus.',
    /**
     * @param {{ method: string }} ctx
     */
    enforce: (ctx) => {
      const ALLOWED = ['event-bus', 'pipe', 'api'];
      if (!ALLOWED.includes(ctx.method)) {
        throw new CosAxiomError('COS-10',
          `Inter-compartment communication via '${ctx.method}' is not allowed.`,
          ctx
        );
      }
    },
  },

  {
    id:          'COS-11',
    description: 'Network isolation is default-on — opt-in to open.',
    /**
     * @param {{ networkConfig: object }} ctx
     */
    enforce: (ctx) => {
      const { networkConfig } = ctx;
      // isolated must be explicitly set to false to allow open network
      // if networkConfig is missing, isolation must be assumed (pass)
      if (networkConfig && networkConfig.isolated === undefined) {
        throw new CosAxiomError('COS-11',
          'NetworkConfig.isolated must be explicitly set.',
          ctx
        );
      }
    },
  },

  {
    id:          'COS-12',
    description: 'Drag-drop is a first-class input — not a UI feature.',
    enforce: (_ctx) => { /* UI/API contract axiom */ },
  },

  {
    id:          'COS-13',
    description: 'Host service is the authority — UI is a client, never the host.',
    enforce: (_ctx) => { /* architectural axiom */ },
  },

  {
    id:          'COS-14',
    description: 'Compartment-to-compartment communication via API only — no shared memory, no direct event bus cross-wiring.',
    /**
     * @param {{ method: string, isCrossCompartment: boolean }} ctx
     */
    enforce: (ctx) => {
      if (ctx.isCrossCompartment && ctx.method !== 'api') {
        throw new CosAxiomError('COS-14',
          `Cross-compartment messages must use the API. Got: '${ctx.method}'`,
          ctx
        );
      }
    },
  },

  {
    id:          'COS-15',
    description: 'All pipe traffic is logged to the master kernel (audit by default).',
    /**
     * @param {{ pipe: object }} ctx
     */
    enforce: (ctx) => {
      const { pipe } = ctx;
      if (pipe && pipe.eventLog === false) {
        throw new CosAxiomError('COS-15',
          'Pipe eventLog cannot be disabled. All pipe traffic must be audited.',
          ctx
        );
      }
    },
  },

  {
    id:          'COS-16',
    description: 'OS metrics are kernel events — not a separate monitoring system.',
    enforce: (_ctx) => { /* architectural axiom */ },
  },

  {
    id:          'COS-17',
    description: 'Service config is the single source of truth for all paths and ports.',
    enforce: (_ctx) => { /* architectural axiom */ },
  },

]);

// ─── Axiom Lookup ─────────────────────────────────────────────────────────────

/** @type {Map<string, object>} */
const AXIOM_MAP = new Map(AXIOMS.map(a => [a.id, a]));

/**
 * Enforce a specific axiom by ID.
 * Throws CosAxiomError if violated.
 * @param {string} axiomId  e.g. 'COS-3'
 * @param {object} ctx      context data for the axiom's enforce() function
 */
function enforce(axiomId, ctx = {}) {
  const axiom = AXIOM_MAP.get(axiomId);
  if (!axiom) {
    throw new CosAxiomError(axiomId, `Unknown axiom: '${axiomId}'`, ctx);
  }
  axiom.enforce(ctx);
}

/**
 * Returns axiom definitions as plain objects for system map inclusion.
 * @returns {Array<{ id: string, description: string }>}
 */
function getAxiomDefs() {
  return AXIOMS.map(({ id, description }) => ({ id, description }));
}

module.exports = {
  CosAxiomError,
  AXIOMS,
  AXIOM_MAP,
  enforce,
  getAxiomDefs,
};
