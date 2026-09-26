'use strict';
/**
 * lib/contract-queue.js
 * comp_id: nexus.lib.contract-queue
 * uuid: nexus-contract-queue-v1-0000-2026-0627-jamesbrooks-001
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),http=require('http');
const ROOT=path.join(__dirname,'..'),CX_URL=process.env.CORTEX_URL||'http://127.0.0.1:3748';
const STUCK_MS=parseInt(process.env.CONTRACT_STUCK_MS||'45000'),MAX_RETRIES=3;
const STATUS=Object.freeze({QUEUED:'queued',DISPATCHED:'dispatched',RUNNING:'running',COMPLETE:'complete',FAILED:'failed',STUCK:'stuck'});
const PRIORITY=Object.freeze({CRITICAL:'critical',HIGH:'high',NORMAL:'normal',LOW:'low'});
// §SECURITY FIX 2026-07-27 — found by adversarial simulation (UC2.4), not by
// reading. _dir() previously did path.join(ROOT, sys, io) with NO validation,
// so a caller-supplied system name became a filesystem path unchecked. Proven:
// fromSystem "../../etc" resolved to /home/claude/etc/output — OUTSIDE the
// repo — and mkdirSync created it. Every other path-taking surface in this
// codebase already validates (autopilot's _segSafe, component-ledger's _safe);
// the queue was the one that did not, and it is the surface that takes names
// from other systems.
//
// Two checks, deliberately, because neither alone is sufficient: an allowlist
// pattern rejects the obvious, and a resolved-path containment check catches
// anything the pattern misses. Same belt-and-braces as the tablet's ledger API.
const SYS_OK = /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/;
function _safeSys(sys){
  if (typeof sys !== 'string' || !sys || sys.length > 128 || sys.includes('..') || !SYS_OK.test(sys)) {
    throw new Error(`[contract-queue] §1.1 refusing unsafe system name ${JSON.stringify(sys)} — a system name becomes a filesystem path and must be an allowlisted token`);
  }
  return sys;
}
function _dir(sys,io){
  const d=path.join(ROOT,_safeSys(sys),io);
  if (!path.resolve(d).startsWith(path.resolve(ROOT)+path.sep)) {
    throw new Error(`[contract-queue] §4.3 path escapes repo root for system ${JSON.stringify(sys)}`);
  }
  fs.mkdirSync(d,{recursive:true});
  return d;
}
function _p(dir,uuid){return path.join(dir,`${uuid}.json`);}
function _w(fp,c){_wAtomic(fp,c);}   // §2026-07-24 — was a bare writeFileSync; a poller could read a torn file mid-write
function _r(fp){try{return JSON.parse(fs.readFileSync(fp,'utf8'));}catch(_){return null;}}
function _u(fp,patch){const c=_r(fp);if(!c)return null;const u={...c,...patch,updatedAt:Date.now()};_w(fp,u);return u;}

// ── §QUEUE HARDENING 2026-07-24 ─────────────────────────────────────────────
// James's rationale for the file queue: "a good redundant queue system,
// tagging and tracking as it moves from system to system, and would make it
// easier to diagnose at least at first."
//
// That rationale is right, and it is exactly why the three gaps below mattered.
// The strongest argument for a file queue is that IT MAKES STILLNESS PHYSICAL:
// today's three dead heal dispatches emitted into nothing and left nothing, so
// nobody could see them fail. A contract that is never claimed is an OBJECT
// SITTING IN A FOLDER — visible to ls, and caught by findStuck().
//
// Gap 1 — NO ATOMIC CLAIM. accept() was read-modify-write with no lock, so two
//   pollers (or a poller and a restarted consumer) could both claim the same
//   contract and run it twice. Identical to the JaaStore MP-001 race fixed
//   earlier today, and fixed with the identical proven primitive: O_EXCL.
// Gap 2 — NO JOURNEY. The contract recorded WHERE IT IS (status) but not
//   WHERE IT HAS BEEN. hops[] now accumulates every transition, so the
//   artifact carries its own history even if the ledger write fails.
// Gap 3 — NOTHING LEDGERED. A drop, claim or completion reached no ledger, so
//   file-queue movement was the least observable path in the system — the
//   opposite of "movement needs to be tangible".
//
// hops[] + ledger together are TWO INDEPENDENT WITNESSES to the same movement.
// That is the real redundancy: when they disagree (ledger says delivered, file
// says never claimed) the disagreement is itself the diagnosis.

// Atomic write — tmp + rename. A reader can never observe a torn/partial JSON,
// which matters more here than in most places because the POLLER reads these
// files on a timer while consumers are writing them.
function _wAtomic(fp,c){
  const tmp=`${fp}.${process.pid}.${Date.now()}.tmp`;
  try{ fs.writeFileSync(tmp,JSON.stringify(c,null,2),'utf8'); fs.renameSync(tmp,fp); }
  catch(e){ try{fs.unlinkSync(tmp);}catch(_){ } throw e; }
}

// ── ADDENDA — the living record ─────────────────────────────────────────────
// James, 2026-07-24: "It's supposed to add addendums as a living record as it
// moves through the system."
//
// "Addendum" already means something precise in nexus: a spec addendum APPENDS
// rather than replaces (docs/warp-devkit-addendum-v1.4.1.spec; §0.3 preserves
// prior versions). The same principle applied to a contract in flight: each
// system that touches it APPENDS what it contributed. Nothing is ever edited,
// nothing removed — the contract accumulates its own history and arrives
// carrying everything that happened to it.
//
// An addendum is deliberately richer than a breadcrumb. Structural fields say
// WHERE it went (system/action/hook/wire); semantic fields say WHAT THE SYSTEM
// CONTRIBUTED (observed/decided/produced/note). A trail of "accepted at T"
// tells you the route; an addendum tells you the reasoning, which is what
// makes it diagnosable after the fact.
//
// TAMPER-EVIDENT BY CHAIN. Each addendum hashes (prevHash + its own content),
// so altering or deleting an earlier entry breaks every hash after it and is
// DETECTABLE (verifyAddenda below). Without this, "append-only" is a
// convention any process could quietly violate — and a living record you
// cannot trust is worse than none, because it is believed.
//
// BOUNDED ON PURPOSE. Semantic fields are capped: a contract that accumulates
// full payloads at every hop becomes an unmovable blob, and the ledger
// duplicates the detail anyway. Addenda carry REFERENCES and short findings,
// not cargo.
const ADDENDUM_TEXT_MAX=parseInt(process.env.CONTRACT_ADDENDUM_MAX||'600');
function _clip(v){
  if(v==null)return null;
  const s=typeof v==='string'?v:JSON.stringify(v);
  return s.length>ADDENDUM_TEXT_MAX?s.slice(0,ADDENDUM_TEXT_MAX)+`…[clipped ${s.length-ADDENDUM_TEXT_MAX}]`:s;
}
function _addendumHash(prevHash,body){
  return crypto.createHash('sha256').update(String(prevHash||'')+JSON.stringify(body)).digest('hex').slice(0,16);
}
function _hop(c,{system,action,hook,wire,note,observed,decided,produced,by}){
  const addenda=Array.isArray(c.addenda)?c.addenda.slice():[];
  const prev=addenda[addenda.length-1];
  const body={
    seq:addenda.length,                    // ordinal — a gap here means an entry was removed
    system,action,
    hook:hook||null,wire:wire||null,
    by:by||`${system}:pid${process.pid}`,  // authorship, so an entry is attributable
    note:_clip(note),
    observed:_clip(observed),              // what this system SAW
    decided:_clip(decided),                // what it CHOSE, and why
    produced:_clip(produced),              // refs to artifacts — never the artifacts
    ts:Date.now(),
  };
  addenda.push({...body,prevHash:prev?prev.hash:null,hash:_addendumHash(prev?prev.hash:null,body)});
  return addenda;
}

// Verify the chain. Returns { ok, brokenAt, reason } — a broken chain names
// WHERE it broke, because "something was altered" is not actionable and
// "entry 3 was altered" is.
function verifyAddenda(c){
  const a=Array.isArray(c&&c.addenda)?c.addenda:[];
  if(!a.length)return{ok:true,entries:0};
  let prevHash=null;
  for(let i=0;i<a.length;i++){
    const e=a[i];
    if(e.seq!==i)return{ok:false,brokenAt:i,reason:`seq mismatch: expected ${i}, got ${e.seq} — an entry was removed or reordered`};
    if(e.prevHash!==prevHash)return{ok:false,brokenAt:i,reason:`prevHash mismatch at entry ${i} — history before it was altered`};
    const {prevHash:_p,hash:_h,...body}=e;
    if(_addendumHash(prevHash,body)!==e.hash)return{ok:false,brokenAt:i,reason:`content hash mismatch at entry ${i} — this entry was edited after it was written`};
    prevHash=e.hash;
  }
  return{ok:true,entries:a.length,head:prevHash};
}

// Public: let any system annotate the contract it is currently holding.
// This is the point of a LIVING record — a system does not merely pass the
// contract along, it writes down what it learned. Requires the claim, so a
// system cannot append to a contract it does not hold (§4.3 — otherwise any
// process could forge another's testimony).
function appendAddendum(sys,uuid,{note,observed,decided,produced,action}={}){
  const fp=_p(_dir(sys,'input'),uuid);
  const c=_r(fp);
  if(!c)return null;
  if(!fs.existsSync(_claimPath(sys,uuid))){
    console.warn(`[contract-queue] appendAddendum refused for ${uuid} — ${sys} does not hold the claim`);
    return null;
  }
  const u=_u(fp,{addenda:_hop(c,{system:sys,action:action||'annotated',hook:c.toHook,
                                 wire:`${sys}.input`,note,observed,decided,produced})});
  if(u)_ledger(u,'annotated',{system:sys,detail:{note:_clip(note)}});
  return u;
}

// Mirror every transition into the canonical ledger. Best-effort and LOUD on
// failure (§1.2) but never fatal: a contract must not fail to move because its
// telemetry could not be written.
function _ledger(c,action,extra={}){
  try{
    const {write}=require('./component-ledger');
    write({
      system:extra.system||c.toSystem||c.fromSystem,
      component:`${extra.system||c.toSystem||c.fromSystem}.queue`,
      action:`contract.${action}`,
      status:extra.status||'ok',
      tags:['contract-queue','file-drop'],
      contractUuid:c.contractId||null,
      causedBy:c.uuid,
      // §schema 2026-07-24 — hook/wire were already being computed for the
      // addenda chain; the ledger was simply never given them. Same movement,
      // now locatable in the architecture from either witness.
      hook:extra.hook||c.toHook||c.fromHook||null,
      wire:extra.wire||`${c.fromSystem}.output→${c.toSystem}.input`,
      intent:c.intent||null,
      detail:{uuid:c.uuid,intent:c.intent,from:c.fromSystem,to:c.toSystem,
              fromHook:c.fromHook,toHook:c.toHook,priority:c.priority,
              status:c.status,retryCount:c.retryCount||0,...extra.detail},
    });
  }catch(e){ console.error(`[contract-queue] ledger write failed for ${c.uuid} (${action}): ${e.message}`); }
}

// O_EXCL claim — the same atomic primitive as guardian/jaa-store.js's flush
// lock. 'wx' fails if the file exists, which is what makes "exactly one
// claimant" true across processes rather than merely likely. A claim older
// than CLAIM_STALE_MS is presumed abandoned (consumer crashed mid-run) and
// broken LOUDLY, never silently.
const CLAIM_STALE_MS=parseInt(process.env.CONTRACT_CLAIM_STALE_MS||'120000');
function _claimPath(sys,uuid){return _p(_dir(sys,'input'),uuid)+'.claim';}
function _tryClaim(sys,uuid){
  const cp=_claimPath(sys,uuid);
  try{
    const fd=fs.openSync(cp,'wx');
    fs.writeSync(fd,JSON.stringify({pid:process.pid,ts:Date.now()}));
    fs.closeSync(fd);
    return true;
  }catch(e){
    if(e.code!=='EEXIST'){ console.error(`[contract-queue] claim error ${uuid}: ${e.code}`); return false; }
    try{
      const st=fs.statSync(cp);
      if(Date.now()-st.mtimeMs>CLAIM_STALE_MS){
        const held=(()=>{try{return fs.readFileSync(cp,'utf8');}catch(_){return '?';}})();
        console.error(`[contract-queue] BREAKING STALE CLAIM on ${uuid} — held ${held} for >${CLAIM_STALE_MS}ms, presumed crashed mid-run (§1.2)`);
        try{fs.unlinkSync(cp);}catch(_){ }
        try{ fs.closeSync(fs.openSync(cp,'wx')); return true; }catch(_){ return false; }
      }
    }catch(_){ }
    return false;
  }
}
function _releaseClaim(sys,uuid){ try{fs.unlinkSync(_claimPath(sys,uuid));}catch(_){ } }

function create(opts={}){
  if(!opts.fromSystem||!opts.toSystem||!opts.intent) throw new Error('fromSystem, toSystem, intent required');
  const c={
    uuid:crypto.randomUUID(),requestId:opts.requestId||crypto.randomUUID(),
    contractId:opts.contractId||'nexus-interaction-contract-v1',
    fromSystem:opts.fromSystem,fromComponent:opts.fromComponent||opts.fromSystem,
    fromHook:opts.fromHook||`${opts.fromComponent||opts.fromSystem}.out`,
    toSystem:opts.toSystem,toComponent:opts.toComponent||opts.toSystem,
    toHook:opts.toHook||`${opts.toComponent||opts.toSystem}.in`,
    intent:opts.intent,agent:opts.agent||null,tags:opts.tags||[],
    payload:opts.payload||{},status:STATUS.QUEUED,priority:opts.priority||PRIORITY.NORMAL,
    createdAt:Date.now(),dispatchedAt:null,completedAt:null,
    ttlMs:opts.ttlMs||STUCK_MS,retryCount:0,result:null,error:null,
  };
  c.addenda=_hop({},{system:c.fromSystem,action:'created',hook:c.fromHook,wire:`${c.fromSystem}.output`,note:c.intent,decided:`route to ${c.toSystem}`});
  _w(_p(_dir(opts.fromSystem,'output'),c.uuid),c); // §LAW II
  _ledger(c,'created',{system:c.fromSystem});
  return c;
}

function dispatch(c){
  const d={...c,status:STATUS.DISPATCHED,dispatchedAt:Date.now()};
  d.addenda=_hop(c,{system:c.fromSystem,action:'dispatched',hook:c.fromHook,
                 wire:`${c.fromSystem}.output→${c.toSystem}.input`,note:`→ ${c.toSystem}`});
  _w(_p(_dir(c.toSystem,'input'),c.uuid),d);
  _w(_p(_dir(c.fromSystem,'output'),c.uuid),d);
  _ledger(d,'dispatched',{system:c.fromSystem});
  return d;
}

// accept() — the gap that mattered most. Was read-modify-write with no lock,
// so two consumers could both accept the same contract and run it twice.
// Returns null when the claim is lost, and the caller MUST treat null as
// "someone else has it" rather than as an error (§1.2 — the refusal is a real
// outcome, not a failure).
function accept(sys,uuid){
  if(!_tryClaim(sys,uuid)){
    console.warn(`[contract-queue] accept refused for ${uuid} — already claimed by another consumer`);
    return null;
  }
  const fp=_p(_dir(sys,'input'),uuid);
  const c=_r(fp);
  if(!c){ _releaseClaim(sys,uuid); return null; }
  // Re-check status UNDER the claim: it may have completed between the
  // poller listing it and this consumer claiming it.
  if(c.status===STATUS.COMPLETE||c.status===STATUS.FAILED){ _releaseClaim(sys,uuid); return null; }
  const u=_u(fp,{status:STATUS.RUNNING,acceptedAt:Date.now(),claimedByPid:process.pid,
                 addenda:_hop(c,{system:sys,action:'accepted',hook:c.toHook,wire:`${sys}.input`})});
  if(u) _ledger(u,'accepted',{system:sys});
  return u;
}
function complete(sys,uuid,result){
  const fp=_p(_dir(sys,'input'),uuid); const c=_r(fp); if(!c)return null;
  // §FIX 2026-07-27 — found by simulation (UC2.1): completion required NO
  // claim, so any process could mark another system's work done. accept() is
  // rigorously guarded by an O_EXCL claim and complete() simply ignored it,
  // which made the claim decorative for the one transition that matters.
  // A completion is the strongest assertion in the lifecycle ("this work is
  // finished") and was the least protected.
  if(!fs.existsSync(_claimPath(sys,uuid))){
    console.warn(`[contract-queue] complete refused for ${uuid} — ${sys} does not hold the claim (§4.3: only the holder may declare work finished)`);
    return null;
  }
  const u=_u(fp,{status:STATUS.COMPLETE,result,completedAt:Date.now(),
                 addenda:_hop(c,{system:sys,action:'completed',hook:c.toHook,wire:`${sys}.input`})});
  _releaseClaim(sys,uuid);
  if(u) _ledger(u,'completed',{system:sys});
  return u;
}
function fail(sys,uuid,error){
  const c=_r(_p(_dir(sys,'input'),uuid));if(!c)return null;
  const retryCount=(c.retryCount||0)+1;
  const terminal=retryCount>=MAX_RETRIES;
  const u=_u(_p(_dir(sys,'input'),uuid),{status:terminal?STATUS.FAILED:STATUS.QUEUED,error:String(error),retryCount,failedAt:Date.now(),
                 addenda:_hop(c,{system:sys,action:terminal?'failed':'retry-queued',hook:c.toHook,wire:`${sys}.input`,note:String(error).slice(0,120)})});
  // Release so a retry can be claimed by whichever consumer picks it up next.
  _releaseClaim(sys,uuid);
  if(u) _ledger(u,terminal?'failed':'retry',{system:sys,status:terminal?'error':'warn',detail:{error:String(error).slice(0,200),retryCount}});
  return u;
}

function pending(sys){
  try{
    const dir=_dir(sys,'input');
    return fs.readdirSync(dir).filter(f=>f.endsWith('.json'))
      .map(f=>_r(path.join(dir,f))).filter(c=>c&&(c.status===STATUS.QUEUED||c.status===STATUS.DISPATCHED))
      .sort((a,b)=>{const p={critical:0,high:1,normal:2,low:3};return(p[a.priority]||2)-(p[b.priority]||2)||a.createdAt-b.createdAt;});
  }catch(_){return[];}
}

function findStuck(sysIds){
  const stuck=[],now=Date.now();
  for(const sys of sysIds){
    try{
      const dir=_dir(sys,'input');
      fs.readdirSync(dir).filter(f=>f.endsWith('.json')).forEach(f=>{
        const c=_r(path.join(dir,f));
        if(!c||!['queued','dispatched','running'].includes(c.status))return;
        const age=now-(c.dispatchedAt||c.createdAt);
        if(age>(c.ttlMs||STUCK_MS))stuck.push({...c,stuckMs:age,systemId:sys});
      });
    }catch(_){}
  }
  return stuck;
}

function markStuck(sys,uuid){
  const fp=_p(_dir(sys,'input'),uuid); const c=_r(fp); if(!c)return null;
  const u=_u(fp,{status:STATUS.STUCK,stuckAt:Date.now(),
                 addenda:_hop(c,{system:sys,action:'stuck',hook:c.toHook,wire:`${sys}.input`,note:`no progress in ${c.ttlMs||STUCK_MS}ms`})});
  if(u) _ledger(u,'stuck',{system:sys,status:'error'});
  return u;
}

async function reportStuck(contract){
  const body=JSON.stringify({table:'gaps',row:{uuid:crypto.randomUUID(),type:'contract.stuck',severity:'high',status:'open',
    body:`Contract ${contract.uuid} stuck ${Math.round(contract.stuckMs/1000)}s in ${contract.systemId}: ${contract.intent} ${contract.fromSystem}→${contract.toSystem}`,
    source:'contract-queue',contractId:contract.uuid,ts:Date.now()}});
  return new Promise(res=>{
    const u=new URL(`${CX_URL}/api/memory/insert`);
    const req=http.request({hostname:u.hostname,port:u.port||3748,path:u.pathname,method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:3000},
      r=>{r.resume();res(true);}); req.on('error',()=>res(false)); req.write(body);req.end();
  });
}

module.exports={create,dispatch,accept,complete,fail,pending,findStuck,markStuck,reportStuck,appendAddendum,verifyAddenda,STATUS,PRIORITY,_tryClaim,_releaseClaim,CLAIM_STALE_MS,ADDENDUM_TEXT_MAX};
