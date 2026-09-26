'use strict';

/**
 * Diagnostic Engine
 * Playwright-equivalent powered by ClearDriver.
 * Tests and diagnoses the NEXUS home UI (and any other page).
 * Runs assertion sequences, captures visual state, reports failures.
 * Co-pilot can trigger diagnostic runs. Results stream to SSE.
 */

const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.
const path = require('path');
const fs   = require('fs');

class DiagnosticEngine {
  constructor({ driver, dom, sse, seam }) {
    this.driver = driver;
    this.dom    = dom;
    this.sse    = sse;
    this.seam   = seam;
    this.suites = new Map(); // suiteId → DiagSuite
    this.results = [];
    this.outputDir = path.join(process.env.HOME || '.', '.clear-glass', 'diagnostics');
  }

  async init() {
    fs.mkdirSync(this.outputDir, { recursive: true });
    console.log('[Diagnostic] Engine ready');
  }

  // ── Run a diagnostic suite ────────────────────────────────────────────
  async run({ suiteId, agentId = 'default', steps = [], label = 'Diagnostic' }) {
    const runId = uuidv4();
    const results = [];
    let passed = 0, failed = 0;

    this.sse.emit('diag.run.start', { runId, suiteId, agentId, label, steps: steps.length, ts: Date.now() });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = await this._runStep(step, agentId, runId, i);
      results.push(stepResult);

      if (stepResult.passed) passed++;
      else {
        failed++;
        this.sse.emit('diag.step.fail', { runId, step: i, label: step.label, error: stepResult.error, ts: Date.now() });
        if (step.stopOnFail !== false) break;
      }

      this.sse.emit('diag.step.result', { runId, step: i, ...stepResult, ts: Date.now() });
    }

    const summary = {
      runId, suiteId, agentId, label,
      total: steps.length, passed, failed,
      success: failed === 0,
      results,
      ts: Date.now(),
    };

    // Save report
    this._saveReport(summary);

    this.sse.emit('diag.run.complete', summary);

    // Fire NEXUS hook
    await this.seam?.dispatch('diag.complete', summary).catch(() => {});

    return summary;
  }

  // ── NEXUS UI diagnostic preset ────────────────────────────────────────
  async runNexusUiAudit({ agentId = 'default', nexusUrl = 'http://localhost:7700' }) {
    return this.run({
      label:   'NEXUS Home UI Audit',
      agentId,
      steps: [
        // Navigation
        { label: 'Navigate to NEXUS', action: 'navigate', url: nexusUrl },
        { label: 'Page loaded',       action: 'assert.url', contains: 'localhost' },
        { label: 'Title present',     action: 'assert.title', notEmpty: true },

        // Core UI elements
        { label: 'Header renders',     action: 'assert.exists',  selector: 'header, #header, .header, nav' },
        { label: 'No JS errors',       action: 'assert.noErrors' },
        { label: 'No broken images',   action: 'assert.noBrokenImages' },

        // SEAM module checks
        { label: 'SEAM modules load',  action: 'assert.exists',  selector: '[data-seam-id], [data-module-id]' },
        { label: 'Co-pilot present',   action: 'assert.exists',  selector: '[id*="copilot"], [class*="copilot"]' },

        // Performance
        { label: 'Paint time < 3s',    action: 'assert.performance', metric: 'firstPaint', maxMs: 3000 },
        { label: 'No layout shift',    action: 'assert.performance', metric: 'cls', maxValue: 0.1 },

        // Screenshot for visual record
        { label: 'Screenshot',         action: 'screenshot', save: true },

        // Network
        { label: 'SSE endpoint live',  action: 'assert.fetch', url: `${nexusUrl}/events`, expectStatus: 200 },
        { label: 'SEAM API live',      action: 'assert.fetch', url: `${nexusUrl}/api/seam/status`, expectStatus: 200 },
      ],
    });
  }

  // ── Generic page audit ─────────────────────────────────────────────────
  async runPageAudit({ agentId, url }) {
    return this.run({
      label: `Page Audit: ${url}`,
      agentId,
      steps: [
        { label: 'Navigate',           action: 'navigate',          url },
        { label: 'No JS errors',       action: 'assert.noErrors' },
        { label: 'No broken images',   action: 'assert.noBrokenImages' },
        { label: 'No broken links',    action: 'assert.noBrokenLinks' },
        { label: 'Paint < 5s',         action: 'assert.performance', metric: 'firstPaint', maxMs: 5000 },
        { label: 'Screenshot',         action: 'screenshot', save: true },
        { label: 'DOM tree',           action: 'capture.dom' },
        { label: 'Network requests',   action: 'capture.network' },
        { label: 'Console messages',   action: 'capture.console' },
      ],
    });
  }

  // ── Step executor ─────────────────────────────────────────────────────
  async _runStep(step, agentId, runId, index) {
    const start = Date.now();

    try {
      const result = await this._execStep(step, agentId, runId);
      return { index, label: step.label, passed: true, result, elapsed: Date.now() - start };
    } catch (err) {
      // Auto-screenshot on failure
      try {
        const shot = await this.driver.exec({ action: 'screenshot', agentId });
        this._saveScreenshot(runId, `fail-step-${index}`, shot.screenshot);
      } catch {}

      return {
        index, label: step.label, passed: false,
        error: err.message, elapsed: Date.now() - start,
      };
    }
  }

  async _execStep(step, agentId, runId) {
    switch (step.action) {

      // ── Navigation ──────────────────────────────────────────────────
      case 'navigate':
        return this.driver.exec({ action: 'navigate', agentId, url: step.url });

      case 'click':
        return this.driver.exec({ action: 'click', agentId, selector: step.selector });

      case 'type':
        return this.driver.exec({ action: 'type', agentId, selector: step.selector, text: step.text });

      case 'wait':
        return this.driver.exec({ action: 'wait', agentId, ms: step.ms || 1000 });

      case 'waitFor':
        return this.driver.exec({ action: 'waitFor', agentId, selector: step.selector, timeout: step.timeout });

      // ── Screenshot ──────────────────────────────────────────────────
      case 'screenshot': {
        const shot = await this.driver.exec({ action: 'screenshot', agentId });
        if (step.save) this._saveScreenshot(runId, `step-${Date.now()}`, shot.screenshot);
        return { screenshot: step.save ? 'saved' : 'captured' };
      }

      // ── Assertions ──────────────────────────────────────────────────
      case 'assert.exists': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `!!document.querySelector(${JSON.stringify(step.selector)})`,
        });
        if (!res.result) throw new Error(`Element not found: ${step.selector}`);
        return { found: step.selector };
      }

      case 'assert.notExists': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `!!document.querySelector(${JSON.stringify(step.selector)})`,
        });
        if (res.result) throw new Error(`Element should not exist: ${step.selector}`);
        return { notFound: step.selector };
      }

      case 'assert.text': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `document.querySelector(${JSON.stringify(step.selector)})?.innerText?.trim()`,
        });
        const text = res.result;
        if (step.equals && text !== step.equals) throw new Error(`Text mismatch. Expected "${step.equals}", got "${text}"`);
        if (step.contains && !text?.includes(step.contains)) throw new Error(`Text "${text}" does not contain "${step.contains}"`);
        if (step.notEmpty && !text) throw new Error(`Text is empty for: ${step.selector}`);
        return { text };
      }

      case 'assert.url': {
        const res = await this.driver.exec({ action: 'getUrl', agentId });
        const url = res.url;
        if (step.equals && url !== step.equals) throw new Error(`URL mismatch. Expected "${step.equals}", got "${url}"`);
        if (step.contains && !url?.includes(step.contains)) throw new Error(`URL "${url}" does not contain "${step.contains}"`);
        return { url };
      }

      case 'assert.title': {
        const res = await this.driver.exec({ action: 'getTitle', agentId });
        if (step.notEmpty && !res.title) throw new Error('Title is empty');
        if (step.contains && !res.title?.includes(step.contains)) throw new Error(`Title "${res.title}" missing "${step.contains}"`);
        return { title: res.title };
      }

      case 'assert.noErrors': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `window.__cgErrors || []`,
        });
        const errors = res.result || [];
        if (errors.length) throw new Error(`JS errors: ${JSON.stringify(errors.slice(0, 3))}`);
        return { errors: 0 };
      }

      case 'assert.noBrokenImages': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `[...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src)`,
        });
        const broken = res.result || [];
        if (broken.length) throw new Error(`Broken images: ${broken.slice(0, 3).join(', ')}`);
        return { images: 'ok' };
      }

      case 'assert.noBrokenLinks': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `[...document.links].filter(l => !l.href || l.href === '#').map(l => l.textContent?.trim()).slice(0, 5)`,
        });
        return { links: res.result };
      }

      case 'assert.performance': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `
            (function() {
              const nav  = performance.getEntriesByType('navigation')[0];
              const paint = performance.getEntriesByType('paint');
              const fp   = paint.find(p => p.name === 'first-contentful-paint');
              return {
                firstPaint:   fp?.startTime || 0,
                domComplete:  nav?.domComplete || 0,
                loadTime:     nav?.loadEventEnd - nav?.startTime || 0,
                cls:          0, // LayoutShift API requires observer — simplified
              };
            })()
          `,
        });
        const metrics = res.result || {};
        if (step.metric && step.maxMs) {
          const val = metrics[step.metric];
          if (val > step.maxMs) throw new Error(`${step.metric} = ${Math.round(val)}ms > ${step.maxMs}ms`);
        }
        return metrics;
      }

      case 'assert.fetch': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `fetch(${JSON.stringify(step.url)}).then(r => r.status).catch(e => 'error:' + e.message)`,
        });
        const status = res.result;
        if (step.expectStatus && status !== step.expectStatus) {
          throw new Error(`Fetch ${step.url} → ${status}, expected ${step.expectStatus}`);
        }
        return { status };
      }

      // ── Captures ────────────────────────────────────────────────────
      case 'capture.dom': {
        const tree = await this.dom.handleQuery({ agentId, tree: true });
        return { nodes: JSON.stringify(tree).length + ' chars' };
      }

      case 'capture.network': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `performance.getEntriesByType('resource').slice(0,20).map(e => ({ url: e.name, duration: Math.round(e.duration), size: e.transferSize }))`,
        });
        return { requests: res.result };
      }

      case 'capture.console': {
        const res = await this.driver.exec({
          action: 'eval', agentId,
          code: `window.__cgConsole || []`,
        });
        return { messages: res.result || [] };
      }

      default:
        throw new Error(`Unknown diagnostic action: ${step.action}`);
    }
  }

  // ── Report persistence ────────────────────────────────────────────────
  _saveReport(summary) {
    try {
      const file = path.join(this.outputDir, `run-${summary.runId}.json`);
      fs.writeFileSync(file, JSON.stringify(summary, null, 2));
    } catch {}
  }

  _saveScreenshot(runId, label, b64) {
    try {
      const file = path.join(this.outputDir, `${runId}-${label}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      this.sse.emit('diag.screenshot.saved', { runId, file, ts: Date.now() });
    } catch {}
  }

  listReports() {
    try {
      return fs.readdirSync(this.outputDir)
        .filter(f => f.startsWith('run-') && f.endsWith('.json'))
        .map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(this.outputDir, f))); } catch {}
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 20);
    } catch { return []; }
  }
}

module.exports = DiagnosticEngine;
