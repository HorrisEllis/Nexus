'use strict';
/**
 * architect/registry-components.js
 * comp_id: nexus.architect.registry
 * uuid: nexus-architect-registry-v1-0000-2026-0627-jamesbrooks-001
 */
const V='1.0.0';const NS='architect';
function _c(id,method,path,desc,opts={}){
  return{id:`${NS}.${id}`,namespace:NS,name:id,version:V,
    grammar:opts.grammar||[id.replace(/\./g,' ')],
    route:{method,path},description:desc,
    params:opts.params||[],tags:[NS,...(opts.tags||[])],
    permissions:opts.permissions||['system'],hooks:opts.hooks||{}};
}
module.exports=[
  _c('health',           'GET',  '/health',                 'Architect health + hook counts'),
  _c('contract',         'GET',  '/api/contract',           'Architect interaction contract'),
  // ── Hooks ──────────────────────────────────────────────────────────────
  _c('hooks.list',       'GET',  '/api/hooks',              'Hook registry — all declared hooks'),
  _c('hook.get',         'GET',  '/api/hooks/:id',          'Single hook detail'),
  _c('hook.register',    'POST', '/api/hooks',              'Register a new hook', {tags:['hooks'],
    hooks:{in:[{id:'architect.hook.register.receive',intent:['register','declare'],contract:'nexus-interaction-contract-v1::architect',tags:['hooks']}]}}),
  _c('hook.update',      'PATCH','/api/hooks/:id',          'Update hook metadata'),
  _c('hook.deprecate',   'DELETE','/api/hooks/:id',         'Deprecate or remove hook'),
  _c('hook.wire',        'POST', '/api/hooks/wire',         'Wire two hooks together', {tags:['wires'],
    hooks:{in:[{id:'architect.hook.wire.receive',intent:['wire','connect','bind'],tags:['wires']}],
           out:[{id:'architect.hook.wire.complete',wires_to:['cortex.cfr.graph'],tags:['wires']}]}}),
  _c('hooks.validate',   'GET',  '/api/hooks/validate',     'Validate all hooks against invariants'),
  _c('hooks.graph',      'GET',  '/api/hooks/graph',        'Hook topology graph (json|mermaid)'),
  _c('hooks.check',      'POST', '/api/hooks/check',        'Check hook against constraints'),
  // ── Blueprints ─────────────────────────────────────────────────────────
  _c('blueprint.list',   'GET',  '/api/blueprint',          'Blueprint list'),
  _c('blueprint.scan',   'POST', '/api/blueprint/scan',     'Scan path → generate blueprint'),
  _c('blueprint.diff',   'POST', '/api/blueprint/diff',     'Diff two blueprints'),
  _c('blueprint.history','GET',  '/api/blueprint/history',  'Blueprint change history'),
  _c('blueprint.route',  'POST', '/api/blueprint/route',    'Route intent via blueprint'),
  // ── Architecture map ───────────────────────────────────────────────────
  _c('map',              'GET',  '/api/map',                'System topology maps'),
];
