'use strict';
/**
 * lib/agent-tools/tools/clear-glass/browser-automation.js — clear_glass_browser:
 * a real browser page an agent drives step by step, with the automation DOM tools.
 *
 * §0.39.265 — James: "as much as i can automate on a browser … dom tools."
 * browser_action sends one driver call through a Guardian job; this gives an
 * agent the workflow engine's own browser and DOM steps directly, one at a
 * time: its own hidden page ("auto-agent", persist:automation — signed-in
 * sites stay signed in), or any open window by id. Selectors understand CSS,
 * text=…, label=…, XPath and ">>" chains; reading returns records and tables,
 * not just text. Each call is POST /automation/step on Clear Glass's wire —
 * the same code a workflow step runs, so what works here works in a workflow.
 */
const { _call } = require('./automation.js');

const PAGE = 'auto-agent';

function _step(a) {
  const page = a.page || PAGE;
  switch (a.action) {
    case 'open': return { type: 'browser', config: { action: 'navigate', page, url: a.url } };
    case 'read': return { type: 'extract', config: { page, mode: a.mode || 'text', selector: a.selector, attr: a.attr, all: a.all, fields: a.fields, match: a.match, limit: a.limit, transform: a.transform } };
    case 'wait': return { type: 'wait_until', config: { page, kind: a.kind || 'present', selector: a.selector, text: a.text, url: a.url, timeoutMs: a.timeoutMs || 15000 } };
    case 'click': case 'dom_click': case 'fill': case 'type': case 'select': case 'check': case 'uncheck': case 'submit':
    case 'press': case 'hover': case 'scroll': case 'scroll_to': case 'highlight': case 'back': case 'forward': case 'reload':
    case 'screenshot': case 'show': case 'close': case 'cookies_get': case 'cookies_clear':
      return { type: 'browser', config: { action: a.action, page, selector: a.selector, value: a.value, key: a.key, deltaY: a.deltaY, waitAfterMs: a.waitAfterMs } };
    case 'eval': return { type: 'browser', config: { action: 'eval', page, code: a.code } };
    case 'page': return { type: 'extract', config: { page, mode: 'page' } };
    default: return null;
  }
}

const ACTIONS = ['open', 'read', 'wait', 'click', 'dom_click', 'fill', 'type', 'select', 'check', 'uncheck', 'submit', 'press', 'hover', 'scroll', 'scroll_to', 'highlight', 'back', 'forward', 'reload', 'screenshot', 'eval', 'page', 'show', 'close', 'cookies_get', 'cookies_clear'];

module.exports = {
  name: 'clear_glass_browser',
  description:
    'Drive a real Clear Glass browser page one action at a time — your own hidden page (default) whose sign-ins persist, ' +
    'or an open window by id (page). open(url) · read(mode: text|list|attr|value|html|count|exists|records|table|links|page, ' +
    'selector, fields {name:"sub-selector@attr"}, transform "number|trim") · wait(kind: present|absent|visible|hidden|text|' +
    'no_text|url|enabled|ready) · click (real mouse) / dom_click (in-page, works hidden) · fill · type · select · check · ' +
    'uncheck · submit · press(key) · hover · scroll · scroll_to · highlight · back · forward · reload · screenshot (saved ' +
    'to a file) · eval(code: page JavaScript, return a value) · page (URL, title, text) · show (make the page visible so ' +
    'the user can sign in) · close · cookies_get · cookies_clear. Selectors: CSS, "text=Sign in", "label=Email", XPath ' +
    '"//a", chains "form >> text=Save", "li >> nth=2". To repeat a sequence, turn it into a workflow with clear_glass_automation.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ACTIONS },
      page: { type: 'string', description: 'which page: omit for your own hidden page (auto-agent); "default" for the main window; or an agent window id' },
      url: { type: 'string', description: 'for open; for wait kind:url — the part the URL should contain' },
      selector: { type: 'string' },
      value: { description: 'for fill/type/select (a list for multi-select)' },
      key: { type: 'string', description: 'for press — Enter, Tab, Escape, ArrowDown …' },
      mode: { type: 'string', description: 'for read' },
      attr: { type: 'string', description: 'for read mode attr' },
      all: { type: 'boolean', description: 'for read — every match, as a list' },
      fields: { description: 'for read mode records — {name: "sub-selector" or "sub-selector@attr"}' },
      match: { type: 'string', description: 'for read mode links — only links whose text/URL has this' },
      limit: { type: 'number' },
      transform: { type: 'string', description: 'for read — filters like "number" or "trim | upper"' },
      kind: { type: 'string', description: 'for wait' },
      text: { type: 'string', description: 'for wait kind text/no_text' },
      timeoutMs: { type: 'number' },
      deltaY: { type: 'number', description: 'for scroll' },
      waitAfterMs: { type: 'number', description: 'pause after the action' },
      code: { type: 'string', description: 'for eval' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const step = _step(args);
    if (!step) return { error: `unknown action "${args.action}" — one of: ${ACTIONS.join(', ')}` };
    if (args.action === 'open' && !args.url) return { error: 'open needs url' };
    const r = await _call('POST', '/automation/step', { step }, Math.max(20000, (args.timeoutMs || 0) + 10000));
    if (r.ok === false) return { error: r.error };
    return { ok: true, page: args.page || PAGE, result: r.output, ...(r.note ? { note: r.note } : {}) };
  },
  _step,
};
