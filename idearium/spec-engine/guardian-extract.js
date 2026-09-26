'use strict';
/**
 * idearium/spec-engine/guardian-extract.js — chunk prose -> compiler-bridge input
 * UUID: idearium-spec-engine-guardian-extract-v1-0000-2026-0715-001
 *
 * §THE GAP THIS CLOSES — compiler-bridge.js's sectionsToYAMLSpec() can only
 * produce real `modules:`/`schemas:` when a section's content is already
 * structured YAML/JSON. Idearium's spec-engine chunks are free-text prose
 * (schema/api/events sections written by Mistral/ChatGPT/Claude as narrative,
 * not authored YAML), so compiler-bridge fell back to its honestly-labeled
 * 'unparsed-intent' placeholder on every real chunk-built spec. This module
 * is the missing "LLM extraction pass" compiler-bridge.js's own header says
 * doesn't exist yet.
 *
 * §NOT A SEPARATE, UNVERIFIED LLM CALL — reuses the exact same dispatch path
 * every text chunk already gets: chunk-dispatch.js's
 * dispatchChunkWithVerification() (QueueCompartment retry ladder + Detector
 * verification) wrapping agent-suite.js's buildChunkWithAgent() (Mistral ->
 * ChatGPT/Guardian -> Claude/Guardian). A Guardian-routed extraction chunk is
 * not a second-class path here any more than a chatgpt/claude text chunk is.
 *
 * §1.2 nothing silently fails — extraction failure returns { ok: false },
 * never falls through to compiler-bridge's placeholder module. A promote
 * that claims real code was built when Guardian actually escalated after
 * retries is exactly the stub-as-production failure mode idearium's own
 * conventions forbid (see compiler-bridge.js's own §1.3 note).
 */

import { dispatchChunkWithVerification } from './chunk-dispatch.js';
import { buildChunkWithAgent } from '../agent-suite/index.js';

const EXTRACT_PROMPT_HEADER = [
  'Extract a single YAML document with top-level keys "modules" and',
  '"schemas" from the spec sections below. Each module needs: id, name,',
  'description, kind (default "module"). Output ONLY valid YAML — no',
  'preamble, no markdown code fences, no commentary.',
].join(' ');

function _section(manifest, sectionId) {
  return manifest.chunks.find(c => c.sectionId === sectionId) || null;
}

/**
 * extractModulesViaGuardian(manifest, opts)
 *   manifest: spec-engine manifest ({ uuid, name, chunks: [...] })
 *   opts:     { specUuid, axioms=[], preferAgent='ollama' }
 * Returns: { ok, yaml, agent, attempts } | { ok: false, error, attempts }
 */
export async function extractModulesViaGuardian(manifest, opts = {}) {
  const schemaChunk = _section(manifest, 'schema');
  const apiChunk     = _section(manifest, 'api');
  const eventsChunk  = _section(manifest, 'events');

  if (!schemaChunk?.content && !apiChunk?.content && !eventsChunk?.content) {
    return { ok: false, error: 'no schema/api/events chunk content to extract from', attempts: 0 };
  }

  const prompt = [
    EXTRACT_PROMPT_HEADER,
    '',
    `## Schema\n${schemaChunk?.content || '(none)'}`,
    `## API\n${apiChunk?.content || '(none)'}`,
    `## Events\n${eventsChunk?.content || '(none)'}`,
  ].join('\n');

  // Not a real spec-engine chunk (no uuid, no disk slot) — a synthetic
  // identity for the QueueCompartment/Detector machinery to key its
  // retry-ladder state on. chunkIdx 999 keeps it out of the real 0-9 range.
  const fauxChunk = { chunkIdx: 999, chunkTitle: 'guardian-module-extraction', sectionTitle: 'guardian-module-extraction' };

  let result;
  try {
    result = await dispatchChunkWithVerification(prompt, fauxChunk, buildChunkWithAgent, {
      specUuid:    opts.specUuid || manifest.uuid,
      axioms:      opts.axioms || [],
      preferAgent: opts.preferAgent || 'ollama',
    });
  } catch (e) {
    return { ok: false, error: `dispatch threw: ${e.message}`, attempts: 0 };
  }

  if (!result.ok) {
    return { ok: false, error: result.error || 'guardian extraction escalated', attempts: result.attempts };
  }
  return { ok: true, yaml: result.text, agent: result.agent, attempts: result.attempts };
}

export default { extractModulesViaGuardian };
