// ═══════════════════════════════════════════════════
// NEXUS — Gate Runner
// gate/runner.js
//
// Executes test suite per manifest node.
// Tests generated dynamically from manifest spec.
// Recursive expansion on edge cases via GapHunter.
// Schema validation + token bounds + run checks.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel }    = require('../foundation/kernel');
const { raid }      = require('../core/raid');
const { getAgent }  = require('../agents');
const { gapHunter } = require('./gap-finder');

// ── Test Generator ────────────────────────────────
// Generates test suite from manifest node spec.
// Law IV: tests are schema-derived, not hand-written.
class TestGenerator {
  async generate(node, manifest) {
    kernel.emit('gate.tests.generating', { nodeId: node.id, type: node.type });

    const prompt = buildTestPrompt(node, manifest);

    const decision = await raid.decide({ type: 'test_gen', tokens: 1200, _eventId: null });
    const agent    = getAgent(decision.agent);
    const raw      = await agent.complete({ prompt, temperature: 0.1, taskType: 'test_gen' });

    // Parse generated tests
    const tests = this._parseTests(raw, node.id);

    kernel.emit('gate.tests.generated', {
      nodeId:    node.id,
      testCount: tests.length,
      agent:     decision.agent,
    });

    return tests;
  }

  _parseTests(raw, nodeId) {
    // Extract test cases from LLM output
    // Look for structured test descriptions
    const tests = [];
    const lines  = raw.split('\n');
    let current  = null;

    for (const line of lines) {
      // Detect test headers: "Test N:", "## Test", "- should X"
      const headerMatch = line.match(/^(?:##\s+|test\s*\d*:?\s*|[-*]\s+(?:should|it\s|expect))/i);
      if (headerMatch) {
        if (current) tests.push(current);
        current = {
          id:      `${nodeId}-t${tests.length + 1}`,
          name:    line.replace(/^[-*#\s]+/,'').trim(),
          nodeId,
          status:  'pending',
          depth:   0,
          code:    '',
        };
      } else if (current) {
        current.code += line + '\n';
      }
    }
    if (current) tests.push(current);

    // If no structured tests found, treat whole output as one test
    if (!tests.length && raw.trim()) {
      tests.push({
        id:     `${nodeId}-t1`,
        name:   `${nodeId} integration test`,
        nodeId,
        status: 'pending',
        depth:  0,
        code:   raw,
      });
    }

    return tests;
  }
}

// ── Gate Runner ───────────────────────────────────
class GateRunner {
  constructor() {
    this._generator = new TestGenerator();
    this._results   = new Map();  // testId → result
    this._running   = false;
  }

  // Run all gates for a manifest
  async runAll(manifest, generatedCode = {}) {
    if (this._running) {
      kernel.emit('gate.already_running', {});
      return;
    }
    this._running = true;
    this._results.clear();

    kernel.emit('gate.suite.started', {
      manifestId: manifest.id,
      nodes:      manifest.nodes?.length || 0,
    });

    let passed = 0, failed = 0, total = 0;

    for (const node of (manifest.nodes || [])) {
      const code = generatedCode[node.id] || '';

      // Generate tests for this node
      let tests = [];
      try {
        tests = await this._generator.generate(node, manifest);
      } catch (e) {
        kernel.emit('gate.tests.error', { nodeId: node.id, error: e.message });
        tests = this._fallbackTests(node);
      }

      // Run each test
      for (const test of tests) {
        total++;
        kernel.emit('gate.running', {
          testId:     test.id,
          name:       test.name,
          nodeId:     node.id,
          manifestId: manifest.id,
        });

        const result = await this._runTest(test, node, manifest, code);
        this._results.set(test.id, result);

        if (result.passed) {
          passed++;
          kernel.emit('gate.passed', {
            testId:     test.id,
            name:       test.name,
            nodeId:     node.id,
            manifestId: manifest.id,
            duration:   result.duration,
          });

          // Recursive expansion: expand passing test into edge cases
          if (result.expandable) {
            const edgeCases = await this._expandEdgeCases(test, node, manifest, code);
            tests.push(...edgeCases);
          }

        } else {
          failed++;
          kernel.emit('gate.failed', {
            testId:     test.id,
            name:       test.name,
            nodeId:     node.id,
            manifestId: manifest.id,
            error:      result.error,
            agentId:    result.agentId,
            failureMode: result.failureMode,
          });

          // GapHunter: scan the failure
          if (code) {
            await gapHunter.scanCode(code, manifest, node.id);
          }
        }
      }
    }

    this._running = false;

    kernel.emit('gate.suite.complete', {
      manifestId: manifest.id,
      passed,
      failed,
      total,
      passRate: total ? passed / total : 0,
    });

    return { passed, failed, total };
  }

  // Run a single test via SISO verification
  async _runTest(test, node, manifest, code) {
    const t0 = Date.now();

    try {
      // SISO verification: ask Ollama to verify correctness
      const verifyPrompt = buildVerifyPrompt(test, node, manifest, code);
      const decision     = await raid.decide({ type: 'test_gen', tokens: 800 });
      const agent        = getAgent(decision.agent);
      const raw          = await agent.complete({ prompt: verifyPrompt, temperature: 0.05, taskType: 'verification' });

      const passed      = /^PASS/i.test(raw.trim());
      const summary     = raw.slice(0, 300);
      const expandable  = /edge case|boundary|additional/i.test(raw);

      return {
        testId:    test.id,
        passed,
        summary,
        duration:  Date.now() - t0,
        agentId:   decision.agent,
        expandable,
        failureMode: passed ? null : classifyFailure(raw),
      };

    } catch (e) {
      return {
        testId:      test.id,
        passed:      false,
        error:       e.message,
        duration:    Date.now() - t0,
        failureMode: 'runner_error',
      };
    }
  }

  // Expand a passing test into edge cases (recursive)
  async _expandEdgeCases(test, node, manifest, code) {
    if (test.depth >= 3) return []; // max recursive depth

    try {
      const prompt   = buildEdgeCasePrompt(test, node, manifest);
      const decision = await raid.decide({ type: 'test_gen', tokens: 600 });
      const agent    = getAgent(decision.agent);
      const raw      = await agent.complete({ prompt, temperature: 0.2, taskType: 'test_gen' });

      const generator = new TestGenerator();
      const expanded  = generator._parseTests(raw, node.id);
      return expanded.map(t => ({ ...t, depth: test.depth + 1, parentId: test.id }));
    } catch {
      return [];
    }
  }

  // Fallback tests when generation fails
  _fallbackTests(node) {
    return [{
      id:     `${node.id}-fallback`,
      name:   `${node.id} schema compliance`,
      nodeId: node.id,
      status: 'pending',
      depth:  0,
      code:   `// Verify ${node.id} (${node.type}) exists and exports expected interface`,
    }];
  }

  get results()  { return Object.fromEntries(this._results); }
  get running()  { return this._running; }
}

// ── Prompts ───────────────────────────────────────
function buildTestPrompt(node, manifest) {
  return `Generate tests for this NEXUS manifest node.
Node: ${JSON.stringify(node, null, 2)}
Project: ${manifest.nodes?.[0]?.title || 'unknown'}
Language: ${manifest.nodes?.find(n => n.lang)?.lang || 'javascript'}

Generate 3-5 test cases covering:
1. Happy path
2. Error handling
3. Edge cases
4. Schema compliance

Format each test as:
## Test name
[test code or description]`;
}

function buildVerifyPrompt(test, node, manifest, code) {
  return `NEXUS Gate Verification — SISO check.
Test: ${test.name}
Node: ${node.id} (${node.type})
${code ? `\nCode:\n\`\`\`\n${code.slice(0, 2000)}\n\`\`\`` : ''}

Verify: does this code satisfy the test requirements?
Check: schema compliance, error handling, correct exports, no undefined refs.

Respond: PASS or FAIL then 1-line reason.
If PASS and you see potential edge cases, add: "Edge cases: ..."`;
}

function buildEdgeCasePrompt(test, node, manifest) {
  return `Test "${test.name}" passed for node "${node.id}".
Generate 2-3 edge case tests that might reveal boundary failures.
Same format: ## Test name / [test description]`;
}

function classifyFailure(output) {
  const lower = output.toLowerCase();
  if (lower.includes('schema'))    return 'schema_violation';
  if (lower.includes('import'))    return 'missing_import';
  if (lower.includes('undefined')) return 'undefined_reference';
  if (lower.includes('type'))      return 'type_error';
  if (lower.includes('syntax'))    return 'syntax_error';
  return 'logic_error';
}

const gateRunner = new GateRunner();
module.exports = { GateRunner, TestGenerator, gateRunner };
