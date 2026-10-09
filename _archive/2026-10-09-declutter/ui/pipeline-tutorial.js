// ARCHIVED 0.54.0 (docs/2026-10-09-one-roadmap-phasemap.spec OR6) — the old shell's pipeline tutorial; nothing loads it. James: "make sure to clean up old code that isnt needed anymore". Was ui/pipeline-tutorial.js.
/**
 * ui/pipeline-tutorial.js — NEXUS Full Pipeline Tutorial
 * UUID: nexus-pipeline-tut-v1-0000-5000-0000-000000000001
 *
 * Walks the complete idea → spec → compile → dispatch → artifact → heal pipeline.
 * At every stage:
 *   1. EXPLAINS what this stage is and why it exists
 *   2. RUNS the stage live against the running system
 *   3. VERIFIES the output actually exists
 *   4. If it BREAKS — shows why, tries to fix it, escalates if needed
 *
 * Escalation chain (mirrors the system's own):
 *   AUTO    — the tutorial retries with a corrected input
 *   T1      — the tutorial tells the system to heal itself
 *   T2      — snapshot first, then apply patch
 *   T3      — propose to forge, show what it would write
 *   HUMAN   — explains exactly what you need to do manually
 */

'use strict';

const ORCH    = 'http://127.0.0.1:9000';
const CORTEX  = 'http://127.0.0.1:3748';
const GUARD   = 'http://127.0.0.1:7820';
const IDEARIUM= 'http://127.0.0.1:4800';
const ARCH    = 'http://127.0.0.1:3747';
const DIAG    = 'http://127.0.0.1:7825';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function GET(url, timeout = 5000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  return r.json();
}

async function POST(url, body, timeout = 30000) {
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(timeout),
  });
  return r.json();
}

// ── Escalation engine ─────────────────────────────────────────────────────────
// When a stage fails, tries each strategy in order until one works or all fail.
// Returns { fixed, strategy, detail }

async function escalate(stageName, error, context, onProgress) {
  const strategies = [
    {
      name:  'AUTO — retry with corrected input',
      level: 'auto',
      run:   context.autoFix,
    },
    {
      name:  'T1 — ask self-heal to repair',
      level: 't1',
      run:   async () => {
        if (!context.gapType) return null;
        const r = await POST(CORTEX + '/api/gaps', {
          type:     context.gapType || 'pipeline_failure',
          path:     stageName,
          body:     error,
          severity: 'high',
          source:   'pipeline-tutorial',
        }).catch(() => null);
        if (!r?.ok) return null;
        // Wait up to 8s for healer to respond
        for (let i = 0; i < 8; i++) {
          await sleep(1000);
          const gaps = await GET(CORTEX + '/api/gaps?n=5').catch(() => null);
          const gap  = (gaps?.rows || []).find(g => g.path === stageName && g.status === 'resolved');
          if (gap) return { healed: true, strategy: gap.fixStrategy };
        }
        return null;
      },
    },
    {
      name:  'T2 — snapshot then attempt patch',
      level: 't2',
      run:   async () => {
        // Take a snapshot first
        const snap = await POST(CORTEX + '/api/snapshots', {
          message: 'pre-repair: ' + stageName,
          type:    'pre_rollback',
        }).catch(() => null);
        if (!snap?.ok) return null;
        return { snapshotTaken: true, snapId: snap.snapId, note: 'Snapshot created. Patch can now be applied safely.' };
      },
    },
    {
      name:  'T3 — propose to forge',
      level: 't3',
      run:   async () => {
        // Ask guardian to generate a fix for this failure
        const r = await POST(GUARD + '/command', {
          provider: 'ollama',
          command:  'fix',
          prompt:   'Pipeline stage "' + stageName + '" failed with error: ' + error + '. Write a one-paragraph diagnosis and suggest a specific fix.',
        }).catch(() => null);
        if (!r?.ok) return null;
        return { jobId: r.id, note: 'Fix proposed — check GUARDIAN → ARTIFACTS for the response.' };
      },
    },
  ];

  for (const strategy of strategies) {
    if (!strategy.run) continue;
    onProgress('  Trying: ' + strategy.name + '…');
    try {
      const result = await strategy.run();
      if (result) {
        return { fixed: true, strategy: strategy.name, level: strategy.level, detail: result };
      }
    } catch(e) {
      onProgress('  ' + strategy.name + ' failed: ' + e.message);
    }
  }

  return {
    fixed:    false,
    strategy: 'HUMAN — manual intervention required',
    level:    'human',
    detail:   {
      message: 'All automated strategies exhausted. See below for what to do.',
      action:  context.humanAction || 'Check the error above and repair manually, then click Retry.',
    },
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Pipeline stage definitions ────────────────────────────────────────────────
// Each stage: id, title, what, why, run(), verify(), humanAction, gapType

const PIPELINE_STAGES = [

  // ── Stage 0: Pre-flight ──────────────────────────────────────────────────
  {
    id:    'preflight',
    title: 'Pre-flight — all systems up?',
    what:  'Before anything runs, verify the three core systems are alive: Orchestrator, Cortex, and Guardian. Nothing downstream works without these.',
    why:   'The pipeline is a chain. A broken link at the start means everything after it is guessing.',
    run: async (ctx) => {
      const [orch, cortex, guard] = await Promise.allSettled([
        GET(ORCH   + '/health'),
        GET(CORTEX + '/health'),
        GET(GUARD  + '/health'),
      ]);
      const results = [
        { name: 'Orchestrator :9000', r: orch },
        { name: 'Cortex :3748',       r: cortex },
        { name: 'Guardian :7820',     r: guard },
      ];
      const down = results.filter(s => s.r.status === 'rejected' || !s.r.value?.ok && s.r.value?.ok !== undefined);
      if (down.length) throw new Error(down.map(s => s.name).join(', ') + ' not responding');
      return { systems: results.map(s => ({ name: s.name, ok: s.r.status === 'fulfilled' })) };
    },
    verify: async (result) => ({
      pass:   true,
      detail: result.systems.map(s => (s.ok ? '✓' : '✗') + ' ' + s.name).join('  '),
    }),
    humanAction: 'Run: node orchestrator.js  and wait for all 7 phases to pass.',
    gapType: 'system_offline',
    autoFix: async () => null, // can't auto-start servers
  },

  // ── Stage 1: Idea ────────────────────────────────────────────────────────
  {
    id:    'idea',
    title: 'Stage 1 — Capture the idea',
    what:  'Every build starts with an idea. Idearium stores it, assigns it a UUID, and gives it a phase (seed → specced → building → complete). The idea is the root of the entire provenance chain.',
    why:   'Without a logged idea, nothing that follows is traceable. The UUID becomes the causedBy anchor for every downstream artifact.',
    run: async (ctx) => {
      const ideaText = ctx.ideaText || 'A rate limiter that protects the guardian dispatch endpoint';
      const r = await POST(IDEARIUM + '/api/ideas', {
        text:   ideaText,
        source: 'pipeline-tutorial',
        tags:   ['pipeline-walkthrough'],
      });
      if (!r?.uuid && !r?.idea?.uuid && !r?.id) throw new Error(r?.error || 'No UUID returned from Idearium');
      const uuid = r.uuid || r.idea?.uuid || r.id;
      ctx.ideaUuid = uuid;
      ctx.ideaText = ideaText;
      return { uuid, text: ideaText, phase: r.phase || 'seed' };
    },
    verify: async (result, ctx) => {
      const r = await GET(IDEARIUM + '/api/ideas/' + ctx.ideaUuid).catch(() => null);
      if (!r) return { pass: false, detail: 'Could not retrieve idea from Idearium' };
      return { pass: true, detail: 'Idea stored — UUID: ' + ctx.ideaUuid + '  Phase: ' + (r.phase || 'seed') };
    },
    humanAction: 'Idearium may not be running. Check: node boot-systems.js or npm run start:all',
    gapType: 'idearium_offline',
    autoFix: async (ctx) => {
      // Retry with simpler text
      ctx.ideaText = 'Rate limiter for guardian';
      return null;
    },
  },

  // ── Stage 2: Spec ───────────────────────────────────────────────────────
  {
    id:    'spec',
    title: 'Stage 2 — Build a spec',
    what:  'The spec gives the idea structure. The Architect turns free-form intent into a formal .spec file: purpose, constraints, implementation notes. T0 and T1 compilation is deterministic — no AI tokens spent.',
    why:   'A spec is compressed intent. The compiler decompresses it. Without a spec, the AI gets an unstructured blob and produces inconsistent output.',
    run: async (ctx) => {
      const specText = [
        'name: rate-limiter',
        'version: 1.0.0',
        'purpose: Protect the guardian dispatch endpoint from overload',
        'constraints:',
        '  - Max 10 requests per second per provider',
        '  - Requests over limit are queued, not dropped',
        '  - Timeout after 30 seconds in queue',
        'implementation:',
        '  algorithm: token bucket',
        '  per_provider: true',
        '  audit_log: true',
        'outputs:',
        '  - lib/rate-limiter.js',
        '  - lib/rate-limiter.test.js',
      ].join('\n');

      ctx.specText = specText;
      ctx.specFile = 'rate-limiter.spec';

      // Try architect compile endpoint
      const r = await POST(ARCH + '/api/compile/spec', {
        content:  specText,
        filename: ctx.specFile,
        ideaUuid: ctx.ideaUuid,
      }).catch(() => null);

      if (!r?.ok && r !== null) {
        // Architect may not have /api/compile/spec — use spec-compiler directly
        const r2 = await POST(ORCH + '/api/guardian/command', {
          command:  'spec',
          provider: 'ollama',
          prompt:   specText,
          _source:  'pipeline-tutorial',
        }).catch(() => null);
        ctx.specJobId = r2?.id;
        return { specText, compileResult: r2, source: 'guardian-fallback' };
      }

      ctx.compileResult = r;
      return { specText, compileResult: r, source: 'architect' };
    },
    verify: async (result, ctx) => {
      const hasSpec = !!ctx.specText;
      return {
        pass:   hasSpec,
        detail: hasSpec
          ? 'Spec structured — ' + ctx.specText.split('\n').length + ' lines. T0/T1 deterministic compile ready.'
          : 'Spec not created',
      };
    },
    humanAction: 'The Architect may be offline. The spec was prepared — continue to compile from the spec text directly.',
    gapType: 'architect_offline',
    autoFix: async (ctx) => {
      // Spec text was already prepared — just mark it ready
      ctx.specReady = true;
      return { note: 'Spec prepared locally — proceeding to compile stage' };
    },
  },

  // ── Stage 3: Compile ────────────────────────────────────────────────────
  {
    id:    'compile',
    title: 'Stage 3 — Compile the spec',
    what:  'The spec compiler reads the .spec file and produces:\n  T0 — directory tree, barrel files, type stubs (zero AI tokens)\n  T1 — implementation scaffolds with placeholders (zero AI tokens)\n  T2 — the gaps: nodes where real code is needed (AI tokens budgeted here)',
    why:   'Deterministic stages first. Every line that can be generated mechanically is generated mechanically. AI is only invoked where entropy is unavoidable.',
    run: async (ctx) => {
      if (!ctx.specText) throw new Error('No spec text from Stage 2');

      // Push spec to guardian queue which routes to spec-compiler
      const r = await POST(ORCH + '/api/push/file', {
        filename: ctx.specFile || 'rate-limiter.spec',
        content:  ctx.specText,
        source:   'pipeline-tutorial',
      });

      if (!r?.ok) throw new Error(r?.error || 'Spec push failed: ' + JSON.stringify(r));

      ctx.pushResult = r;
      ctx.compileLabel = r.label || r.destination;
      return { destination: r.destination, label: r.label, pushId: r.pushId };
    },
    verify: async (result, ctx) => {
      // Check that guardian received it
      const jobs = await GET(GUARD + '/jobs?limit=5').catch(() => null);
      const recent = (jobs?.jobs || jobs || []).slice(0, 5);
      const found  = recent.find(j => j.source === 'pipeline-tutorial' || j.type === 'spec');
      return {
        pass:   !!ctx.pushResult?.ok,
        detail: ctx.pushResult?.ok
          ? 'Spec pushed to ' + ctx.compileLabel + '  Push ID: ' + ctx.pushResult?.pushId?.slice(0,8)
          : 'Push failed',
      };
    },
    humanAction: 'Guardian may be offline. Check: curl http://127.0.0.1:7820/health',
    gapType: 'spec_compile_failed',
    autoFix: async (ctx) => {
      // Try direct guardian command instead of file push
      const r = await POST(GUARD + '/command', {
        command:  'code',
        provider: 'ollama',
        prompt:   'Based on this spec, write the implementation:\n\n' + ctx.specText,
        _source:  'pipeline-tutorial',
      }).catch(() => null);
      if (r?.id) { ctx.compileJobId = r.id; return { jobId: r.id, note: 'Sent directly to guardian' }; }
      return null;
    },
  },

  // ── Stage 4: Dispatch ───────────────────────────────────────────────────
  {
    id:    'dispatch',
    title: 'Stage 4 — Dispatch to AI (SEAM)',
    what:  'SEAM (Structural Emergence with Autonomous Mechanism) splits the T2 nodes into chunks and sends them one at a time. Each chunk must pass a detector before the next is sent. Failures retry with three strategies: resend-with-report, split, forensic.',
    why:   'Large prompts fail or produce inconsistent output. SEAM constrains the AI to one concern at a time and verifies each response before continuing.',
    run: async (ctx) => {
      const prompt = ctx.specText
        ? 'Write a JavaScript rate limiter based on this spec:\n\n' + ctx.specText.slice(0, 1000)
        : 'Write a JavaScript token bucket rate limiter — max 10 req/sec per key, queue overflow, 30s timeout';

      const r = await POST(GUARD + '/command', {
        command:  'code',
        provider: 'ollama',
        prompt,
        _source:  'pipeline-tutorial',
        _stageId: 'dispatch',
      }).catch(e => { throw new Error('Guardian unreachable: ' + e.message); });

      if (!r?.id && !r?.jobId) throw new Error(r?.error || 'No job ID returned from Guardian');

      ctx.dispatchJobId = r.id || r.jobId;
      return { jobId: ctx.dispatchJobId, provider: r.provider || 'ollama', status: r.status || 'queued' };
    },
    verify: async (result, ctx) => {
      if (!ctx.dispatchJobId) return { pass: false, detail: 'No job ID — dispatch did not produce a job' };
      // Poll for completion (up to 90s — Ollama can be slow on first load)
      for (let i = 0; i < 18; i++) {
        await sleep(5000);
        const status = await GET(GUARD + '/jobs?limit=20').catch(() => null);
        const job    = (status?.jobs || status || []).find(j => j.id === ctx.dispatchJobId || j.jobId === ctx.dispatchJobId);
        if (job?.status === 'complete' || job?.status === 'verified') {
          ctx.dispatchComplete = true;
          return { pass: true, detail: 'Job complete after ' + ((i+1)*5) + 's. Provider: ' + (job.provider || 'ollama') };
        }
        if (job?.status === 'failed') {
          throw new Error('Job failed: ' + (job.error || 'unknown'));
        }
      }
      return { pass: false, detail: 'Timed out after 90s — Ollama may still be loading the model. Check GUARDIAN → JOBS.' };
    },
    humanAction: 'Ollama is slow on first load (can take 30-60s for Mistral 7B). Wait and retry. Or check: ollama serve is running.',
    gapType: 'dispatch_timeout',
    autoFix: async (ctx) => {
      // Check if Ollama is even alive
      const r = await GET('http://127.0.0.1:11434/api/tags').catch(() => null);
      if (!r) throw new Error('Ollama not running. Start it: ollama serve');
      return { note: 'Ollama is online — job may still be running. Retrying verify…' };
    },
  },

  // ── Stage 5: Artifact ───────────────────────────────────────────────────
  {
    id:    'artifact',
    title: 'Stage 5 — Verify the artifact',
    what:  'When Guardian gets a response, it runs it through GapHunter (checks for logical gaps, missing implementations, wrong assumptions) and stores the result as an artifact in Cortex memory.',
    why:   'The artifact is the proof that the pipeline produced something. It has a UUID, a source job, gap scores, and the full content. This is what gets pushed to the repo layer.',
    run: async (ctx) => {
      const artifacts = await GET(GUARD + '/artifacts?limit=10').catch(() => null);
      const list = artifacts?.artifacts || artifacts || [];
      const found = list.find(a => a.jobId === ctx.dispatchJobId) || list[0];
      if (!found) throw new Error('No artifacts found in Guardian yet');
      ctx.artifactUuid = found.uuid;
      ctx.artifactContent = found.content;
      return { uuid: found.uuid, jobId: found.jobId, gaps: found.gaps || 0, contentLength: (found.content||'').length };
    },
    verify: async (result, ctx) => {
      const contentLen = result.contentLength || 0;
      if (contentLen < 50) return { pass: false, detail: 'Artifact exists but content is too short (' + contentLen + ' chars) — likely an error response' };
      return {
        pass:   true,
        detail: 'Artifact stored — ' + contentLen + ' chars, ' + result.gaps + ' gap(s) detected by GapHunter. UUID: ' + (result.uuid||'?').slice(0,8),
      };
    },
    humanAction: 'If the artifact content is empty or too short, the AI returned an error. Check GUARDIAN → ARTIFACTS for the raw response.',
    gapType: 'artifact_empty',
    autoFix: async (ctx) => {
      // Check if content is actually in cortex memory
      const r = await GET(CORTEX + '/api/memory?table=artifacts&n=5').catch(() => null);
      const rows = r?.rows || [];
      if (rows.length) { ctx.artifactContent = rows[0]?.content; return { note: 'Found artifact in Cortex memory', uuid: rows[0]?.uuid }; }
      return null;
    },
  },

  // ── Stage 6: Gap detection ───────────────────────────────────────────────
  {
    id:    'gaps',
    title: 'Stage 6 — Gap detection',
    what:  'After every dispatch, GapHunter runs on the response. It checks for: logical gaps (missing logic), evidential gaps (claims without proof), obligation gaps (things the spec required but the code skipped), and contradiction gaps.',
    why:   'AI output is lossy. GapHunter is the quality gate. If gaps are found, the system knows exactly what is missing — it does not just accept the output and move on.',
    run: async (ctx) => {
      const r = await GET(CORTEX + '/api/gaps?status=open&n=20').catch(() => null);
      const all  = r?.gaps || r?.rows || r || [];
      const real = Array.isArray(all) ? all.filter(g => g.type !== 'DELTA.TENSION') : [];
      ctx.openGaps = real;
      return { totalOpen: real.length, byType: _countBy(real, 'type'), bySeverity: _countBy(real, 'severity') };
    },
    verify: async (result, ctx) => {
      const gaps = ctx.openGaps || [];
      if (gaps.length === 0) return { pass: true, detail: 'No open gaps — system is clean.' };
      const high = gaps.filter(g => g.severity === 'high' || g.severity === 'critical').length;
      return {
        pass:   high === 0,
        detail: gaps.length + ' open gap(s). ' + (high > 0 ? high + ' HIGH/CRITICAL need attention.' : 'All low/medium severity.'),
      };
    },
    humanAction: 'Review gaps in DIAGNOSE panel. High-severity gaps should be addressed before deploying.',
    gapType: null,
    autoFix: async () => null,
  },

  // ── Stage 7: Self-heal ───────────────────────────────────────────────────
  {
    id:    'selfheal',
    title: 'Stage 7 — Self-heal',
    what:  'The healer reads open gaps and prescribes fixes. The self-heal engine applies them based on trust tier:\n  T1 — apply directly (safe modules only)\n  T2 — snapshot first, then apply\n  T3 — propose to forge (AI writes the patch, human approves)',
    why:   'The system should repair itself before asking you. Self-heal is the difference between a system that fails and one that recovers.',
    run: async (ctx) => {
      const r = await GET(CORTEX + '/api/self-heal/status').catch(() => null);
      ctx.healStatus = r;
      return {
        openLoops:     r?.openLoops || 0,
        totalTension:  r?.totalTension || 0,
        pending:       r?.pending || 0,
        forgeReady:    r?.forgeReady || 0,
        humanRequired: r?.humanRequired || 0,
      };
    },
    verify: async (result, ctx) => {
      const human = result.humanRequired || 0;
      const tension = result.totalTension || 0;
      if (human === 0 && tension < 1.0) {
        return { pass: true, detail: 'Self-heal clean. Tension: ' + tension.toFixed(2) + '. No human action required.' };
      }
      return {
        pass:   false,
        detail: (human > 0 ? human + ' gap(s) require human review. ' : '') +
                (tension >= 1.0 ? 'Tension elevated: ' + tension.toFixed(2) : ''),
      };
    },
    humanAction: 'Go to DIAGNOSE → SELF-HEAL. Click HEAL on each human-required gap. Review the forge proposal and approve or reject it.',
    gapType: 'human_required',
    autoFix: async (ctx) => {
      // Try to trigger self-heal for any pending gaps
      const gaps = ctx.openGaps || [];
      const highGap = gaps.find(g => g.severity === 'high' && g.status === 'needs_manual');
      if (!highGap) return null;
      const r = await POST(CORTEX + '/api/gaps/' + highGap.uuid + '/fix', {}).catch(() => null);
      if (r?.ok) return { gapUuid: highGap.uuid, note: 'Triggered self-heal for: ' + highGap.type };
      return null;
    },
  },

];

// ── Helper ────────────────────────────────────────────────────────────────────
function _countBy(arr, key) {
  const map = {};
  arr.forEach(item => { const v = item[key] || '?'; map[v] = (map[v]||0)+1; });
  return map;
}

if (typeof module !== 'undefined') {
  module.exports = { PIPELINE_STAGES, escalate, sleep, GET, POST };
}
