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

  // 0.60.56 — James: "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way to test them"
  { id: 'chat-read', name: 'Read one chat slowly (test)', category: 'Browser',
    help: 'Opens one chat page, scrolls it a little at a time (ErosmancerOS wheel, or arrow keys) until nothing new loads, then counts what it found. Run it by hand on a chat to test the scrolling before the background reader uses it. Fill in the chat address and the selector for one message.',
    vars: { chatUrl: 'https://chatgpt.com/c/PASTE-A-CHAT-ID', countSelector: '[data-message-id]', via: 'erosmancer', direction: 'up', stepPx: '120', pauseMs: '700', stableRounds: '4' },
    steps: [
      { type: 'trigger', config: {} },
      { type: 'browser', label: 'Open the chat', config: { action: 'navigate', page: 'auto', url: '{{vars.chatUrl}}' } },
      { type: 'wait_until', config: { kind: 'present', page: 'auto', selector: '{{vars.countSelector}}', timeoutMs: 30000 } },
      { type: 'browser', label: 'Scroll', config: { action: 'scroll_until', page: 'auto', via: '{{vars.via}}', direction: '{{vars.direction}}', stepPx: '{{vars.stepPx}}', pauseMs: '{{vars.pauseMs}}', countSelector: '{{vars.countSelector}}', stableRounds: '{{vars.stableRounds}}', maxRounds: 300 } },
      { type: 'extract', label: 'Messages', config: { page: 'auto', mode: 'count', selector: '{{vars.countSelector}}' } },
      { type: 'log', config: { message: 'scrolled {{steps.Scroll.output.rounds}} steps via {{steps.Scroll.output.via}}; {{steps.Messages.output}} messages on the page ({{steps.Scroll.output.countBefore}} before)' } },
    ] },

  // 0.60.62 — James, 2026-10-15: "also need that macro or automation template for the chatgpt listener/scraper"
  { id: 'chatgpt-scrape', name: 'ChatGPT chats: read new ones to a file', category: 'Browser',
    help: 'Opens ChatGPT, reads the chat list in the sidebar, then opens each chat NOT seen before, scrolls it to the top, and saves its messages (who said it, the text) as one line of JSON per chat. Run it by hand first on one chat (set Max chats to 1). A chat already read is skipped even if it has new messages since: that is the honest limit until the crawler tracks changes. The selectors are ChatGPT\'s today and can change; fix them here, not in code.',
    vars: { home: 'https://chatgpt.com/', chatLink: 'a[href^="/c/"]', messageSelector: '[data-message-author-role]', maxChats: '5', via: 'erosmancer', stepPx: '120', pauseMs: '700', stableRounds: '4' },
    steps: [
      { type: 'trigger', config: {} },
      { type: 'browser', label: 'Open ChatGPT', config: { action: 'navigate', page: 'auto', url: '{{vars.home}}' } },
      { type: 'wait_until', config: { kind: 'present', page: 'auto', selector: '{{vars.chatLink}}', timeoutMs: 30000 } },
      { type: 'extract', label: 'Chats', config: { page: 'auto', mode: 'records', selector: '{{vars.chatLink}}', limit: 200, fields: 'title = @text\nlink = @href' } },
      { type: 'loop', label: 'Each new chat', config: { items: '{{steps.Chats.output}}', body: 5, onlyNew: '{{item.link}}', max: '{{vars.maxChats}}', delayMs: 2000 } },
      { type: 'browser', label: 'Open the chat', config: { action: 'navigate', page: 'auto', url: '{{item.link}}' } },
      { type: 'wait_until', config: { kind: 'present', page: 'auto', selector: '{{vars.messageSelector}}', timeoutMs: 30000 } },
      { type: 'browser', label: 'Scroll', config: { action: 'scroll_until', page: 'auto', via: '{{vars.via}}', direction: 'up', stepPx: '{{vars.stepPx}}', pauseMs: '{{vars.pauseMs}}', countSelector: '{{vars.messageSelector}}', stableRounds: '{{vars.stableRounds}}', maxRounds: 300 } },
      { type: 'extract', label: 'Messages', config: { page: 'auto', mode: 'records', selector: '{{vars.messageSelector}}', fields: 'role = @attr:data-message-author-role\nid = @attr:data-message-id\ntext = @text' } },
      { type: 'file', label: 'Save', config: { path: 'chatgpt-chats.jsonl', format: 'jsonl', content: '{"read": {{now:YYYY-MM-DD HH:mm | json}}, "title": {{item.title | json}}, "link": {{item.link | json}}, "messages": {{steps.Messages.output | json}}}' } },
      { type: 'notify', config: { title: '{{workflow}} finished', body: 'Chats saved to chatgpt-chats.jsonl in the output folder.' } },
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

  // 0.60.64 — James, 2026-10-16: "can you make a bunch of jobs for me for clearglass." Each one answers something that actually went wrong or was asked for in this project's own logs.
  { id: 'nexus-release', name: 'New Nexus release is out', category: 'NEXUS',
    help: 'Every 6 hours, ask GitHub for the latest Nexus release and notify you when its version changes. (He was 17 releases behind because nothing told him.) Public releases only; a private repository needs a token header added on the Check step. The first run only remembers the version.',
    vars: { repo: 'HorrisEllis/nexus' },
    steps: [
      { type: 'trigger', config: { intervalMs: 21600000 } },
      { type: 'http', label: 'Check', timeoutMs: 20000, retry: { count: 2, delayMs: 5000 }, config: { method: 'GET', url: 'https://api.github.com/repos/{{vars.repo}}/releases/latest', headers: 'Accept = application/vnd.github+json' } },
      { type: 'condition', label: 'New version?', config: { left: '{{steps.Check.output.body.tag_name}}', op: 'changed', onTrue: 'next', onFalse: 'stop' } },
      { type: 'notify', config: { title: 'Nexus {{steps.Check.output.body.tag_name}} is out', body: '{{steps.Check.output.body.html_url}}' } },
    ] },

  { id: 'nexus-release-deliver', name: 'Bring new Nexus releases to COS', category: 'NEXUS',
    help: 'Every 6 hours, put the latest Nexus release in COS\'s inbox (the same as `nexus-release fetch`): the zip is downloaded, checked against the published SHA256SUMS, and only then handed over. What COS does with it is its Updates setting: off, ask (the default), or auto. Nothing is switched by this job.',
    vars: {},
    steps: [
      { type: 'trigger', config: { intervalMs: 21600000 } },
      { type: 'http', label: 'Fetch', timeoutMs: 600000, retry: { count: 1, delayMs: 60000 }, config: { method: 'POST', url: 'http://127.0.0.1:7702/cli/releases/fetch', body: '{}', failOnHttpError: false } },
      { type: 'condition', config: { left: '{{steps.Fetch.output.body.action}}', op: '==', value: 'delivered', onTrue: 'next', onFalse: 'stop' } },
      { type: 'notify', config: { title: 'Nexus {{steps.Fetch.output.body.version}} is in the COS inbox', body: '{{steps.Fetch.output.body.reason}}' } },
    ] },

  { id: 'ollama-models', name: 'Ollama is up and has its models', category: 'NEXUS',
    help: 'Every 30 minutes, check that Ollama answers and that the model Nexus embeds with is installed. Your boot log showed "nomic-embed-text" missing and Ollama failing under memory pressure; this says so once instead of after 63 failed tries.',
    vars: { host: 'http://127.0.0.1:11434', model: 'nomic-embed-text' },
    steps: [
      { type: 'trigger', config: { intervalMs: 1800000 } },
      { type: 'http', label: 'Tags', timeoutMs: 8000, onError: 'down', config: { method: 'GET', url: '{{vars.host}}/api/tags' } },
      { type: 'condition', label: 'Model installed?', config: { left: '{{steps.Tags.output.body.models | json}}', op: 'contains', value: '{{vars.model}}', onTrue: 'stop', onFalse: 'next' } },
      { type: 'notify', config: { title: 'Ollama is missing {{vars.model}}', body: 'Run: ollama pull {{vars.model}}' } },
      { type: 'stop', config: {} },
      { id: 'down', type: 'notify', config: { title: 'Ollama is not answering', body: '{{error.message}}' } },
    ] },

  { id: 'guardian-errors', name: 'Guardian jobs are failing', category: 'NEXUS',
    help: 'Every 15 minutes, count the jobs Guardian lists as failed and notify you when there are more than the limit, with the newest error. A pile of failures is the first sign a provider tab is not picking up work.',
    vars: { max: '5' },
    steps: [
      { type: 'trigger', config: { intervalMs: 900000 } },
      { type: 'command', label: 'Jobs', onError: 'down', config: { system: 'guardian', method: 'GET', endpoint: '/jobs?status=error&limit=200' } },
      { type: 'condition', config: { left: '{{steps.Jobs.output.jobs | length}}', op: '>', value: '{{vars.max}}', onTrue: 'next', onFalse: 'stop' } },
      { type: 'notify', config: { title: '{{steps.Jobs.output.jobs | length}} Guardian jobs have failed', body: 'Newest: {{steps.Jobs.output.jobs | last | json}}' } },
      { type: 'stop', config: {} },
      { id: 'down', type: 'notify', config: { title: 'Guardian is not answering', body: '{{error.message}}' } },
    ] },

  { id: 'chat-crawl-start', name: 'Start chat capture when Clear Glass starts', category: 'Browser',
    help: 'When Clear Glass starts, start the chat crawler for one account (the same as `chat-crawl start chatgpt:ACCOUNT`). The account must already be switched on in Settings > Chat capture; if it is off, this says so and does nothing.',
    vars: { account: 'chatgpt:PASTE-ACCOUNT-ID' },
    steps: [
      { type: 'trigger', config: { event: 'app.start' } },
      { type: 'delay', config: { ms: 60000 } },
      { type: 'http', label: 'Start', timeoutMs: 15000, config: { method: 'POST', url: 'http://127.0.0.1:7702/cli/chats/crawl/start', body: '{"account": {{vars.account | json}}}', failOnHttpError: false } },
      { type: 'condition', config: { left: '{{steps.Start.output.body.ok}}', op: '==', value: 'true', onTrue: 'stop', onFalse: 'next' } },
      { type: 'notify', config: { title: 'Chat capture did not start', body: '{{steps.Start.output.body.error}}' } },
    ] },

  { id: 'chat-crawl-report', name: 'Chat capture: weekly report', category: 'Browser',
    help: 'Every Monday morning, read the chat crawler\'s progress (chats listed, logged, failed, pending) and notify you with the numbers. Nothing is started or changed.',
    vars: {},
    steps: [
      { type: 'trigger', config: { cron: '0 9 * * 1' } },
      { type: 'http', label: 'Status', timeoutMs: 15000, config: { method: 'GET', url: 'http://127.0.0.1:7702/cli/chats/crawl/status' } },
      { type: 'notify', config: { title: 'Chat capture this week', body: '{{steps.Status.output.body | json}}' } },
    ] },
];

module.exports = { TEMPLATES };
