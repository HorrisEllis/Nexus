'use strict';
const NS='eravos',V='3.0.0';
function _c(id,method,path,desc,opts={}){
  return{id:`${NS}.${id}`,namespace:NS,name:id,version:V,
    grammar:opts.grammar||['eravos '+id.replace(/\./g,' ')],
    route:{method,path},description:desc,
    params:opts.params||[],tags:[NS,...(opts.tags||[])],
    permissions:opts.permissions||['system'],hooks:opts.hooks||{}};
}
const components=[
  _c('canvas','GET','/','Main ERAVOS canvas — mods, wires, transport',{grammar:['eravos','canvas','open canvas']}),
  _c('mod.spawn','POST','/api/mods','Spawn an mod by id onto the canvas',{
    grammar:['eravos spawn','spawn mod'],
    hooks:{
      in:[{id:'eravos.mod.spawn.receive',intent:['compose','visualize','spawn'],contract:'nexus-interaction-contract-v1::eravos',tags:['spawn']}],
      out:[{id:'eravos.mod.spawn.complete',wires_to:['cortex.raid.feedback'],tags:['spawned']}]
    }
  }),
  _c('mod.list','GET','/api/mods','List all mounted mods',{grammar:['eravos mods']}),
  _c('mod.remove','DELETE','/api/mods/:uuid','Remove an mod'),
  _c('wire.connect','POST','/api/wires','Connect two mod hooks',{grammar:['eravos wire']}),
  _c('wire.list','GET','/api/wires','List all wires'),
  _c('catalog.list','GET','/api/catalog','Available mods from registry',{grammar:['eravos catalog']}),
  _c('pack.install','POST','/api/pack/install','Install a .zip mod pack',{grammar:['eravos install']}),
  _c('transport.play','POST','/api/transport/play','Start playback',{grammar:['eravos play']}),
  _c('transport.stop','POST','/api/transport/stop','Stop playback',{grammar:['eravos stop']}),
  _c('health','GET','/health','ERAVOS health'),
  _c('contract','GET','/contract','ERAVOS interaction contract'),
];
module.exports={
  systemId:NS,version:V,port:3751,
  label:'ERAVOS',purpose:'Sovereign canvas. Mods, wires, audio, spatial.',
  components,
  events:{
    emits:['eravos.booted','eravos.mod.spawned','eravos.mod.removed','eravos.wire.connected','eravos.wire.disconnected','eravos.pack.queued','eravos.transport.play','eravos.transport.stop'],
    handles:['guardian.mod-queue.push','raid.dispatch.eravos','orchestrator.shutdown'],
  },
};
