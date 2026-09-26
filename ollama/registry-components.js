'use strict';
/**
 * ollama/registry-components.js
 * comp_id: nexus.ollama.registry
 * uuid: nexus-ollama-registry-v1-0000-2026-0627-jamesbrooks-001
 */
const NS='ollama',V='1.0.0';
function _c(id,method,path,desc,opts={}){
  return{id:`${NS}.${id}`,namespace:NS,name:id,version:V,
    grammar:opts.grammar||[NS+' '+id.replace(/\./g,' ')],
    route:{method,path},description:desc,
    params:opts.params||[],tags:[NS,...(opts.tags||[])],
    permissions:opts.permissions||['system'],hooks:opts.hooks||{}};
}
const components=[
  _c('jobs.dispatch','POST','/api/jobs','Queue a job for local model execution',{
    grammar:['ollama dispatch','od','ollama run'],tags:['dispatch'],
    hooks:{
      in:[{id:'ollama.jobs.dispatch.receive',intent:['build','ask','forge','classify'],contract:'nexus-interaction-contract-v1::ollama',tags:['dispatch']}],
      out:[{id:'ollama.jobs.dispatch.complete',wires_to:['cortex.raid.feedback','copilot.receive_result'],tags:['result']}]
    }
  }),
  _c('jobs.list','GET','/api/jobs','List recent jobs',{grammar:['ollama jobs','oj']}),
  _c('jobs.get','GET','/api/jobs/:id','Get single job by id'),
  _c('jobs.cancel','DELETE','/api/jobs/:id','Cancel a queued job'),
  _c('queue.status','GET','/api/queue','Queue depth and running count',{grammar:['ollama queue','oq']}),
  _c('models.list','GET','/api/models','Available local models',{grammar:['ollama models','om']}),
  _c('health','GET','/health','Ollama bridge health',{grammar:['ollama health']}),
];
module.exports={
  systemId:NS,version:V,port:3749,
  label:'OLLAMA',purpose:'Sovereign local model bridge. Isolated from Guardian.',
  components,
  events:{
    emits:['ollama.booted','ollama.job.queued','ollama.job.started','ollama.job.complete','ollama.job.failed','ollama.health.ok','ollama.health.degraded'],
    handles:['raid.dispatch.ollama','orchestrator.shutdown'],
  },
};
