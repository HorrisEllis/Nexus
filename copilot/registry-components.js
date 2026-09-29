'use strict';
const NS='copilot',V='2.0.0';
function _c(id,method,path,desc,opts={}){
  return{id:`${NS}.${id}`,namespace:NS,name:id,version:V,
    grammar:opts.grammar||[NS+' '+id.replace(/\./g,' ')],
    route:{method,path},description:desc,
    params:opts.params||[],tags:[NS,...(opts.tags||[])],
    permissions:opts.permissions||['system'],hooks:opts.hooks||{}};
}
const components=[
  _c('prompt','POST','/api/prompt','Primary entry — all co-pilot interactions',{
    grammar:['ask','copilot','cp'],
    hooks:{
      in:[{id:'copilot.prompt.receive',intent:['ask','build','diagnose','navigate','note','tool','action'],contract:'nexus-interaction-contract-v1::copilot',tags:['entry-point']}],
      out:[{id:'copilot.prompt.to-ollama',wires_to:['ollama.jobs.dispatch.receive'],tags:['model']},
           {id:'copilot.prompt.reply',wires_to:['ui.copilot.receive'],tags:['response']}]
    }
  }),
  // 0.39.257 — the tool catalog in plain language, and one tool run through the same gate as the loop (idearium /tools, /debug)
  _c('tools.list','GET','/api/tools/list','Every registered tool, grouped, in plain language (?q= search, ?scope= marks a caller\'s scope)',{grammar:['tools','list tools']}),
  _c('tools.run','POST','/api/tools/run','Run one tool through executeTool (config gate, fault history, event log); refused outside the caller\'s scope',{grammar:['run tool']}),
  _c('stream.query','GET','/api/stream','Query the continuous event stream',{grammar:['stream','cs']}),
  _c('stream.ingest','POST','/api/stream/ingest','Push events into co-pilot stream'),
  _c('sessions','GET','/api/sessions','Active co-pilot sessions'),
  _c('axioms.list','GET','/api/axioms','List all axioms',{grammar:['axioms','list axioms']}),
  _c('axioms.add','POST','/api/axioms/add','Add a runtime axiom',{grammar:['add axiom']}),
  _c('axioms.remove','POST','/api/axioms/remove','Remove a runtime axiom',{grammar:['remove axiom']}),
  _c('lifeline.health','GET','/api/lifeline/health','Lifeline provider health',{grammar:['lifeline health']}),
  _c('build','POST','/api/build','Build a new module from description',{grammar:['build','co-pilot build']}),
  _c('diagnose','POST','/api/diagnose','Start recursive fractal diagnosis',{grammar:['diagnose','recursive diagnose']}),
  _c('diagnose.list','GET','/api/diagnose/list','List past diagnosis sessions'),
  _c('prompt.fulfill','POST','/api/prompt/fulfill','Adaptive iteration — RAID-routed, fault-classified, reflection-scored (§15.1-15.3)',{
    grammar:['fulfill','cp fulfill'],
    hooks:{
      in:[{id:'copilot.prompt.fulfill.receive',intent:['ask','build','diagnose'],contract:'nexus-interaction-contract-v1::copilot',tags:['entry-point','adaptive']}],
      out:[{id:'copilot.fulfillment.attempt',wires_to:['cortex.intelligence.event'],tags:['learning']}]
    }
  }),
  _c('prompt.stream','POST','/api/prompt/stream','Streaming SSE prompt — token-by-token, no timeout (P112)',{
    grammar:['stream ask','cp stream'],
    hooks:{
      in:[{id:'copilot.prompt.stream.receive',intent:['ask'],tags:['streaming','sse']}],
      out:[{id:'copilot.prompt.stream.chunk',wires_to:['ui.copilot.stream'],tags:['streaming']}],
    }
  }),
  _c('health','GET','/health','Co-pilot health'),
  _c('contract','GET','/contract','Co-pilot interaction contract'),

  // ── PERSON MODEL — the co-pilot's model of the USER ─────────────────────
  //
  // §CR-004 2026-08-19 — the ids are person_model.*, NOT person-model.*.
  // component-registry.js:36 is ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/
  // which permits underscores after the first dot but NOT hyphens. Registering
  // these as 'copilot.person-model.*' produced, in the 2026-08-19 boot:
  //     [component-registry] system:copilot registered 16 components (12 failed)
  // Twelve silent rejections — one per person-model route — and the co-pilot
  // came up with the whole surface missing while reporting a successful
  // registration. The HTTP paths stay hyphenated; only the ID is constrained.
  // §2026-08-17. Distinct from copilot/lib/self-model.js (the co-pilot's model
  // of ITSELF). Registered so the grammar engine can resolve "what do you know
  // about me" to a real component instead of falling through to the LLM.
  _c('person_model.portrait','GET','/api/person-model/portrait',
    'Lens reading of the user model — always carries provenance and lens coverage (§LN-7)',{
    grammar:['what do you know about me','person model','my model','portrait','who am i to you'],
    tags:['person-model','identity'],
    hooks:{
      in:[{id:'copilot.person_model.read',intent:['ask'],tags:['read-only']}],
      out:[{id:'copilot.person_model.reply',wires_to:['ui.copilot.receive'],tags:['response']}]
    }
  }),
  _c('person_model.review','GET','/api/person-model/review',
    'Observations the co-pilot has proposed about the user — pending, never claims (§IP-5)',{
    grammar:['review queue','what have you noticed','pending observations'],tags:['person-model','review']
  }),
  _c('person_model.accept','POST','/api/person-model/accept',
    'USER-ONLY. Promotes an observation to a stated claim. No agent path exists (§IP-5)',{
    grammar:['accept observation'],tags:['person-model','review'],permissions:['user'],
    hooks:{in:[{id:'copilot.person_model.accept',intent:['action'],tags:['user-only']}],
           out:[{id:'copilot.person_model.node.stated',wires_to:['cortex.memory.insert'],tags:['identity']}]}
  }),
  _c('person_model.reject','POST','/api/person-model/reject',
    'Rejects a proposed observation. A reason is required (§IP-6)',{
    grammar:['reject observation'],tags:['person-model','review'],permissions:['user']
  }),
  _c('person_model.state','POST','/api/person-model/state',
    'The user states something about themselves — the ONLY route into trigger/sensitive/boundary',{
    grammar:['remember about me','i am','my value','my goal'],tags:['person-model','identity'],permissions:['user'],
    hooks:{in:[{id:'copilot.person_model.state',intent:['note','action'],tags:['user-only','stated-only-gate']}],
           out:[{id:'copilot.person_model.node.stated',wires_to:['cortex.memory.insert'],tags:['identity']}]}
  }),
  _c('person_model.connect','POST','/api/person-model/connect',
    'Typed edge between two model nodes — supports/tensions/causes/co_occurs',{tags:['person-model','lattice']}),
  _c('person_model.meaning','GET','/api/person-model/meaning',
    'Meaning-web lens — a projection over the lattice, not a nested graph',{
    grammar:['what does mean to me','meaning of'],tags:['person-model','lens']
  }),
  _c('person_model.chain','GET','/api/person-model/chain',
    'Session hash-chain integrity — reports breaks, attributed to the session',{
    grammar:['model history','session chain'],tags:['person-model','integrity']
  }),
  _c('person_model.export','GET','/api/person-model/export',
    'Everything held about the user, in one object',{
    grammar:['export my model','what do you have on me'],tags:['person-model'],permissions:['user']
  }),
  _c('person_model.forget','POST','/api/person-model/forget',
    'Archives a node with a required reason (§0.3 — never a silent delete)',{
    grammar:['forget that'],tags:['person-model'],permissions:['user']
  }),
  _c('person_model.purge','POST','/api/person-model/purge',
    'HARD DELETE of the whole model. Requires an explicit confirmation string',{
    tags:['person-model','destructive'],permissions:['user']
  }),
  _c('person_model.health','GET','/api/person-model/health','Person-model stats + chain state',{tags:['person-model']}),

  // ── OPPORTUNITY + CONTEXT ATLAS (0.39.272) ─────────────────────────────
  _c('opportunity.status','GET','/api/opportunity/status','Job/freelance pipeline: counts per stage and what waits on James',{grammar:['job status','applications','what needs me','opportunity status'],tags:['opportunity']}),
  _c('opportunity.profile.get','GET','/api/opportunity/profile','The job profile: skills, roles, floor, sources, per-platform policy',{tags:['opportunity']}),
  _c('opportunity.profile.set','POST','/api/opportunity/profile','Update the job profile (merge)',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.import_resume','POST','/api/opportunity/import-resume','Read a resume (.pdf/.docx/.txt/.md) into the profile; suggests skills',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.sources','GET','/api/opportunity/sources','Source types (public job APIs) and the configured sources',{tags:['opportunity']}),
  _c('opportunity.cycle','POST','/api/opportunity/cycle','Fetch sources, score, shortlist, draft the top N, due follow-ups',{grammar:['find jobs','job cycle','run the job search'],tags:['opportunity']}),
  _c('opportunity.rescore','POST','/api/opportunity/rescore','Re-rank everything not yet past SHORTLISTED after a profile change',{tags:['opportunity']}),
  _c('opportunity.followups','POST','/api/opportunity/followups','Mark submitted applications with no response past followUpDays and draft follow-ups',{tags:['opportunity']}),
  _c('opportunity.list','GET','/api/opportunity/list','List opportunities (?stage=&kind=&q=&limit=)',{tags:['opportunity']}),
  _c('opportunity.capture','POST','/api/opportunity/capture','Capture the job/gig/message open in a Clear Glass tab into the pipeline',{tags:['opportunity','clear-glass']}),
  _c('opportunity.show','GET','/api/opportunity/:id','One opportunity with its ledger and policy',{tags:['opportunity']}),
  _c('opportunity.approve','POST','/api/opportunity/:id/approve','James approves an application (user-only; approves the answers it used)',{tags:['opportunity','user-only'],permissions:['user']}),
  _c('opportunity.dismiss','POST','/api/opportunity/:id/dismiss','Dismiss an opportunity',{tags:['opportunity']}),
  _c('opportunity.draft','POST','/api/opportunity/:id/draft','Draft cover letter / proposal / Fiverr reply / follow-up from the editable templates',{tags:['opportunity']}),
  _c('opportunity.draft.edit','PUT','/api/opportunity/:id/draft/:kind','James edits a draft; the edit is what gets used',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.prepare','POST','/api/opportunity/:id/prepare','Open the application in Clear Glass and fill it; stops before submit',{tags:['opportunity','clear-glass']}),
  _c('opportunity.prepare_reply','POST','/api/opportunity/:id/prepare-reply','Type the approved reply into a Fiverr/Upwork thread; stops before send',{tags:['opportunity','clear-glass']}),
  _c('opportunity.submit','POST','/api/opportunity/:id/submit','James submits a prepared application (presses the button, checks for confirmation)',{tags:['opportunity','user-only'],permissions:['user']}),
  _c('opportunity.mark','POST','/api/opportunity/:id/mark','Record a response: RESPONDED / INTERVIEW / OFFER / REJECTED / ARCHIVED',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.answers','GET','/api/opportunity/answers','The answer bank for application questions',{tags:['opportunity']}),
  _c('opportunity.answers.add','POST','/api/opportunity/answers','James adds an approved answer',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.answers.approve','POST','/api/opportunity/answers/:id/approve','Approve a drafted answer for reuse',{tags:['opportunity','user-only'],permissions:['user']}),
  _c('opportunity.answers.remove','DELETE','/api/opportunity/answers/:id','Remove an answer',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.templates','GET','/api/opportunity/templates','Drafting templates (editable; placeholders are data)',{tags:['opportunity']}),
  _c('opportunity.templates.set','PUT','/api/opportunity/templates/:id','Edit a drafting template',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.templates.reset','DELETE','/api/opportunity/templates/:id','Reset a drafting template to its default',{tags:['opportunity'],permissions:['user']}),
  _c('opportunity.recipes.set','PUT','/api/opportunity/recipes/:host','Per-site selectors: replySelector, submitSelector',{tags:['opportunity']}),
  _c('context.directory','GET','/api/context/directory','Every memory system and graph: tables, row counts, what each is, which tool reads it',{grammar:['what do you remember','memory directory','where is memory'],tags:['context','memory']}),
  _c('context.search','GET','/api/context/search','One search across every memory system and graph (?q=&sources=&limit=&repoDir=)',{grammar:['search memory','remember when','find context'],tags:['context','memory']}),
  _c('context.get','GET','/api/context/get','The whole record behind a context hit (?source=&id=)',{tags:['context','memory']}),

  // ── INTROSPECT + RETRY ──────────────────────────────────────────────────
  _c('introspect.examine','POST','/api/introspect',
    'Examine the last answer against REAL signals — reflection score, contract shape, gaps, ledger. Never the model\u2019s own opinion',{
    grammar:['introspect','check your last answer','was that right','examine that response'],
    tags:['introspect','reflection'],
    hooks:{in:[{id:'copilot.introspect.examine',intent:['ask'],tags:['read-only']}],
           out:[{id:'copilot.introspect.verdict',wires_to:['ui.copilot.receive'],tags:['diagnosis']}]}
  }),
  _c('introspect.retry','POST','/api/introspect/retry',
    'Re-ask carrying the SPECIFIC finding that rejected the last answer, not "try again"',{
    grammar:['retry the response','try that again','redo that'],
    tags:['introspect','reflection'],
    hooks:{in:[{id:'copilot.introspect.retry',intent:['action'],tags:['user-initiated']}],
           out:[{id:'copilot.introspect.retried',wires_to:['lib.reflection.score'],tags:['diagnosis']}]}
  }),
  _c('introspect.health','GET','/api/introspect/health',
    'Which introspection signals are readable right now, and which are blind',{
    grammar:['introspect health','what can you check'],tags:['introspect','observability']
  }),

  // ── AGENT CAPABILITY ────────────────────────────────────────────────────
  _c('agent.capability','GET','/api/agents/capability',
    'Per-agent limits MEASURED from real outcomes, with the basis attached — declared vendor figures are marked unverified',{
    grammar:['agent limits','what can chatgpt take','agent capability','chunk size'],
    tags:['agents','capability','measured']
  }),
  // §0.39.271 C1 — NOT SERVED, kept (§0.3). lib/agent-capability.js calibrate() needs a probe(size)
  // that sends a live prompt of N tokens to the agent; no such probe is wired, and a
  // guessed one would spend real quota. Limits are measured from real outcomes (record())
  // and read at GET /api/agents/capability.
  Object.assign(_c('agent.calibrate','POST','/api/agents/calibrate',
    'Binary-search an agent\u2019s real input limit from live probes — NOT SERVED: no live probe is wired',{
    grammar:['calibrate agent','find the limit'],tags:['agents','capability','not-served'],permissions:['user']
  }),{served:false,notServed:'lib/agent-capability.js calibrate() needs a live probe(size) function; none is wired'}),

  // ── §0.39.271 C1 — served by copilot/server.js, missing from this registry ──
  // (declared ≠ served both ways: these 16 answered but were not declared; a registry
  // missing them left their command/capability nodes unwritten).
  _c('events','GET','/events','Server-sent events for the copilot UI',{tags:['sse']}),
  _c('agent.suite','GET','/api/agent/suite','The current agent and every hat',{grammar:['agent suite','hats']}),
  _c('agent.current','GET','/api/agent/current','Which agent copilot is wearing now',{grammar:['current agent']}),
  _c('agent.switch','POST','/api/agent/switch','Switch the worn agent/hat, then check it is reachable',{grammar:['switch agent','wear hat']}),
  _c('sessions.get','GET','/api/sessions/:id','One session (404 when unknown)'),
  _c('context.session','GET','/api/context/:id','The context snapshot copilot would send for a session'),
  _c('event','POST','/api/event','Add one event to the stream'),
  _c('bridge.deliver','POST','/bridge/deliver','Delivery from the retired Bridge path — still called'),
  _c('queue.health','GET','/api/queue/health','Every work queue\'s health'),
  _c('reword','POST','/api/reword','Reword a text (lib/reword)'),
  _c('activity','GET','/api/activity','What copilot has been up to (?hours=, ?since=, &text=1)',{grammar:['what have you been up to','activity']}),
  _c('prompt.resolve','GET','/api/prompt/resolve','Which backend a prompt with no backend would go to'),
  _c('prompt.tools','POST','/api/prompt/tools','A prompt with the full tool loop (all 109 tools unless a scope is given)',{grammar:['use tools']}),
  _c('channel','POST','/api/channel','Set the channel on every session'),
  _c('observe','POST','/api/observe','A UI confusion signal into the user model'),
  _c('person_model.correct','POST','/api/person-model/correct','Correct a person-model node',{tags:['person-model'],permissions:['user']}),

  // ── LEDGER WIRE ─────────────────────────────────────────────────────────
  _c('ledger.stream','GET','/ledger/stream',
    'Canonical component-ledger rows as SSE — the cross-process wire autopilot consumes',{
    grammar:['copilot ledger stream'],tags:['ledger','sse','observability'],
    hooks:{out:[{id:'copilot.ledger.stream',wires_to:['autopilot.ledger.consume','cortex.intelligence.event'],
                 tags:['cross-process','canonical-schema']}]}
  }),
];
module.exports={
  systemId:NS,version:V,port:3750,
  label:'COPILOT',purpose:'Sovereign co-pilot. Continuous stream. Dual cognition.',
  components,
  events:{
    emits:['copilot.booted','copilot.prompt.received','copilot.context.assembled','copilot.answered','copilot.stream.event','copilot.build.started','copilot.build.complete',
      // §2026-08-17 — every broadcast() is now ALSO a component-ledger row, so
      // these reach event_log, error_log and the pattern engine rather than
      // dying at the edge of the SSE client Set.
      'copilot.person_model.node.stated','copilot.person_model.observation.noted','copilot.person_model.session.ended'],
    handles:['ollama.job.complete','cortex.pattern.crystallized','orchestrator.shutdown'],
  },
};
