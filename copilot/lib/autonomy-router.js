'use strict';
/**
 * copilot/lib/autonomy-router.js — co-pilot's conversational access to CA1-CA7
 * UUID: nexus-copilot-autonomy-router-v1-0000-2026-0809-001
 * Version: 2.0.0
 *
 * James: "yes [loosen it]. but have it a process, like ask for confirmation
 * before committing, to account for misunderstandings. it also needs to
 * update the models of me and itself... Baysesian updating?"
 *
 * §THREE CHANGES from v1, all real, none cosmetic:
 *
 * 1. LOOSER MATCHING. v1 was tested against 12 natural phrasings and matched
 *    7 — filler words ("please", "the", "for me"), synonyms ("build" vs
 *    "make"), and reordering all broke it. Patterns widened to tolerate
 *    common filler/synonyms. Still regex, not true NLP — said so plainly,
 *    not oversold as "now it understands anything."
 *
 * 2. PROPOSE-THEN-CONFIRM. Every STATE-CHANGING action (schedule, set/revert
 *    a setting, build a command, start/stop autonomy) now returns a proposal
 *    and waits for the next message in the same session to confirm or
 *    reject, instead of firing immediately. Read-only queries (what's
 *    scheduled, list triggers, what can you do, read a setting) still answer
 *    directly — asking "did you mean 'what can you do'?" has no
 *    misunderstanding to protect against and would just be friction. A
 *    pending proposal lives per-session with a 3-minute TTL; a stale one is
 *    silently dropped rather than executed late on a re-used "yes."
 *
 * 3. BOTH MODELS UPDATED ON EVERY CONFIRM/REJECT. §8.6 — reuses what already
 *    exists rather than building two new things:
 *      - USER model: copilot/lib/user-model.js's real recordIntent(), the
 *        same hook every other real intent already uses. A confirmed
 *        "schedule X every N minutes" is evidence about how James phrases
 *        requests, same as any other observed intent.
 *      - SELF model (co-pilot's OWN model, not James's): a genuinely new
 *        piece, copilot/lib/intent-learning.js — Bayesian-ish confidence per
 *        PATTERN (not per claim about a person), built by mirroring user-
 *        model.js's exact confirm/decay math rather than inventing new
 *        formulas. A rejection costs more than a confirmation earns (0.15
 *        down vs 0.10 up) — a confidently wrong match is worse than a miss,
 *        the same philosophy grammar-router.js's own confidence floor uses.
 */

const learning = require('./intent-learning');

const CONFIRM_TTL_MS = 3 * 60 * 1000;
const _pending = new Map();   // sessionId -> { patternId, execute, prompt, proposedAt }

function _isAffirm(p) { return /^\s*(yes|yep|yeah|confirm|do it|go ahead|sure|correct|right|ok|okay)\b/i.test(p); }
function _isDeny(p) { return /^\s*(no|nope|cancel|nevermind|never mind|stop|wrong|don'?t)\b/i.test(p); }

/**
 * checkPending(sessionId, prompt, opts) — if this session has a live
 * proposal AND this prompt reads as yes/no, resolve it. Returns a result or
 * null (no pending proposal, or this prompt isn't a yes/no — falls through
 * to normal routing, so a rejection can be followed by an unrelated new
 * request in the same breath without being swallowed).
 */
async function checkPending(sessionId, prompt, opts = {}) {
  const pend = _pending.get(sessionId);
  if (!pend) return null;
  if (Date.now() - pend.proposedAt > CONFIRM_TTL_MS) { _pending.delete(sessionId); return null; }

  if (_isAffirm(prompt)) {
    _pending.delete(sessionId);
    let result;
    try { result = await pend.execute(); }
    catch (e) { return { text: `Tried to do that, but it failed: ${e.message}`, detail: { error: e.message } }; }
    learning.recordOutcome(pend.patternId, 'confirmed');
    try { (opts.userModel || require('./user-model')).recordIntent(`autonomy.${pend.patternId}`, pend.prompt, opts.channel); } catch (_) {}
    return { text: result.text, detail: result.detail };
  }
  if (_isDeny(prompt)) {
    _pending.delete(sessionId);
    learning.recordOutcome(pend.patternId, 'rejected');
    return { text: 'Okay, cancelled — not done.', detail: { cancelled: true, patternId: pend.patternId } };
  }
  return null;   // not a yes/no — let it fall through to normal routing
}

function _propose(sessionId, patternId, prompt, confirmText, execute) {
  _pending.set(sessionId, { patternId, execute, prompt, proposedAt: Date.now() });
  const conf = learning.getConfidence(patternId);
  // §2026-08-12 — James: "the co-pilot feels stiff." Found it: confirmText
  // is already a real question ("Schedule 'X' every 5 minutes?"), and this
  // function was appending a second, identical " Confirm?" onto every
  // single proposal regardless of content — the exact kind of templated
  // repetition that makes something feel like a form instead of a
  // conversation. Dropped. The hedge (only shown when confidence is
  // genuinely low) shortened to match how a person actually talks, not a
  // liability disclaimer.
  const hedge = conf < 0.4 ? " (not totally sure I've got this right —" : '';
  const text = hedge ? `${confirmText}${hedge} let me know if I misread it)` : confirmText;
  return { text, detail: { pending: true, patternId, confidence: conf } };
}

async function route(prompt = '', opts = {}) {
  const p = prompt.trim();
  const sessionId = opts.sessionId || '_no_session';

  // A pending confirmation from the last turn takes priority over parsing this one as a new request.
  const pendingResult = await checkPending(sessionId, p, opts);
  if (pendingResult) return pendingResult;

  try {
    // ── what can you do — read-only, answers directly ───────────────────────
    if (/\b(what can you do|what are you capable of|tell me what you can( do|help with)|what are your tools|list (your )?(tools|capabilities)|what can you help with)\b/i.test(p)) {
      const cap = opts.capabilities || require('./capabilities');
      const r = cap.whatCanIDo();
      const autonomyNote = ' Plus autonomy: I can schedule recurring tasks, react to conditions, change and revert system settings, build my own commands for things I can do, and run a constant background check on open problems.';
      return { text: r.text + autonomyNote, detail: { capabilities: r.systems, total: r.total } };
    }

    // ── CA1 scheduler ──────────────────────────────────────────────────────
    let m = p.match(/^\s*(?:can you |could you |please |hey nexus,?\s*)*schedule\s+(?:the\s+)?(.+?)\s+every\s+(\d+)\s*(second|minute|hour)s?\b/i);
    if (m) {
      const name = m[1].trim(), n = m[2], unit = m[3].toLowerCase();
      return _propose(sessionId, 'ca1.schedule', p, `Schedule "${name}" every ${n} ${unit}(s)?`, async () => {
        const scheduler = opts.scheduler || require('../../lib/scheduler');
        const unitMs = { second: 1000, minute: 60000, hour: 3600000 }[unit];
        const r = scheduler.schedule({ id: name, name, everyMs: unitMs * parseInt(n, 10), fn: async () => ({ ranBy: 'copilot-scheduled', name }) });
        return { text: r.ok !== false ? `Scheduled "${name}" every ${n} ${unit}(s).` : `Couldn't schedule that: ${r.reason || 'unknown reason'}.`, detail: r };
      });
    }
    if (/\b(what'?s scheduled|list scheduled tasks|show (my )?scheduled tasks)\b/i.test(p)) {
      const scheduler = opts.scheduler || require('../../lib/scheduler');
      const tasks = scheduler.list ? scheduler.list() : [];
      return { text: tasks.length ? `${tasks.length} scheduled task(s): ${tasks.map(t => t.name).join(', ')}.` : 'Nothing scheduled right now.', tasks };
    }
    m = p.match(/^\s*cancel scheduled\s+(.+)$/i);
    if (m) {
      const name = m[1].trim();
      return _propose(sessionId, 'ca1.cancel', p, `Cancel scheduled "${name}"?`, async () => {
        const scheduler = opts.scheduler || require('../../lib/scheduler');
        const r = scheduler.cancel ? scheduler.cancel(name) : { ok: false };
        return { text: r.ok ? `Cancelled "${name}".` : `Couldn't cancel "${name}" — not found.`, detail: r };
      });
    }

    // ── idearium: log an idea ─────────────────────────────────────────────
    // §2026-08-11 — James: "use co-pilot to log ideas to idearium." The one
    // real design point, not cosmetic: origin MUST be 'user', never 'agent'.
    // idea-provenance.js's whole reason for existing is one enforced rule —
    // an agent can never accept its own proposal — and that restriction is
    // for CO-PILOT's own proposals, not James's. Mislabeling his ideas as
    // agent-origin would wrongly subject them to a rule meant for a
    // different kind of thing. No confirmation gate here (unlike CA1/CA5/
    // CA6/CA7 above): logging an idea just writes a 'proposed' row into a
    // review queue — nothing executes, nothing changes system behavior, the
    // review step is the actual gate, later, by a human.
    m = p.match(/^\s*(?:log|add|save)\s+(?:this\s+)?idea(?:\s+to idearium)?\s*[:\-]?\s*(.+)$/i);
    if (m) {
      const text = m[1].trim();
      const ip = opts.ideaProvenance || require('../../lib/idea-provenance');
      const r = ip.propose({ text, origin: 'user', about: 'nexus', effort: 'unknown' });
      return { text: r.ok ? `Logged to idearium: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" (slug: ${r.slug}).` : `Couldn't log that: ${(r.errors || [r.reason]).join('; ')}.`, detail: r };
    }

    // ── CA2 triggers — read-only ─────────────────────────────────────────────
    if (/\b(what triggers are active|list triggers|show (my )?triggers)\b/i.test(p)) {
      const triggers = opts.triggers || require('../../lib/triggers');
      const list = triggers.list ? triggers.list() : [];
      return { text: list.length ? `${list.length} active trigger(s): ${list.map(t => t.name).join(', ')}.` : 'No triggers armed right now.', triggers: list };
    }

    // ── CA5 system control ────────────────────────────────────────────────
    m = p.match(/^\s*(?:please\s+)?(?:set|change)\s+(?:the\s+)?([\w.-]+)\s+(?:to|=)\s+(.+?)\s+for\s+(?:the\s+)?([\w.-]+)\s*$/i);
    if (m) {
      const key = m[1].trim(), value = m[2].trim(), sys = m[3].trim();
      return _propose(sessionId, 'ca5.set', p, `Set "${key}" to "${value}" for ${sys}?`, async () => {
        const sc = opts.systemControl || require('../../lib/system-control');
        const r = await sc.setSetting(sys, key, value);
        return { text: r.ok ? `Set "${key}" to "${value}" for ${sys} (was: ${r.prior ?? 'unset'}).` : `Couldn't set that: ${r.reason || 'denied'}.`, detail: r };
      });
    }
    m = p.match(/^\s*what(?:'s| is)\s+(?:the\s+)?([\w.-]+)\s+set to for\s+(?:the\s+)?([\w.-]+)\s*\??\s*$/i);
    if (m) {
      const sc = opts.systemControl || require('../../lib/system-control');
      const v = sc.getSetting(m[2].trim(), m[1].trim());
      return { text: v === null ? `"${m[1].trim()}" isn't set for ${m[2].trim()}.` : `${m[1].trim()} for ${m[2].trim()} is currently "${v}".`, value: v };
    }
    m = p.match(/^\s*revert\s+(?:the\s+)?([\w.-]+)\s+for\s+(?:the\s+)?([\w.-]+)\s*$/i);
    if (m) {
      const key = m[1].trim(), sys = m[2].trim();
      return _propose(sessionId, 'ca5.revert', p, `Revert "${key}" for ${sys} to its previous value?`, async () => {
        const sc = opts.systemControl || require('../../lib/system-control');
        const r = await sc.revertSetting(sys, key);
        return { text: r.ok ? `Reverted ${key} for ${sys} back to "${r.value}".` : `Couldn't revert: ${r.reason}.`, detail: r };
      });
    }

    // ── CA6 self-building commands ────────────────────────────────────────
    m = p.match(/^\s*(?:hey nexus,?\s*)?(?:can you |could you |please )?(?:make|build)(?:\s+me)?\s+a\s+command\s+for\s+([\w.-]+)\s+to\s+(.+?)[.!?]?\s*$/i);
    if (m) {
      const component = m[1].trim(), ability = m[2].trim();
      return _propose(sessionId, 'ca6.build', p, `Build a command for ${component} to ${ability}?`, async () => {
        const cb = opts.commandBuilder || require('../../lib/command-builder');
        const r = await cb.buildCommand({ component, ability });
        return { text: r.ok ? `Built "${r.name}" — resolves to ${r.capability.id}. You can run it by name now.` : `Couldn't build that: ${r.reason}.`, detail: r };
      });
    }
    m = p.match(/^\s*run command\s+(\S+)\s*$/i);
    if (m) {
      const name = m[1].trim();
      return _propose(sessionId, 'ca6.run', p, `Run "${name}"?`, async () => {
        const cb = opts.commandBuilder || require('../../lib/command-builder');
        const r = await cb.runCommand(name, {});
        return { text: r.ok ? `Ran "${name}".` : `Couldn't run "${name}": ${r.reason || 'unknown'}.`, detail: r };
      });
    }
    if (/\b(list my commands|what commands (have|has) (i|copilot) (made|built)|show (my )?self[- ]built commands)\b/i.test(p)) {
      const cb = opts.commandBuilder || require('../../lib/command-builder');
      const list = cb.listCommands ? cb.listCommands() : [];
      return { text: list.length ? `${list.length} self-built command(s): ${list.map(c => c.name).join(', ')}.` : 'No self-built commands yet — try "make me a command for <system> to <ability>".', commands: list };
    }

    // ── CA7 constant autonomy ─────────────────────────────────────────────
    if (/\b(start|enable|turn on)\s+(constant )?autonomy\b/i.test(p)) {
      return _propose(sessionId, 'ca7.start', p, 'Start running constant autonomy in the background?', async () => {
        const ca = opts.constantAutonomy || require('../../lib/constant-autonomy');
        const r = ca.start({});
        return { text: `Constant autonomy started — polling every ${(r.everyMs || 60000) / 1000}s.`, detail: r };
      });
    }
    if (/\b(stop|disable|turn off)\s+(constant )?autonomy\b/i.test(p)) {
      return _propose(sessionId, 'ca7.stop', p, 'Stop constant autonomy?', async () => {
        const ca = opts.constantAutonomy || require('../../lib/constant-autonomy');
        ca.stop();
        return { text: 'Constant autonomy stopped.' };
      });
    }
    if (/\b(autonomy status|what have you (been )?check(ed|ing) on your own|are you running autonomously)\b/i.test(p)) {
      const ca = opts.constantAutonomy || require('../../lib/constant-autonomy');
      const st = ca.status();
      return { text: st.running ? `Running — ${st.cycles} cycle(s) so far. Last: ${st.lastResult ? st.lastResult.stage : 'none yet'}.` : `Not running. ${st.cycles} cycle(s) total historically.`, detail: st };
    }

    return null;   // no match — fall through to the LLM
  } catch (e) {
    return null;   // §1.2 — never block the conversation over an autonomy-layer error
  }
}

function _resetForTest() { _pending.clear(); }

module.exports = { route, checkPending, _resetForTest, MODULE_ID: 'copilot-autonomy-router', VERSION: '2.0.0' };
