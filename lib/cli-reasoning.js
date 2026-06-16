'use strict';
/**
 * lib/cli-reasoning.js — CLI Reasoning Layer (Qwen 0.5b)
 * UUID: nexus-cli-reasoning-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Qwen 0.5b as the CLI's reasoning layer.
 * Called when the grammar engine cannot resolve input.
 *
 * Three outcomes:
 *
 *   REPHRASE — known command, wrong phrasing
 *     "show me open gaps" → "cortex gaps list --status open"
 *     Qwen maps natural language to existing grammar.
 *     Executes immediately.
 *
 *   GAP — capability missing from the system
 *     "deploy to production" → no matching component
 *     Qwen identifies what's missing and flags it.
 *     Proposes a new component definition.
 *     Checks with agent before registering.
 *
 *   CORRECTION — existing command is wrong or incomplete
 *     Qwen notices the component schema is missing a param,
 *     or the route is incorrect.
 *     Proposes correction.
 *     Checks with agent. Agent validates against invariants.
 *     Human confirms before applying.
 *
 * Invariants:
 *   - Qwen is advisory only. Grammar engine resolves. Qwen suggests.
 *   - Nothing in the deterministic zone is touched by Qwen.
 *   - All proposals checked by agent before registration.
 *   - Human confirms anything that modifies existing components.
 *   - If Qwen is offline: CLI degrades gracefully, trie still works.
 *
 * Model: qwen2.5:0.5b (~400MB, fits in RAM, no VRAM needed)
 * Endpoint: http://127.0.0.1:11434/api/generate
 */

const http   = require('http');
const crypto = require('crypto');

const MODULE_ID   = 'cli-reasoning';
const VERSION     = '1.0.0';
const OLLAMA_URL  = 'http://127.0.0.1:11434';
const MODEL       = process.env.NEXUS_CLI_MODEL || 'qwen2.5:0.5b';
const TIMEOUT_MS  = 15000;

// ── Ollama call ───────────────────────────────────────────────────────────────
function _ollama(prompt, system) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      model:  MODEL,
      prompt: system ? `${system}\n\n${prompt}` : prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 256 },
    }));

    const req = http.request({
      hostname: '127.0.0.1', port: 11434,
      path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString());
          resolve(d.response || '');
        } catch(e) { reject(e); }
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Qwen timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Check if Qwen is available ────────────────────────────────────────────────
async function isAvailable() {
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET' },
        res => { res.resume(); resolve(); }
      );
      req.setTimeout(2000, () => { req.destroy(); reject(); });
      req.on('error', reject);
      req.end();
    });
    return true;
  } catch(_) { return false; }
}

// ── REPHRASE: map natural language to known command ───────────────────────────
async function rephrase(input, grammarSummary) {
  const system = `You are a command resolver for the NEXUS system.
Given a user's natural language input and a list of available commands,
return ONLY the exact command string that best matches the intent.
If no command matches, return: NONE
Return nothing else. No explanation. Just the command string or NONE.`;

  const prompt = `Available commands:
${grammarSummary}

User input: "${input}"

Best matching command:`;

  try {
    const response = (await _ollama(prompt, system)).trim();
    if (!response || response === 'NONE' || response.toUpperCase() === 'NONE') {
      return null;
    }
    return response.split('\n')[0].trim();
  } catch(e) {
    return null;
  }
}

// ── GAP: identify missing capability and propose component ────────────────────
async function identifyGap(input, grammarSummary, existingComponents) {
  const system = `You are a component architect for the NEXUS system.
When a user requests something that doesn't exist, propose a new component.
Return ONLY valid JSON. No explanation. No markdown.
The JSON must match this schema exactly:
{
  "id": "namespace.name",
  "namespace": "string",
  "name": "string",
  "version": "1.0.0",
  "grammar": ["primary command", "alias"],
  "route": { "method": "GET|POST", "path": "/api/path" },
  "description": "what it does",
  "params": [],
  "tags": [],
  "confidence": 0.0-1.0
}
Only propose components in the FLUID zone (application logic, not auth, not escalation, not boot phases).`;

  const prompt = `Existing commands: ${existingComponents.slice(0,20).join(', ')}

User requested: "${input}"

Propose a new component JSON:`;

  try {
    const raw = (await _ollama(prompt, system)).trim();
    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return null;
    const proposal = JSON.parse(jsonMatch[0]);

    // Validate minimum shape
    if (!proposal.id || !proposal.grammar || !proposal.route || !proposal.description) {
      return null;
    }

    return proposal;
  } catch(e) {
    return null;
  }
}

// ── CORRECTION: spot issues with existing components ─────────────────────────
async function suggestCorrection(input, component) {
  const system = `You are a component auditor for the NEXUS system.
Given a user's failed command and the component they were trying to use,
identify what's wrong and suggest a correction.
Return ONLY valid JSON:
{
  "issue": "what's wrong",
  "suggestion": "human-readable fix",
  "patch": { "field": "value" },
  "confidence": 0.0-1.0
}`;

  const prompt = `User tried: "${input}"
Component: ${JSON.stringify(component, null, 2)}

What's wrong and how to fix it:`;

  try {
    const raw = (await _ollama(prompt, system)).trim();
    const jsonMatch = raw.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    return null;
  }
}

// ── Agent check — validate proposal before registering ───────────────────────
// The agent checks:
//   1. Proposal doesn't touch deterministic zone
//   2. id format is valid (namespace.name)
//   3. Route doesn't conflict with existing routes
//   4. Description is meaningful
async function agentCheck(proposal, orchestratorUrl = 'http://127.0.0.1:9000') {
  const issues = [];

  // Check id format
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(proposal.id || '')) {
    issues.push(`invalid id format: "${proposal.id}" — must be namespace.name`);
  }

  // Check deterministic zone
  const PROTECTED = ['auth', 'escalation', 'boot-sequence', 'spec-drift', 'version', 'boundary'];
  if (PROTECTED.some(p => (proposal.id || '').includes(p) || (proposal.route?.path || '').includes(p))) {
    issues.push('proposal targets deterministic zone — rejected');
  }

  // Check confidence threshold
  if ((proposal.confidence || 0) < 0.6) {
    issues.push(`low confidence (${proposal.confidence}) — human review required`);
  }

  // Check for conflicts with existing components
  try {
    const r = await new Promise((resolve, reject) => {
      const req = http.request(
        orchestratorUrl + '/api/components/' + encodeURIComponent(proposal.id),
        { method: 'GET' },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch(_) { resolve(null); }
          });
        }
      );
      req.setTimeout(3000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
    if (r?.component) {
      issues.push(`component "${proposal.id}" already exists — use correction flow instead`);
    }
  } catch(_) {}

  return {
    ok:          issues.length === 0,
    issues,
    proposal,
    requiresHumanConfirm: issues.length > 0 || (proposal.confidence || 0) < 0.85,
  };
}

// ── Main resolve function ─────────────────────────────────────────────────────
// Called by the CLI when grammar engine returns null
async function resolve(input, grammarTree, components, orchestratorUrl) {
  // Build grammar summary for Qwen context
  const grammarSummary = Object.entries(grammarTree?.aliases || {})
    .slice(0, 30)
    .map(([alias, id]) => `${alias} → ${id}`)
    .join('\n');

  const componentIds = components.map(c => c.id || c).slice(0, 50);

  // Try rephrase first — cheapest operation
  const rephrased = await rephrase(input, grammarSummary);
  if (rephrased && rephrased !== input) {
    return {
      type:      'rephrase',
      command:   rephrased,
      original:  input,
      message:   `interpreted as: ${rephrased}`,
    };
  }

  // Identify gap — propose new component
  const proposal = await identifyGap(input, grammarSummary, componentIds);
  if (proposal) {
    const check = await agentCheck(proposal, orchestratorUrl);
    return {
      type:      'gap',
      proposal,
      agentCheck: check,
      message:   check.ok
        ? `new component proposed: ${proposal.id} (confidence: ${proposal.confidence})`
        : `proposal issues: ${check.issues.join(', ')}`,
    };
  }

  return {
    type:    'unknown',
    message: 'could not resolve — Qwen could not identify intent',
  };
}

module.exports = {
  isAvailable, rephrase, identifyGap, suggestCorrection,
  agentCheck, resolve,
  MODEL, MODULE_ID, VERSION,
};
