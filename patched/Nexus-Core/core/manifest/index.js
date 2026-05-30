// ═══════════════════════════════════════════════════
// NEXUS — Manifest Generator
// core/manifest/index.js
//
// Natural language → task graph → spec
// Constitutional Law IV: temp:0, schema-constrained.
// GapHunter runs after every generation.
// Reject + retry loop on schema violation.
// ═══════════════════════════════════════════════════

'use strict';

const Ajv     = require('ajv');
const schema  = require('../../schemas/manifest.schema.json');
const { kernel }   = require('../../foundation/kernel');
const { raid }     = require('../raid');
const { store }    = require('../index');

const ajv      = new Ajv({ strict: false });
const validate = ajv.compile(schema);

const MAX_RETRY = 3;

// ── System prompt (Law IV: schema-constrained) ────
function buildSystemPrompt() {
  return `You are NEXUS manifest generator. Your output is ALWAYS valid JSON conforming exactly to the nexus manifest schema. No prose. No markdown. No explanation. Only JSON.

Constitutional constraints:
- temp: 0 (you must include this field, value must be 0)
- schemaEnforced: true (required)
- All node types must be: project|module|schema|test|spec|doc|api|worker
- id format: "mf-{timestamp}"
- Every node must have id, type, title

Output format: raw JSON object, no wrapper, no backticks.`;
}

function buildUserPrompt(input, context = {}) {
  const ctx = context.existingNodes
    ? `\n\nExisting nodes to build on:\n${JSON.stringify(context.existingNodes, null, 2)}`
    : '';
  return `Generate a NEXUS build manifest for:\n\n${input}${ctx}\n\nRespond with only the JSON manifest object.`;
}

// ── Parser — natural language → task graph ─────
function parseNaturalLanguage(input) {
  // Pattern extraction before LLM — reduces token cost
  const patterns = {
    lang:      input.match(/\b(typescript|javascript|python|rust|go|java|php|csharp)\b/i)?.[1]?.toLowerCase(),
    framework: input.match(/\b(express|fastapi|django|actix|gin|spring|laravel|nextjs|react|vue)\b/i)?.[1]?.toLowerCase(),
    db:        input.match(/\b(postgres|postgresql|mysql|sqlite|mongodb|redis|dynamodb)\b/i)?.[1]?.toLowerCase(),
    features:  (input.match(/\b(auth(?:entication)?|jwt|oauth|rate.lim|cache|queue|websocket|rest|graphql|grpc)\b/gi) || []).map(f => f.toLowerCase()),
    tests:     /test|spec|jest|vitest|pytest|rspec/i.test(input),
    docs:      /doc(?:s|umentation)?|readme|openapi|swagger/i.test(input),
  };
  return patterns;
}

// ── Generator ─────────────────────────────────
class ManifestGenerator {
  constructor() {
    this._gapHunter = null; // injected after gate module loads
  }

  async generate(input, opts = {}) {
    const { context = {}, requestEventId } = opts;
    const parsed = parseNaturalLanguage(input);

    kernel.emit('manifest.generating', {
      inputLength: input.length,
      parsed,
      temp: 0,
    }, { causedBy: requestEventId });

    // Get best agent for manifest generation (schema_gen task)
    let decision;
    try {
      decision = await raid.decide({
        type: 'schema_gen',
        tokens: Math.ceil(input.length / 3) + 800,
        _eventId: requestEventId,
      });
    } catch (e) {
      kernel.emit('manifest.error', { reason: 'no_agent_available', error: e.message });
      throw e;
    }

    const system = buildSystemPrompt();
    const user   = buildUserPrompt(input, context);

    // Retry loop — reject on schema violation
    let manifest = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        const raw = await this._callAgent(decision.agent, system, user, attempt, lastError);
        manifest  = this._parseJSON(raw);

        // Schema validation — Law IV enforcement
        const valid = validate(manifest);
        if (!valid) {
          lastError = ajv.errorsText(validate.errors);
          kernel.emit('manifest.rejected', {
            attempt,
            errors: validate.errors,
            errorText: lastError,
          });
          continue; // retry with error context
        }

        // Stamp metadata
        manifest.id   = manifest.id   || `mf-${Date.now()}`;
        manifest.tick = manifest.tick || 0;
        manifest.temp = 0; // always enforce

        // Store in JAA FileStore (content-addressed)
        const hash = await store.fileStore.put(manifest);
        await store.fileRefs.set(`manifest:latest`, hash);
        await store.fileRefs.set(`manifest:${manifest.id}`, hash);

        kernel.emit('manifest.validated', {
          id:       manifest.id,
          nodes:    manifest.nodes?.length || 0,
          hash,
          attempt,
        });

        // Run GapHunter on the manifest
        if (this._gapHunter) {
          await this._gapHunter.scanManifest(manifest);
        }

        kernel.emit('manifest.ready', {
          id:    manifest.id,
          nodes: manifest.nodes?.length || 0,
          hash,
        });

        return manifest;

      } catch (e) {
        lastError = e.message;
        kernel.emit('manifest.error', { attempt, error: e.message });
        if (attempt === MAX_RETRY) throw e;
      }
    }

    throw new Error(`Manifest generation failed after ${MAX_RETRY} attempts: ${lastError}`);
  }

  async _callAgent(agentId, system, user, attempt, prevError) {
    // Import agent at call time (Law III: via bus event in full impl)
    const { getAgent } = require('../../agents');
    const agent = getAgent(agentId);

    const prompt = attempt > 1 && prevError
      ? `${system}\n\nPrevious attempt failed schema validation:\n${prevError}\n\nFix and retry.\n\n${user}`
      : `${system}\n\n${user}`;

    kernel.emit('agent.prompt.ready', { agentId, tokens: Math.ceil(prompt.length / 3.8), attempt });

    return agent.complete({ prompt, temperature: 0, maxTokens: 4096 });
  }

  _parseJSON(raw) {
    // Strip any markdown fences that might leak through
    const cleaned = raw
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    return JSON.parse(cleaned);
  }

  setGapHunter(gh) { this._gapHunter = gh; }
}

const generator = new ManifestGenerator();
module.exports = { ManifestGenerator, generator };
