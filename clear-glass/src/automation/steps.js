'use strict';
/**
 * clear-glass/src/automation/steps.js — what every workflow step is, for the UI and for validation.
 * component_id: cg.automation.steps
 *
 * §0.39.265 — one catalogue, read by three places:
 *   - the engine's validate(), so a workflow with a missing URL is caught when saved, not at 3am;
 *   - Settings → Automation, which draws each step's form from `fields` (GET /automation/catalogue);
 *   - the co-pilot's automation tool, which lists it so an agent can build workflows.
 *
 * A field: { key, label, type, required, options, placeholder, help, default, when }
 *   type: text | textarea | code | number | bool | select | duration | kv | json
 *         | agent | account | macro | page | branch | system | workflow      (options filled in by the UI)
 *   when: { otherKey: [values…] } — the field only applies when another field has one of those values
 * Every text field takes {{placeholders}} (see template.js).
 */

const BROWSER_ACTIONS = [
  { value: 'navigate', label: 'Go to a URL' },
  { value: 'click', label: 'Click (real mouse)' },
  { value: 'dom_click', label: 'Click (in the page — works on hidden pages)' },
  { value: 'fill', label: 'Fill a field' },
  { value: 'type', label: 'Type text (real keys)' },
  { value: 'press', label: 'Press a key' },
  { value: 'select', label: 'Choose from a dropdown' },
  { value: 'check', label: 'Tick a checkbox' },
  { value: 'uncheck', label: 'Untick a checkbox' },
  { value: 'submit', label: 'Submit a form' },
  { value: 'hover', label: 'Hover' },
  { value: 'scroll', label: 'Scroll the page' },
  { value: 'scroll_to', label: 'Scroll to an element' },
  { value: 'upload_text', label: 'Attach a file made from text' },
  { value: 'highlight', label: 'Highlight what a selector matches' },
  { value: 'back', label: 'Back' }, { value: 'forward', label: 'Forward' }, { value: 'reload', label: 'Reload' },
  { value: 'screenshot', label: 'Screenshot (saved to the output folder)' },
  { value: 'eval', label: 'Run JavaScript in the page' },
  { value: 'cookies_get', label: 'Read cookies' },
  { value: 'cookies_clear', label: 'Clear cookies' },
  { value: 'storage_get', label: 'Read localStorage' },
  { value: 'storage_set', label: 'Write localStorage' },
  { value: 'show', label: 'Show the automation page' },
  { value: 'close', label: 'Close the automation page' },
];
const SEL_ACTIONS = ['click', 'dom_click', 'fill', 'type', 'select', 'check', 'uncheck', 'submit', 'hover', 'scroll_to', 'upload_text', 'highlight'];
const VALUE_ACTIONS = ['fill', 'type', 'select', 'upload_text', 'storage_set'];

const OPS = [
  { value: '==', label: 'is' }, { value: '!=', label: 'is not' },
  { value: '>', label: 'is more than' }, { value: '<', label: 'is less than' },
  { value: '>=', label: 'is at least' }, { value: '<=', label: 'is at most' },
  { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'does not contain' },
  { value: 'starts', label: 'starts with' }, { value: 'ends', label: 'ends with' },
  { value: 'matches', label: 'matches the pattern (regex)' },
  { value: 'in', label: 'is one of (comma list)' },
  { value: 'empty', label: 'is empty' }, { value: 'not_empty', label: 'is not empty' },
  { value: 'exists', label: 'exists' }, { value: 'missing', label: 'does not exist' },
  { value: 'changed', label: 'changed since the last run' },
];
const UNARY_OPS = ['empty', 'not_empty', 'exists', 'missing', 'changed'];

const PAGE_HELP = '“Automation page” is this workflow’s own hidden tab (its own cookies, kept between runs). Or pick an open window.';

const CATALOGUE = [
  // ── Browser ──────────────────────────────────────────────────────────────
  { type: 'browser', group: 'Browser', icon: '🌐', label: 'Browser action',
    help: 'Open pages, click, fill forms, press keys, scroll, take screenshots — in a hidden automation page or an open window.',
    output: 'what the action returned (the URL and title after navigating, the screenshot file, the JavaScript result …)',
    fields: [
      { key: 'action', label: 'Do', type: 'select', options: BROWSER_ACTIONS, required: true, default: 'navigate' },
      { key: 'page', label: 'In', type: 'page', default: 'auto', help: PAGE_HELP },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://www.upwork.com/nx/find-work/', required: true, when: { action: ['navigate'] } },
      { key: 'selector', label: 'Element', type: 'text', placeholder: 'button.submit · text=Sign in · label=Email · //a[@href]', required: true, when: { action: SEL_ACTIONS }, help: 'CSS, text=…, label=…, or XPath; chain with >>' },
      { key: 'value', label: 'Value', type: 'textarea', placeholder: '{{vars.email}}', when: { action: VALUE_ACTIONS }, help: 'For “attach a file”: the file’s text. For localStorage: the value.' },
      { key: 'fileName', label: 'File name', type: 'text', placeholder: 'cover-letter.txt', when: { action: ['upload_text'] } },
      { key: 'key', label: 'Key', type: 'text', placeholder: 'Enter, Tab, Escape, ArrowDown …', default: 'Enter', when: { action: ['press', 'storage_get', 'storage_set'] }, help: 'For localStorage: the storage key' },
      { key: 'deltaY', label: 'Scroll by (pixels)', type: 'number', default: 600, when: { action: ['scroll'] } },
      { key: 'code', label: 'JavaScript', type: 'code', placeholder: 'return document.querySelectorAll(".job").length', required: true, when: { action: ['eval'] }, help: 'Runs in the page; `return` a value to keep it' },
      // §0.39.281 EC9 — James: "the jobs types using ErosmancerOS". Additive: the same click / hover / type, sent as real input through
      // ErosmancerOS (the driver's pointer, via 'eros' → POST /api/input) for pages that ignore in-page events. Default unchanged.
      { key: 'input', label: 'Input', type: 'select', default: 'page', when: { action: ['click', 'hover', 'type'] }, options: [
        { value: 'page', label: 'in the page (events in the page)' }, { value: 'erosmancer', label: 'ErosmancerOS (real mouse and keyboard input)' }],
        help: 'ErosmancerOS input needs it running and connected (Settings → ErosmancerOS). The step says which path ran.' },
      { key: 'waitAfterMs', label: 'Then wait', type: 'duration', default: 0 },
    ] },
  { type: 'extract', group: 'Browser', icon: '⛏', label: 'Read from the page',
    help: 'Scrape text, links, attributes, whole records or tables from the page into a value later steps can use.',
    output: 'the value read — text, a number, a list, or a list of records',
    fields: [
      { key: 'page', label: 'From', type: 'page', default: 'auto', help: PAGE_HELP },
      { key: 'mode', label: 'Read', type: 'select', required: true, default: 'text', options: [
        { value: 'text', label: 'the text of an element' }, { value: 'list', label: 'the text of every match (a list)' },
        { value: 'attr', label: 'an attribute (href, src, data-…)' }, { value: 'value', label: 'a form field’s value' },
        { value: 'html', label: 'the HTML of an element' }, { value: 'count', label: 'how many elements match' },
        { value: 'exists', label: 'whether an element exists (true/false)' },
        { value: 'records', label: 'records — several fields from each match' }, { value: 'table', label: 'a table (rows)' },
        { value: 'links', label: 'links (text + address)' }, { value: 'page', label: 'the whole page (URL, title, text)' }] },
      { key: 'selector', label: 'Element', type: 'text', placeholder: '.job-tile h2 · text=Price · table#results', required: true, when: { mode: ['text', 'list', 'attr', 'value', 'html', 'count', 'exists', 'records'] } },
      { key: 'selector', label: 'Table / area', type: 'text', placeholder: 'table (optional)', when: { mode: ['table', 'links'] } },
      { key: 'attr', label: 'Attribute', type: 'text', placeholder: 'href', default: 'href', when: { mode: ['attr'] } },
      { key: 'all', label: 'Every match (a list)', type: 'bool', when: { mode: ['attr', 'html', 'value'] } },
      { key: 'fields', label: 'Fields', type: 'kv', placeholder: 'title = h2\nlink = a@href\nprice = .price\nid = @data-id', required: true, when: { mode: ['records'] }, help: 'name = sub-selector, add @attribute to read one' },
      { key: 'match', label: 'Only links matching', type: 'text', placeholder: '/jobs/ (text or regex)', when: { mode: ['links'] } },
      { key: 'limit', label: 'At most', type: 'number', default: 200, when: { mode: ['list', 'records', 'links', 'table', 'attr', 'html', 'value'] } },
      { key: 'transform', label: 'Then', type: 'text', placeholder: 'number · trim · first · match:"\\$(\\d+)"', help: 'Optional filters, as in {{value | number}}' },
    ] },
  { type: 'wait_until', group: 'Browser', icon: '⌛', label: 'Wait until…',
    help: 'Wait for an element, some text, a URL, or any value — checking again and again until it is true or time runs out.',
    output: 'how long it waited (ms)',
    fields: [
      { key: 'kind', label: 'Until', type: 'select', required: true, default: 'present', options: [
        { value: 'present', label: 'an element appears' }, { value: 'absent', label: 'an element is gone' },
        { value: 'visible', label: 'an element is visible' }, { value: 'hidden', label: 'an element is hidden' },
        { value: 'enabled', label: 'an element is enabled' },
        { value: 'text', label: 'text appears' }, { value: 'no_text', label: 'text disappears' },
        { value: 'url', label: 'the URL contains…' }, { value: 'ready', label: 'the page has loaded' },
        { value: 'expression', label: 'a value matches (no page needed)' }] },
      { key: 'page', label: 'On', type: 'page', default: 'auto', when: { kind: ['present', 'absent', 'visible', 'hidden', 'enabled', 'text', 'no_text', 'url', 'ready'] } },
      { key: 'selector', label: 'Element', type: 'text', required: true, when: { kind: ['present', 'absent', 'visible', 'hidden', 'enabled'] } },
      { key: 'selector', label: 'Inside (optional)', type: 'text', when: { kind: ['text', 'no_text'] } },
      { key: 'text', label: 'Text', type: 'text', required: true, when: { kind: ['text', 'no_text'] } },
      { key: 'url', label: 'URL contains', type: 'text', placeholder: '/dashboard or /regex/', required: true, when: { kind: ['url'] } },
      { key: 'left', label: 'Value', type: 'text', placeholder: '{{steps.Check.output}}', required: true, when: { kind: ['expression'] } },
      { key: 'op', label: '', type: 'select', options: OPS, default: '==', when: { kind: ['expression'] } },
      { key: 'value', label: 'Compared with', type: 'text', when: { kind: ['expression'] } },
      { key: 'timeoutMs', label: 'Give up after', type: 'duration', default: 30000 },
      { key: 'intervalMs', label: 'Check every', type: 'duration', default: 500 },
    ] },
  { type: 'macro', group: 'Browser', icon: '⌘', label: 'Run a macro',
    help: 'Replay a saved macro (Macros page) in a window.', output: 'the macro’s result',
    fields: [
      { key: 'name', label: 'Macro', type: 'macro', required: true },
      { key: 'agentId', label: 'Run in', type: 'page', default: 'default' },
      { key: 'params', label: 'Values for the macro', type: 'kv', placeholder: 'name = Jane Doe\nemail = {{vars.email}}', help: 'Fills the macro’s {{name}} slots' },
    ] },

  // ── Data ──────────────────────────────────────────────────────────────────
  { type: 'set', group: 'Data', icon: '𝑥', label: 'Set variables',
    help: 'Keep values for later steps: {{vars.name}}. Values can use filters — {{last | number}}, {{steps.Jobs.output | length}}.',
    output: 'the variables set',
    fields: [{ key: 'assign', label: 'Variables', type: 'kv', required: true, placeholder: 'count = {{steps.Jobs.output | length}}\ntoday = {{now:YYYY-MM-DD}}' }] },
  { type: 'http', group: 'Data', icon: '⇵', label: 'Web request',
    help: 'Call any web API or webhook (Slack, Discord, Zapier, your own server) and keep the answer.',
    output: '{ status, ok, body } — body parsed from JSON when it is JSON',
    fields: [
      { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
      { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://hooks.slack.com/services/…' },
      { key: 'headers', label: 'Headers', type: 'kv', placeholder: 'Authorization = Bearer {{vars.token}}' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: '{"text": "Found {{vars.count}} new jobs"}', when: { method: ['POST', 'PUT', 'PATCH', 'DELETE'] } },
      { key: 'failOnHttpError', label: 'Fail on 4xx/5xx', type: 'bool', default: true },
    ] },
  { type: 'file', group: 'Data', icon: '🗎', label: 'Save to a file',
    help: 'Write or append text, JSON or CSV rows to a file in the automation output folder.',
    output: 'the file’s full path',
    fields: [
      { key: 'path', label: 'File', type: 'text', required: true, placeholder: 'jobs/{{now:YYYY-MM-DD}}.csv', help: 'Inside the automation output folder' },
      { key: 'format', label: 'As', type: 'select', default: 'text', options: [{ value: 'text', label: 'text' }, { value: 'json', label: 'JSON' }, { value: 'jsonl', label: 'JSON lines' }, { value: 'csv', label: 'CSV rows' }] },
      { key: 'mode', label: 'Mode', type: 'select', default: 'append', options: [{ value: 'append', label: 'add to the end' }, { value: 'write', label: 'replace the file' }] },
      { key: 'content', label: 'Content', type: 'textarea', required: true, placeholder: '{{steps.Jobs.output}}', help: 'For CSV: a record or a list of records' },
    ] },
  { type: 'command', group: 'Data', icon: '⇄', label: 'Call a NEXUS system',
    help: 'Call Guardian, Ollama, Co-pilot or Clear Glass over HTTP.', output: 'the response (parsed JSON when it is JSON)',
    fields: [
      { key: 'system', label: 'System', type: 'system', required: true, default: 'guardian' },
      { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST'], default: 'GET' },
      { key: 'endpoint', label: 'Endpoint', type: 'text', default: '/health', help: 'Each system lists what it offers at GET /commands' },
      { key: 'body', label: 'Body (JSON)', type: 'code', when: { method: ['POST'] } },
    ] },

  // ── Logic ─────────────────────────────────────────────────────────────────
  { type: 'condition', group: 'Logic', icon: '⑂', label: 'If…',
    help: 'Compare a value, then continue, jump to a step, stop, or break out of a loop.',
    output: 'true or false',
    fields: [
      { key: 'left', label: 'If', type: 'text', placeholder: '{{steps.Price.output | number}} — or leave empty and pick a live value', help: 'Any value; or a mesh value below' },
      { key: 'var', label: 'or the live value', type: 'meshvar' },
      { key: 'op', label: '', type: 'select', options: OPS, default: '==', required: true },
      { key: 'value', label: 'This value', type: 'text', placeholder: '0, online, {{vars.max}}' },
      { key: 'onTrue', label: 'If it matches', type: 'branch', default: 'next' },
      { key: 'onFalse', label: 'Otherwise', type: 'branch', default: 'stop' },
    ] },
  { type: 'loop', group: 'Logic', icon: '↺', label: 'For each…',
    help: 'Repeat the next steps for every item of a list ({{item}}, {{index}}) or a number of times.',
    output: 'how many times it went round',
    fields: [
      { key: 'items', label: 'For each item in', type: 'text', placeholder: '{{steps.Jobs.output}} — or leave empty and set Times' },
      { key: 'times', label: 'Or this many times', type: 'number' },
      { key: 'body', label: 'Repeat the next', type: 'number', default: 1, required: true, help: 'How many steps after this one are inside the loop' },
      { key: 'max', label: 'At most', type: 'number', default: 500, help: 'A safety limit' },
      { key: 'delayMs', label: 'Pause between rounds', type: 'duration', default: 0 },
    ] },
  { type: 'delay', group: 'Logic', icon: '⏱', label: 'Wait', help: 'Pause before the next step (up to an hour).', output: 'the time waited (ms)',
    fields: [{ key: 'ms', label: 'Wait', type: 'duration', default: 60000, required: true }, { key: 'jitterMs', label: 'Plus up to (random)', type: 'duration', default: 0, help: 'Randomises the wait — looks less robotic' }] },
  { type: 'workflow', group: 'Logic', icon: '⧉', label: 'Run another workflow',
    help: 'Run a workflow as a step, handing it values; its variables come back as this step’s output.',
    output: 'the other workflow’s variables at its end',
    fields: [{ key: 'workflow', label: 'Workflow', type: 'workflow', required: true }, { key: 'vars', label: 'Values to hand it', type: 'kv', placeholder: 'url = {{item.link}}' }] },
  { type: 'stop', group: 'Logic', icon: '■', label: 'Finish here', help: 'End the run successfully at this step.', output: '', fields: [] },
  { type: 'fail', group: 'Logic', icon: '✕', label: 'Fail the run', help: 'End the run as failed, with a message (shows in the run history).', output: '',
    fields: [{ key: 'message', label: 'Message', type: 'text', required: true, placeholder: 'Login failed for {{vars.user}}' }] },

  // ── Agents & you ──────────────────────────────────────────────────────────
  { type: 'agent', group: 'Agents & you', icon: '✦', label: 'Ask an agent',
    help: 'Send a prompt to Claude, ChatGPT, DeepSeek or another agent. Wait for the reply to use it in later steps.',
    output: 'the reply (when “wait for the reply” is on)',
    fields: [
      { key: 'agentKey', label: 'Agent', type: 'agent', required: true },
      { key: 'accountId', label: 'Send as', type: 'account' },
      { key: 'prompt', label: 'Prompt', type: 'textarea', required: true, placeholder: 'Rate this job 1-10 for a Node developer, answer with the number only:\n{{item.title}}\n{{item.description}}' },
      { key: 'await', label: 'Wait for the reply (and keep it)', type: 'bool', default: false },
    ] },
  { type: 'notify', group: 'Agents & you', icon: '🔔', label: 'Notify me', help: 'Show a desktop notification.', output: '',
    fields: [{ key: 'title', label: 'Title', type: 'text', default: '{{workflow}}' }, { key: 'body', label: 'Message', type: 'textarea' }] },
  { type: 'log', group: 'Agents & you', icon: '✎', label: 'Write to the run log', help: 'Record a line in this run’s history — handy for checking values.', output: 'the message',
    fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Found {{steps.Jobs.output | length}} jobs' }] },
  { type: 'emit', group: 'Agents & you', icon: '📣', label: 'Send an event',
    help: 'Fire a named event; any workflow whose trigger listens for it starts, with these values as {{trigger}}.', output: 'the number of workflows started',
    fields: [{ key: 'event', label: 'Event name', type: 'text', required: true, placeholder: 'jobs.found' }, { key: 'payload', label: 'Values', type: 'kv', placeholder: 'count = {{vars.count}}' }] },
];

const TRIGGER = {
  type: 'trigger', label: 'When', help: 'What starts the workflow. A workflow can have several triggers.',
  kinds: [
    { value: 'manual', label: 'Only when I press Run' },
    { value: 'every', label: 'Every N minutes / hours' },
    { value: 'daily', label: 'At a time of day' },
    { value: 'cron', label: 'On a cron schedule' },
    { value: 'event', label: 'When something happens' },
    { value: 'webhook', label: 'When a web request arrives (webhook)' },
  ],
  events: [
    { value: 'page.visited', label: 'I open a page (URL matches)', match: 'url' },
    { value: 'download.done', label: 'A download finishes', match: 'file name' },
    { value: 'app.start', label: 'Clear Glass starts' },
    { value: 'workflow.finished', label: 'Another workflow finishes', match: 'workflow name' },
    { value: 'workflow.failed', label: 'Another workflow fails', match: 'workflow name' },
    { value: 'custom', label: 'A named event (Send an event step, or POST /automation/events/<name>)', match: 'event name' },
  ],
};

const COMMON = [
  { key: 'saveAs', label: 'Keep the output as', type: 'text', placeholder: 'jobs → {{vars.jobs}}', help: 'Also stores the output in a variable' },
  { key: 'retry.count', label: 'On failure, retry', type: 'number', default: 0, help: 'times' },
  { key: 'retry.delayMs', label: 'Between retries', type: 'duration', default: 2000 },
  { key: 'timeoutMs', label: 'Time limit', type: 'duration', default: 0, help: '0 = none' },
  { key: 'onError', label: 'If it still fails', type: 'branch', default: 'fail', extra: [{ value: 'fail', label: 'Fail the run' }, { value: 'continue', label: 'Carry on with the next step' }] },
];

const byType = new Map(CATALOGUE.map(c => [c.type, c]));
const KNOWN_TYPES = ['trigger', ...CATALOGUE.map(c => c.type)];

function fieldApplies(f, cfg) {
  if (!f.when) return true;
  return Object.entries(f.when).every(([k, vals]) => {
    const def = (byType.get(cfg.__type) || { fields: [] }).fields.find(x => x.key === k);
    const v = cfg[k] !== undefined && cfg[k] !== '' ? cfg[k] : def && def.default;
    return vals.includes(v);
  });
}

/** validateStep(step, allIds) -> [problems] (empty = fine) */
function validateStep(step, allIds = []) {
  const out = [];
  if (!step || !step.type) return ['a step has no type'];
  if (step.type === 'trigger') {
    const c = step.config || {};
    if (c.cron) { try { require('./cron').parse(c.cron); } catch (e) { out.push(`trigger: ${e.message}`); } }
    if (c.at && !/^\d{1,2}:\d{2}$/.test(c.at)) out.push('trigger: the time is HH:MM');
    return out;
  }
  const cat = byType.get(step.type);
  if (!cat) return [`unknown step type "${step.type}"`];
  const cfg = { ...(step.config || {}), __type: step.type };
  const name = step.label || cat.label;
  const seen = new Set();
  for (const f of cat.fields) {
    if (!f.required || seen.has(f.key) || !fieldApplies(f, cfg)) continue;
    seen.add(f.key);
    const v = cfg[f.key];
    const empty = v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) || (Array.isArray(v) && !v.length);
    if (empty && f.default === undefined) out.push(`${name}: “${f.label || f.key}” is empty`);
  }
  if (step.type === 'condition') {
    if (!cfg.left && !cfg.var) out.push(`${name}: pick a value to check`);
    for (const k of ['onTrue', 'onFalse']) {
      const t = cfg[k];
      if (t && !['next', 'stop', 'break', 'continue', 'end', 'fail'].includes(t) && !allIds.includes(t)) out.push(`${name}: “${k === 'onTrue' ? 'if it matches' : 'otherwise'}” goes to a step that is gone`);
    }
  }
  if (step.type === 'loop' && !cfg.items && !(parseInt(cfg.times, 10) > 0) && !String(cfg.times || '').includes('{{')) out.push(`${name}: give it a list or a number of times`);
  if (step.type === 'http' && cfg.url && !/^https?:\/\//i.test(String(cfg.url)) && !String(cfg.url).startsWith('{{')) out.push(`${name}: the URL starts with http:// or https://`);
  if (step.onError && !['fail', 'continue', 'stop'].includes(step.onError) && !allIds.includes(step.onError)) out.push(`${name}: “if it still fails” goes to a step that is gone`);
  return out;
}

function validateWorkflow(wf) {
  const steps = (wf && wf.steps) || [];
  const ids = steps.map(s => s.id).filter(Boolean);
  const out = [];
  steps.forEach((s, i) => validateStep(s, ids).forEach(p => out.push({ index: i, stepId: s.id, problem: p })));
  return out;
}

module.exports = { CATALOGUE, TRIGGER, COMMON, OPS, UNARY_OPS, BROWSER_ACTIONS, KNOWN_TYPES, byType, validateStep, validateWorkflow, fieldApplies };
