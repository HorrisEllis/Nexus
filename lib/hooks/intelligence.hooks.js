'use strict';
/**
 * hooks/intelligence.hooks.js — Intelligence System Hook Map
 * Status: living
 * System: Intelligence :3753
 *
 * 2026-09-19 — moved here from hooks/cortex.hooks.js when the intelligence-domain
 * routes moved out of cortex (docs/2026-09-19-cortex-to-intelligence-and-
 * versionium-consolidation-phasemap.spec). Same entries, re-homed: surface
 * 'intelligence', port 3753, served by intelligence/routes.js. Ids re-prefixed.
 */

const INTELLIGENCE_HOOKS = [
  {
    "id": "intelligence-hook-api-query-get-0201",
    "name": "intelligence-api-query-get",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/query",
      "method": "GET"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": true,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-adversarial-post-0206",
    "name": "intelligence-api-intelligence-adversarial-post",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/adversarial",
      "method": "POST"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": false,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-intuition-post-0207",
    "name": "intelligence-api-intelligence-intuition-post",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/intuition",
      "method": "POST"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": false,
      "methodEnforced": true
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-intuition-get-0208",
    "name": "intelligence-api-intelligence-intuition-get",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/intuition",
      "method": "GET"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": true,
      "methodEnforced": true
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-mastermind-post-0209",
    "name": "intelligence-api-intelligence-mastermind-post",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/mastermind",
      "method": "POST"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": false,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-patterns-get-0210",
    "name": "intelligence-api-intelligence-patterns-get",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/patterns",
      "method": "GET"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": true,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-rca-get-0211",
    "name": "intelligence-api-intelligence-rca-get",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/rca",
      "method": "GET"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": true,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-api-intelligence-status-get-0212",
    "name": "intelligence-api-intelligence-status-get",
    "intent": "Declared from code (scripts/analyze-methodless-routes.js). methodEnforced=false means the handler has NO method guard: any verb reaches it.",
    "type": "api",
    "direction": "unidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "config": {
      "path": "/api/intelligence/status",
      "method": "GET"
    },
    "contract": {
      "axioms": [],
      "sideEffects": [],
      "idempotent": true,
      "methodEnforced": false
    },
    "references": {
      "files": [
        "intelligence/routes.js"
      ]
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  },
  {
    "id": "intelligence-hook-context-0001",
    "name": "intelligence-context",
    "intent": "Return pre-request context (failure modes, reuse candidates, patterns) so agents never start cold",
    "type": "api",
    "direction": "bidirectional",
    "from": {
      "surface": "*",
      "layer": 0
    },
    "to": {
      "surface": "intelligence",
      "layer": 1,
      "port": 3753
    },
    "ui": {
      "panel": "INTELLIGENCE > STATUS",
      "element": "Intelligence status panel",
      "action": "GET /api/intelligence/context"
    },
    "config": {
      "path": "/api/intelligence/context",
      "queryParams": [
        "intent",
        "command",
        "provider"
      ],
      "timeout": 3000
    },
    "contract": {
      "axioms": [
        "\u00a7CC-001",
        "\u00a7US-04"
      ],
      "sideEffects": [],
      "idempotent": true
    },
    "references": {
      "files": [
        "intelligence/index.js \u2192 getContext()",
        "cortex/foundation/admin-server.js \u2192 registerIntelligence()"
      ]
    },
    "seam": {
      "componentId": "intelligence-context-query",
      "intentId": "return-pre-request-context-to-agents"
    },
    "status": "active",
    "updatedAt": "2026-09-19T00:00:00Z"
  }
];

module.exports = {
  systemId:'intelligence', port:3753, version:'1.0.0', updatedAt:'2026-09-19T00:00:00Z', hooks:INTELLIGENCE_HOOKS,
  byId:(id)=>INTELLIGENCE_HOOKS.find(h=>h.id===id), byName:(n)=>INTELLIGENCE_HOOKS.find(h=>h.name===n),
  byType:(t)=>INTELLIGENCE_HOOKS.filter(h=>h.type===t), withSEAM:()=>INTELLIGENCE_HOOKS.filter(h=>h.seam!==null && h.seam!==undefined),
  active:()=>INTELLIGENCE_HOOKS.filter(h=>h.status==='active'),
};
