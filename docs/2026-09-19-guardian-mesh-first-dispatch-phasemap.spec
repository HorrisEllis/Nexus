spec:
  meta:
    name: guardian-mesh-first-dispatch
    version: 0.1.0-phasemap
    status: "GUARDIAN SIDE BUILT 2026-09-19 (registry, ladder, mesh client, dispatcher hook, RAID feedback); default GUARDIAN_TRANSPORT=ncp-only so behaviour is unchanged. CLEAR GLASS SIDE BUILT (0.39.155) but ONLY VERIFIED against jsdom fixtures and a fake Electron, never a real site or real Electron. See code_base_scale and live_smoke_required."
    ask: "James: guardian should send jobs to the agent MESH (ClearDriver: DOM inject + mutation observer) and use the
      userscripts (NCP) as the FALLBACK. Today guardian -> NCP -> userscript. agentId + account manager + cookie vault for
      multiple accounts."
  today:
    guardian_to_userscript: "guardian/lib/dispatcher.js _doDispatch(): provider gate, ping gate, then
      ncp.pushActive(provider,{type:'GUARDIAN_JOB',jobId,prompt,content,tools,hat}); job -> 'delivered'; _armCompletionWatch.
      Completion returns as NCP GUARDIAN_COMPLETE handled by guardian/lib/ncp-handler.js (chat_log, response sink, bus)."
    clearglass_hooks_that_exist: "guardian already calls Clear Glass on :7702 (clear-glass-bridge.js dispatchBrowserCommand;
      POST /providers/<p>/start). Clear Glass exposes /agent-mesh/{route,spawn,view,routes}, /bridge/driver, /dom/query."
    mesh_reality: "AgentMesh.send() does NOT use ClearDriver: it calls copilot/lifeline dispatchToNcpAgent -> guardian NCP. this.driver
      and this.ctxMgr are assigned and never used. Reason (its own comments): ClearDriver._getWebContents matches the TOP-LEVEL window by
      title only and cannot reach the <webview> that spawned agent tabs (openBackgroundTab -> browser.html shell) put the page in."
    identity_today: "spawn(): contextId = guardianOwned ? 'ncp-<agent>' : 'mesh-<agent>-<random8>'; partition persist:ncp-<agent> or
      persist:mesh-<agent>-<accountId|default>; vault.restore({agentId,accountId,ses}); accountId via nexusOptions account manager.
      Guardian jobs carry NO account/agentId fields (guardian/lib/jobs.js)."
  traps:
    T1_loop: "mesh.route() -> _dispatchViaGuardian -> POST guardian /api/copilot/prompt -> job -> dispatcher. If the dispatcher
      sends to the mesh first, mesh->guardian->mesh loops forever. Break it: jobs created by the mesh are pinned to NCP
      (job.transport='ncp'), and the new mesh endpoint drives the DOM directly and never calls guardian."
    T2_duplicate_prompt: "If the mesh injected the prompt and then lost the response, auto-falling-back to NCP would send the SAME
      prompt to the AI twice. Fallback is allowed only when the mesh reports sent:false (pre-flight failure: no window, no webview,
      not logged in, selector missing). sent:true + no response => job fails explicitly; retry policy is guardian's existing one."
    T3_wrong_page: "ClearDriver falls back to getFocusedWebContents()||all[0] when no window title matches. An unmatched agentId
      would type into whatever page is focused. Must fail loudly instead."
    T4_two_actuators: "A tab running a userscript AND driven by the mesh could be actuated twice. Userscripts are passive unless they
      receive GUARDIAN_JOB, so the mesh owns a tab during a job and fallback targets an NCP-connected tab (or starts one on demand)."
    T5_untestable_here: "No Electron in the build sandbox. Driver/webview code can be unit-tested only against fake webContents; the
      live behaviour needs a smoke test on James's machine."
  phases:
    P1_driver: "ClearDriver resolves an agent's <webview> guest webContents (host window by agentId, guest = getType()==='webview');
      remove the focused/all[0] fallback (throw). Tests with fake webContents."
    P2_mesh_transport: "AgentMesh.sendViaDriver(): inject prompt (real input events), click send, MutationObserver injected via
      driver eval settles when streaming stops, returns {ok,text,chatUrl,account,agentId,sent}. Reuse AGENT_REGISTRY selectors first;
      lift proven per-provider logic from guardian/userscript-*.js only where the generic path proves insufficient."
    P3_endpoint: "Clear Glass POST /agent-mesh/send {provider,prompt,agentId?,accountId?,jobId,timeoutMs} -> sendViaDriver. No guardian call."
    P4_identity: "Deterministic agentId/contextId per (provider,accountId) = mesh-<provider>-<accountId>; partition persist:mesh-<provider>-<accountId>;
      vault.restore by {agentId,accountId}; job gains accountId/agentId; account = explicit job.accountId else the account manager's
      default for that provider; unknown account => fail loud, never a silent default."
    P5_guardian_transport: "guardian/lib/mesh-transport.js + dispatcher hook BEFORE the NCP branch. Policy GUARDIAN_TRANSPORT=
      mesh-first|ncp-first|ncp-only. Circuit breaker (N failures => skip mesh for T s). Records job.transport and
      job.transportFallbackReason. On mesh success, complete the job through the SAME completion path NCP uses (no second implementation)."
    P6_verify: "Real-process test with a fake Clear Glass server for guardian side; live smoke checklist for Electron side."
  decisions_needed:
    D1_default: "Default policy. Recommend shipping as ncp-first until the live smoke passes, then flip to mesh-first; env switch, no redeploy."
    D2_tabs: "Mesh tab and userscript tab for the same provider+account: separate (recommended, avoids T4) or shared."
    D3_account_choice: "How a job names an account: explicit accountId on the job (recommended) plus a per-provider default in the account manager."
    D3_decided_2026_09_23: "DECIDED by James (\"yes clearglass\"): Clear Glass owns accounts. Explicit job.accountId, else Clear Glass's per-provider default (options.accountDefaults), else earliest linked, else null. guardian/lib/cg-account-authority.js -> GET :7702/accounts/resolve; ladder falls back to NCP with account_authority_unreachable if Clear Glass is down. Login portals (clear-glass/src/accounts/login-portal.js) sign accounts into the exact persist:mesh-<provider>-<accountId> partition P4 names. v0.39.223."
  escalation_ladder_decided:
    james: "guardian is the source of truth for agents. job dispatch -> agent mesh, job queue, spawn a tab and inject into the agent's chat
      input -> archaeology + automatic DOM mapping diagnose and fix -> userscript -> user intervention via the guardian picker."
    built: "guardian/lib/agent-registry.js (source of truth: selectors, accounts, repair history, health), dispatch-ladder.js (decision logic),
      mesh-client.js (HTTP to :7702), hook in dispatcher.js before the NCP branch, picker request via bus 'guardian.picker.needed' + cockpit broadcast.
      Tests: test-guardian-dispatch-ladder 18/18."
    still_to_build_clearglass: "POST /agent-mesh/send (queue, spawn tab, driver inject, mutation-observer capture, returns {ok,text,sent,stage});
      POST /agent-mesh/diagnose (archaeology + DOM mapping -> repaired selectors); ClearDriver webview resolution and removal of its
      focused-window fallback; archaeology has its OWN copy of that broken page lookup; picker UI must listen for GUARDIAN_PICKER_NEEDED."
  raid_question:
    asked: "should every job from guardian be sent to RAID?"
    answer: "Three different things. RECORD (outcome feedback): yes, every job, fire-and-forget and fail-open; it was already sent for every job but never
      arrived (shape mismatch), now fixed and enriched with transport/tier/account/stage. ROUTE (rec. decide): yes, but only when the job does not pin a
      provider/account. GATE (_approveTool, a constitutional policy check): NO for plain chat prompts, YES for actions with blast radius (browser commands,
      builds, tool calls: already gated). Gating every prompt would make cortex/constitution a hard dependency of all dispatch (fail-closed today for browser)."
    bugs_found: "guardian's feedback body never matched cortex's handler (read {agent,outcome}, got {provider,ok}); the handler only nudged a cortex-local health
      number, not RAID's fitness weights; port 3748 was hardcoded. needs_user must not count as an agent failure."
  code_base_scale:
    james: "remember this is for coding entire code bases."
    consequences_found_and_handled: |
      1. INJECTION. Prompts are megabytes; the userscripts use execCommand('insertText') which chokes on that. The page library writes
         textareas in one native-setter call, tries a synthetic paste then CHUNKED insertText for rich editors, and ATTACHES bulk `content`
         as a file (input[type=file]) above `inlineMax` (120k chars), typing only the instruction. Everything is verified before sending.
      2. OUTPUT. The userscripts read answers with innerText, which drops the ``` fences and language tags. The mesh converts DOM->markdown
         keeping fenced code with language and indentation (longer fence when the code contains ```), lists, tables, headings.
      3. TIME. Generation runs for many minutes. Completion = "not generating AND quiet"; stall guard; "Continue generating" is clicked and
         segments joined. Jobs are ASYNC and POLLED, and IDEMPOTENT by jobId, so a guardian restart re-attaches instead of resending.
      4. SENT IS THREE-VALUED (true | false | null). Slow acceptance of a big paste is normal, so an unconfirmed send is null and is NEVER resent.
      5. SILENT LIMITS FOUND IN THE EXISTING PIPELINE, now fixed: ncp-handler truncated every response to 100,000 chars (now
         GUARDIAN_MAX_RESPONSE_CHARS, default 5M, flagged via job.responseTruncated); the completion watch was a fixed 90s then REQUEUED (=resent the
         prompt) with no activity awareness (now an idle window, default 15 min, re-armed by guardian.job.chunk/confirmed,
         GUARDIAN_COMPLETION_TIMEOUT_MS); Clear Glass built request bodies with `body += chunk`, corrupting multi-byte characters that straddle chunk
         boundaries (reproduced in test MC-001c; fixed with setEncoding, and in mesh-client); mesh timeout is GUARDIAN_MESH_TIMEOUT_MS, default 1h.
      6. ClearDriver/archaeology fell back to the FOCUSED window for an unknown agent. Now ONE shared page-resolver (clear-glass/src/driver/
         page-resolver.js) resolves the <webview> guest and throws no_window/no_webview; mesh-*/ncp-* ids can never fall back. Non-agent ids keep
         the legacy fallback because the interactive tabs may rely on it.
  built_clearglass:
    - "clear-glass/src/mesh/page/agent-page.js  (in-page library, window.__cgAgent)"
    - "clear-glass/src/mesh/dom-transport.js    (host: jobs, lanes per agent, poll, diagnose, read)"
    - "clear-glass/src/driver/page-resolver.js  (shared lookup)"
    - "agent-mesh.js: spawn({contextId}) deterministic + never joins the userscript tab; sendViaDom/getDomJob/diagnoseDom/readDomJob"
    - "main/index.js: POST /agent-mesh/send (202, async), GET /agent-mesh/job, POST /agent-mesh/diagnose, POST /agent-mesh/read"
  live_smoke_required: |
    Nothing below has been run against a real site or real Electron. Do this before flipping GUARDIAN_TRANSPORT=mesh-first:
      a. one short prompt per provider (claude, chatgpt, gemini, perplexity, mistral, deepseek, grok): does it inject, send, and return text?
      b. a ~100k-char prompt (inline) and a ~1M-char `content` (attachment path): does each provider accept the file input, and does
         `input[type=file]` exist without clicking the attach button? (Some sites only create it on click: the attach path then fails
         with attach_failed => userscript fallback.)
      c. an answer with several code blocks: fences + language intact? Does each site's "Continue" label match /^(continue( generating)?|keep going)$/i?
      d. selector drift drill: break a selector in the registry and confirm diagnose repairs it and the repair persists.
      e. kill and restart guardian mid-generation: the job must re-attach, not resend.
      f. two accounts of one provider: distinct tabs/partitions/cookies (mesh-<provider>-<account>).
  known_limits:
    - "Login detection is heuristic (password field / login URL). Captcha detection is heuristic. Rate-limit detection is a regex on the answer tail."
    - "Auto DOM mapping proposes replacements for the failing selector only, never rewrites working ones; it cannot find a response container on a page with no assistant message yet."
    - "Streaming detection uses generic indicators (data-is-streaming, a visible Stop control, class *streaming*). A provider using none of these is caught by the quiet-period rule instead."
    - "Provider size limits are unknown: a paste over a site's limit would surface as inject_failed/attach_failed or a rate-limit message, not as silent truncation, but the mesh cannot know the limit in advance."
  wake_wiring_0_39_156:
    what: "The wake userscript's listener, agent hint and model-output wake detection do not exist on the mesh path. Hint injected by guardian/lib/wake-hint.js
      (mesh transport only, sent prompt only, byte-identical, once per tab), agent-initiated wake answered by guardian/lib/wake-loop.js (mesh completions only,
      depth-capped), wake replies for agent wakes seen in userscript tabs pinned to the userscript (transport ncp) with accountId. See HANDOFF-2026-09-19-mesh-first-dispatch.md addendum."
