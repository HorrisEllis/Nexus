'use strict';
/**
 * clear-glass/src/automation/templates.js — ready-made workflows for "New workflow".
 * component_id: cg.automation.templates
 *
 * §0.39.265 — each is an ordinary workflow (steps with local ids so branches
 * can point at each other; create() gives them real ids). They start switched
 * off, with the parts to fill in marked in the description.
 */

const TEMPLATES = [
  { id: 'blank', name: 'Blank workflow', category: 'Start', help: 'Start empty and add your own steps.', steps: [{ type: 'trigger', config: {} }] },

  { id: 'jobs', name: 'Job board watcher', category: 'Browser',
    help: 'Every 30 minutes on weekdays: open a job search, read the listings, skip ones already seen, ask Claude to score each, save the good ones to a CSV and notify you.',
    vars: { searchUrl: 'https://www.upwork.com/nx/search/jobs/?q=node.js&sort=recency', minScore: '7', skills: 'Node.js, TypeScript, APIs' },
    steps: [
      { type: 'trigger', config: { cron: '*/30 8-20 * * 1-5' } },
      { type: 'browser', label: 'Open the search', config: { action: 'navigate', page: 'auto', url: '{{vars.searchUrl}}' } },
      { type: 'wait_until', config: { kind: 'present', page: 'auto', selector: 'article, [data-test=job-tile], section.job-tile', timeoutMs: 20000 } },
      { type: 'extract', label: 'Jobs', config: { page: 'auto', mode: 'records', selector: 'article, [data-test=job-tile], section.job-tile', limit: 30, fields: 'title = h2, h3\nlink = a@href\ndescription = p\nbudget = [data-test=budget], .budget' } },
      { type: 'loop', label: 'Each new job', config: { items: '{{steps.Jobs.output}}', body: 4, onlyNew: '{{item.link}}', max: 30 } },
      { type: 'agent', label: 'Score', retry: { count: 1, delayMs: 5000 }, config: { agentKey: 'claude', await: true, prompt: 'I am a freelancer with these skills: {{vars.skills}}.\nRate how good a fit this job is from 1 to 10. Answer with the number only.\n\n{{item.title}}\n{{item.budget}}\n{{item.description}}' } },
      { type: 'condition', config: { left: '{{steps.Score.output | number}}', op: '>=', value: '{{vars.minScore}}', onTrue: 'next', onFalse: 'continue' } },
      { type: 'file', config: { path: 'good-jobs.csv', format: 'csv', content: '{"found": {{now:YYYY-MM-DD HH:mm | json}}, "score": {{steps.Score.output | trim | json}}, "title": {{item.title | json}}, "link": {{item.link | json}}}' } },
      { type: 'notify', config: { title: 'Job {{steps.Score.output | trim}}/10: {{item.title}}', body: '{{item.budget}} — {{item.link}}' } },
    ] },

  { id: 'price', name: 'Price / change watcher', category: 'Browser',
    help: 'Every hour, read one value from a page (a price, a stock level, a status) and notify you when it changes or drops below a limit.',
    vars: { url: 'https://example.com/product', selector: '.price', below: '100' },
    steps: [
      { type: 'trigger', config: { intervalMs: 3600000 } },
      { type: 'browser', config: { action: 'navigate', page: 'auto', url: '{{vars.url}}' } },
      { type: 'extract', label: 'Value', retry: { count: 2, delayMs: 3000 }, config: { page: 'auto', mode: 'text', selector: '{{vars.selector}}' } },
      { id: 'chg', type: 'condition', label: 'Changed?', config: { left: '{{steps.Value.output}}', op: 'changed', onTrue: 'next', onFalse: 'stop' } },
      { type: 'notify', config: { title: '{{workflow}}: now {{steps.Value.output}}', body: '{{vars.url}}' } },
      { type: 'condition', config: { left: '{{steps.Value.output | number}}', op: '<', value: '{{vars.below}}', onTrue: 'next', onFalse: 'stop' } },
      { type: 'notify', config: { title: 'Below {{vars.below}}!', body: '{{steps.Value.output}} at {{vars.url}}' } },
    ] },

  { id: 'uptime', name: 'Website uptime check', category: 'Data',
    help: 'Every 5 minutes, request a URL; after a failure, notify you and log it to a file.',
    vars: { url: 'https://example.com/health' },
    steps: [
      { type: 'trigger', config: { intervalMs: 300000 } },
      { id: 'req', type: 'http', label: 'Check', timeoutMs: 20000, onError: 'down', config: { method: 'GET', url: '{{vars.url}}' } },
      { type: 'stop', config: {} },
      { id: 'down', type: 'notify', label: 'Down', config: { title: '{{vars.url}} is down', body: '{{error.message}}' } },
      { type: 'file', config: { path: 'outages.jsonl', format: 'jsonl', content: '{"at": "{{now}}", "error": {{error.message | json}}}' } },
    ] },

  { id: 'digest', name: 'Morning digest', category: 'Agents',
    help: 'Every weekday at 08:30, ask an agent for a briefing, keep the answer in a dated file and notify you.',
    steps: [
      { type: 'trigger', config: { at: '08:30', days: [1, 2, 3, 4, 5] } },
      { type: 'agent', label: 'Briefing', config: { agentKey: 'claude', await: true, prompt: 'Give me a short morning briefing for {{now:YYYY-MM-DD}}: three things to focus on today, in bullet points.' } },
      { type: 'file', config: { path: 'digests/{{now:YYYY-MM-DD}}.md', format: 'text', mode: 'write', content: '{{steps.Briefing.output}}' } },
      { type: 'notify', config: { title: '{{workflow}}', body: '{{steps.Briefing.output | slice:0,180}}' } },
    ] },

  { id: 'scrape', name: 'Scrape a list to CSV', category: 'Browser',
    help: 'Open a page, read every row of a list (with next-page clicks), and save them as CSV. Adjust the selectors to your site.',
    vars: { url: 'https://news.ycombinator.com/', row: 'tr.athing', next: 'a.morelink', pages: '3' },
    steps: [
      { type: 'trigger', config: {} },
      { type: 'browser', config: { action: 'navigate', page: 'auto', url: '{{vars.url}}' } },
      { type: 'loop', label: 'Pages', config: { times: '{{vars.pages}}', body: 3, max: 50, delayMs: 1500 } },
      { type: 'extract', label: 'Rows', config: { page: 'auto', mode: 'records', selector: '{{vars.row}}', fields: 'title = .titleline > a\nlink = .titleline > a@href\nrank = .rank' } },
      { type: 'file', config: { path: 'scrape-{{now:YYYY-MM-DD}}.csv', format: 'csv', content: '{{steps.Rows.output}}' } },
      { type: 'browser', onError: 'stop', config: { action: 'dom_click', page: 'auto', selector: '{{vars.next}}', waitAfterMs: 2000 } },
      { type: 'notify', config: { title: '{{workflow}} finished', body: 'Saved to the output folder.' } },
    ] },

  { id: 'form', name: 'Fill and submit a form', category: 'Browser',
    help: 'Open a form, fill it from variables (or a webhook’s values), submit, and check it worked — screenshot included.',
    vars: { url: 'https://example.com/contact', name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' },
    steps: [
      { type: 'trigger', config: {} },
      { type: 'browser', config: { action: 'navigate', page: 'auto', url: '{{vars.url}}' } },
      { type: 'browser', config: { action: 'fill', page: 'auto', selector: 'label=Name', value: '{{vars.name}}' } },
      { type: 'browser', config: { action: 'fill', page: 'auto', selector: 'label=Email', value: '{{vars.email}}' } },
      { type: 'browser', config: { action: 'fill', page: 'auto', selector: 'textarea', value: '{{vars.message}}' } },
      { type: 'browser', config: { action: 'submit', page: 'auto', selector: 'textarea' } },
      { type: 'wait_until', config: { kind: 'text', page: 'auto', text: 'thank', timeoutMs: 15000 } },
      { type: 'browser', config: { action: 'screenshot', page: 'auto' } },
    ] },

  { id: 'webhook', name: 'Webhook → agent → Slack', category: 'Agents',
    help: 'When a web request arrives, ask an agent about its text and post the answer to a Slack (or Discord) webhook.',
    vars: { slackUrl: 'https://hooks.slack.com/services/…' },
    steps: [
      { type: 'trigger', config: { webhook: true } },
      { type: 'agent', label: 'Answer', config: { agentKey: 'claude', await: true, prompt: '{{trigger.text | default:trigger}}' } },
      { type: 'http', config: { method: 'POST', url: '{{vars.slackUrl}}', body: '{"text": {{steps.Answer.output | json}}}' } },
    ] },

  { id: 'visit', name: 'When I open a page', category: 'Browser',
    help: 'When you open a matching page, read its title and text and ask an agent to summarise it into a notes file.',
    steps: [
      { type: 'trigger', config: { event: 'page.visited', match: '*://*.wikipedia.org/wiki/*', cooldownMs: 60000 } },
      { type: 'agent', label: 'Summary', config: { agentKey: 'claude', await: true, prompt: 'Summarise this page in three bullet points: {{trigger.url}} ({{trigger.title}})' } },
      { type: 'file', config: { path: 'page-notes.md', format: 'text', content: '## {{trigger.title}}\n{{trigger.url}}\n\n{{steps.Summary.output}}\n' } },
    ] },

  { id: 'health', name: 'Guardian health check', category: 'NEXUS',
    help: 'Every 15 minutes, check that Guardian answers; a failed check shows in the run history and notifies you.',
    steps: [
      { type: 'trigger', config: { intervalMs: 900000 } },
      { type: 'command', onError: 'down', config: { system: 'guardian', method: 'GET', endpoint: '/health' } },
      { type: 'stop', config: {} },
      { id: 'down', type: 'notify', config: { title: 'Guardian is not answering', body: '{{error.message}}' } },
    ] },

  { id: 'queue', name: 'Queue watchdog', category: 'NEXUS',
    help: 'Every 5 minutes, warn you when more than 5 prompts are waiting in the mesh.',
    steps: [
      { id: 't1', type: 'trigger', config: { intervalMs: 300000 } },
      { id: 'c1', type: 'condition', config: { var: 'mesh.queueDepth', op: '>', value: '5', onTrue: 'next', onFalse: 'stop' } },
      { id: 'n1', type: 'notify', config: { title: 'Mesh queue is backing up', body: 'More than 5 prompts are waiting.' } },
    ] },
];

module.exports = { TEMPLATES };
