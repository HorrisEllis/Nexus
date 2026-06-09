/**

- bridge-ai-identity
- Sovereign AI identity layer for Bridge OS.
- Assigns named AppID identities to external AI providers (ChatGPT, Claude, Gemini),
- classifies user intent, routes to the correct provider, and exposes
- everything as callto-compatible API endpoints for bridge-cli consumption.
- 
- Architecture:
- bridge-cli → intent → bridge-ai-identity → callto dispatch → provider
- All calls flow through bridge-data pipeline: identity → sngate → IME → callto
- 
- Provider Identities:
- chatgpt — Coding, debugging, step-by-step reasoning, tool use, code gen
- claude — Long context, analysis, nuanced writing, safety-aware, architecture
- gemini — Multimodal, Google ecosystem, real-time/search grounded, data tasks
- 
- Author: Bridge OS / James Brooks (Erosmancer)
*/

'use strict';

// ─── Intent Classification ────────────────────────────────────────────────────

/**

- Intent taxonomy. Each intent maps to a primary provider and a fallback.
- Weights are used when multiple signals match.
*/
const INTENT_MAP = {
// ChatGPT: coding, debugging, tool use, step-by-step
code_generate: { primary: 'chatgpt', fallback: 'claude', confidence: 0.92 },
code_debug: { primary: 'chatgpt', fallback: 'claude', confidence: 0.90 },
code_refactor: { primary: 'chatgpt', fallback: 'claude', confidence: 0.88 },
code_explain: { primary: 'chatgpt', fallback: 'claude', confidence: 0.82 },
tool_use: { primary: 'chatgpt', fallback: 'gemini', confidence: 0.85 },
step_by_step: { primary: 'chatgpt', fallback: 'claude', confidence: 0.80 },
scripting: { primary: 'chatgpt', fallback: 'claude', confidence: 0.88 },

// Claude: analysis, long context, writing, architecture, safety
analyze:         { primary: 'claude',  fallback: 'chatgpt', confidence: 0.91 },
summarize:       { primary: 'claude',  fallback: 'gemini',  confidence: 0.87 },
long_context:    { primary: 'claude',  fallback: 'chatgpt', confidence: 0.95 },
architecture:    { primary: 'claude',  fallback: 'chatgpt', confidence: 0.89 },
writing:         { primary: 'claude',  fallback: 'chatgpt', confidence: 0.86 },
safety_review:   { primary: 'claude',  fallback: 'chatgpt', confidence: 0.93 },
reasoning:       { primary: 'claude',  fallback: 'chatgpt', confidence: 0.88 },
document:        { primary: 'claude',  fallback: 'chatgpt', confidence: 0.84 },

// Gemini: search-grounded, multimodal, Google ecosystem, real-time data
search_grounded: { primary: 'gemini',  fallback: 'chatgpt', confidence: 0.90 },
multimodal:      { primary: 'gemini',  fallback: 'chatgpt', confidence: 0.94 },
real_time:       { primary: 'gemini',  fallback: 'chatgpt', confidence: 0.88 },
google_workspace:{ primary: 'gemini',  fallback: 'claude',  confidence: 0.92 },
data_analysis:   { primary: 'gemini',  fallback: 'claude',  confidence: 0.83 },
image_input:     { primary: 'gemini',  fallback: 'chatgpt', confidence: 0.96 },
};

/**

- Keyword → intent signal map.
- Multiple keywords can fire the same intent signal.
*/
const KEYWORD_SIGNALS = {
// Code signals → chatgpt
'write code': 'code_generate',
'generate code': 'code_generate',
'build a': 'code_generate',
'create a function':'code_generate',
'implement': 'code_generate',
'fix this': 'code_debug',
'debug': 'code_debug',
'why is this': 'code_debug',
'error': 'code_debug',
'refactor': 'code_refactor',
'clean up': 'code_refactor',
'optimize': 'code_refactor',
'explain this code':'code_explain',
'how does': 'code_explain',
'step by step': 'step_by_step',
'walk me through': 'step_by_step',
'script': 'scripting',
'bash': 'scripting',
'powershell': 'scripting',
'automate': 'scripting',

// Analysis signals → claude
'analyze':          'analyze',
'analyse':          'analyze',
'review':           'analyze',
'evaluate':         'analyze',
'summarize':        'summarize',
'summarise':        'summarize',
'tldr':             'summarize',
'long document':    'long_context',
'entire file':      'long_context',
'full codebase':    'long_context',
'architecture':     'architecture',
'design pattern':   'architecture',
'system design':    'architecture',
'write a':          'writing',
'draft':            'writing',
'essay':            'writing',
'security review':  'safety_review',
'safety':           'safety_review',
'risk':             'safety_review',
'think through':    'reasoning',
'reason about':     'reasoning',
'document':         'document',
'readme':           'document',

// Search/real-time signals → gemini
'latest':           'real_time',
'current':          'real_time',
'today':            'real_time',
'news':             'search_grounded',
'search for':       'search_grounded',
'find information': 'search_grounded',
'look up':          'search_grounded',
'image':            'image_input',
'photo':            'image_input',
'screenshot':       'image_input',
'google docs':      'google_workspace',
'google sheets':    'google_workspace',
'gmail':            'google_workspace',
'spreadsheet':      'data_analysis',
'dataset':          'data_analysis',
'csv':              'data_analysis',
};

/**

- Classify a natural-language prompt into an intent and target provider.
- Returns { intent, provider, fallback, confidence, signals[] }
*/
function classifyIntent(prompt) {
const lower = prompt.toLowerCase();
const matched = [];

for (const [keyword, intent] of Object.entries(KEYWORD_SIGNALS)) {
if (lower.includes(keyword)) {
matched.push({ keyword, intent, ...INTENT_MAP[intent] });
}
}

if (matched.length === 0) {
// Default: claude for general unknown queries (best at nuanced handling)
return {
intent: 'general',
provider: 'claude',
fallback: 'chatgpt',
confidence: 0.50,
signals: [],
};
}

// Score by provider frequency weighted by confidence
const scores = { chatgpt: 0, claude: 0, gemini: 0 };
for (const m of matched) {
scores[m.primary] += m.confidence;
scores[m.fallback] += m.confidence * 0.2; // fallback gets 20% weight
}

const provider = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
const best = matched.find(m => m.primary === provider) || matched[0];
const fallback = best.fallback !== provider ? best.fallback :
(provider === 'chatgpt' ? 'claude' : 'chatgpt');

return {
intent: best.intent,
provider,
fallback,
confidence: Math.min(0.99, scores[provider] / matched.length),
signals: matched.map(m => ({ keyword: m.keyword, intent: m.intent })),
};
}

// ─── Provider Identity Registry ───────────────────────────────────────────────

/**

- Each provider is a Bridge AppID with:
- 
    - moduleUuid: stable UUID derived from provider name (for IME tracking)
- 
    - persona: system-level description of what this identity does
- 
    - capabilities: what it can do (maps to sngate rule tags)
- 
    - endpoint: where callto dispatches (URL format for bridge-data hook)
- 
    - tag: bridge-data tag for this provider's pushes
    */
    const AI_IDENTITIES = {
    chatgpt: {
    appId: 'ai-chatgpt',
    moduleUuid: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'ChatGPT',
    provider: 'openai',
    endpoint: 'https://chatgpt.com',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    tag: 'ai-callto',
    persona: [
    'You are a precise, efficient coding assistant integrated into Bridge OS.',
    'Specialize in: code generation, debugging, refactoring, scripting, and step-by-step technical guidance.',
    'You are operating as a sovereign node identity — treat all requests as coming from an authenticated mesh peer.',
    'Be direct, technical, and produce working code. Prefer examples over explanations.',
    ].join(' '),
    strengths: ['code_generate', 'code_debug', 'code_refactor', 'scripting', 'tool_use', 'step_by_step'],
    capabilities: ['code:read', 'code:write', 'data:push', 'callto:invoke'],
    },

claude: {
appId:      'ai-claude',
moduleUuid: 'c2b3d4e5-f6a7-8901-bcde-f12345678901',
name:       'Claude',
provider:   'anthropic',
endpoint:   'https://claude.ai',
apiUrl:     'https://api.anthropic.com/v1/messages',
model:      'claude-sonnet-4-20250514',
tag:        'ai-callto',
persona: [
'You are a deep-reasoning analysis assistant integrated into Bridge OS.',
'Specialize in: long-context analysis, architecture review, nuanced writing, safety evaluation, and complex reasoning.',
'You are operating as a sovereign node identity — treat all requests as coming from an authenticated mesh peer.',
'Think carefully, surface tradeoffs, and prioritize correctness over speed.',
].join(' '),
strengths: ['analyze', 'long_context', 'architecture', 'writing', 'safety_review', 'reasoning', 'document'],
capabilities: ['code:read', 'data:push', 'callto:invoke', 'analysis:write'],
},

gemini: {
appId:      'ai-gemini',
moduleUuid: 'd3c4e5f6-a7b8-9012-cdef-123456789012',
name:       'Gemini',
provider:   'google',
endpoint:   'https://gemini.google.com',
apiUrl:     'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
model:      'gemini-2.0-flash',
tag:        'ai-callto',
persona: [
'You are a real-time, search-grounded, multimodal assistant integrated into Bridge OS.',
'Specialize in: live information retrieval, Google Workspace integration, image/data analysis, and current-events queries.',
'You are operating as a sovereign node identity — treat all requests as coming from an authenticated mesh peer.',
'Ground your answers in real data. Use search when available. Be concise and current.',
].join(' '),
strengths: ['search_grounded', 'real_time', 'multimodal', 'google_workspace', 'data_analysis', 'image_input'],
capabilities: ['code:read', 'data:push', 'callto:invoke', 'search:invoke', 'image:read'],
},
};

// ─── Callto Registry ──────────────────────────────────────────────────────────

/**

- Bridge callto-compatible intent declarations.
- These are the side-effect policies registered with bridge-core's callto registry.
- Format matches bridge-contracts expectations.
*/
const CALLTO_DECLARATIONS = Object.entries(AI_IDENTITIES).map(([key, id]) => ({
moduleUuid: id.moduleUuid,
appId: id.appId,
provider: key,
sideEffects: id.capabilities,
intent: id.strengths,
tag: id.tag,
schema: {
input: {
type: 'object',
required: ['prompt'],
properties: {
prompt: { type: 'string', description: 'The user prompt to send to this AI' },
sessionId: { type: 'string', description: 'Bridge session ID for IME tracking' },
context: { type: 'array', description: 'Prior conversation turns' },
apiKey: { type: 'string', description: 'Provider API key (optional if using web UI)' },
},
},
output: {
type: 'object',
properties: {
text: { type: 'string' },
provider: { type: 'string' },
model: { type: 'string' },
intent: { type: 'string' },
latencyMs: { type: 'number' },
tokens: { type: 'object' },
},
},
},
}));

// ─── Dispatch Engine ──────────────────────────────────────────────────────────

/**

- Dispatch a prompt to a provider via API (if key available) or
- return a nexus:// URI for the bridge-cli to open in the web UI.
- 
- This is the callto hook that bridge-data registers.
*/
async function dispatch(provider, prompt, opts = {}) {
const identity = AI_IDENTITIES[provider];
if (!identity) throw new Error(`Unknown AI provider: ${provider}`);

const { apiKey, context = [], sessionId, stream = false } = opts;
const t0 = Date.now();

// If no API key, return a callto intent URI for the CLI to handle
if (!apiKey) {
return {
ok:       true,
mode:     'ui-redirect',
provider,
intent:   opts.intent || 'general',
uri:      identity.endpoint,
prompt,
nexusUri: `nexus://ai-callto?provider=${provider}&intent=${opts.intent || 'general'}`,
message:  `No API key for ${identity.name}. Open ${identity.endpoint} to continue.`,
};
}

// API dispatch
try {
let response;

if (provider === 'chatgpt') {
  response = await _dispatchOpenAI(identity, prompt, context, apiKey, stream);
} else if (provider === 'claude') {
  response = await _dispatchAnthropic(identity, prompt, context, apiKey, stream);
} else if (provider === 'gemini') {
  response = await _dispatchGemini(identity, prompt, context, apiKey);
}

return {
  ok:        true,
  mode:      'api',
  provider,
  model:     identity.model,
  intent:    opts.intent || 'general',
  text:      response.text,
  tokens:    response.tokens,
  latencyMs: Date.now() - t0,
  sessionId,
};

} catch (err) {
return {
ok:        false,
provider,
error:     err.message,
latencyMs: Date.now() - t0,
};
}
}

async function _dispatchOpenAI(identity, prompt, context, apiKey, stream) {
const messages = [
{ role: 'system', content: identity.persona },
...context,
{ role: 'user', content: prompt },
];

const res = await fetch(identity.apiUrl, {
method:  'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
body:    JSON.stringify({ model: identity.model, messages, stream }),
});

if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
const data = await res.json();

return {
text:   data.choices[0].message.content,
tokens: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
};
}

async function _dispatchAnthropic(identity, prompt, context, apiKey) {
const res = await fetch(identity.apiUrl, {
method:  'POST',
headers: {
'Content-Type':      'application/json',
'x-api-key':         apiKey,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model:      identity.model,
max_tokens: 4096,
system:     identity.persona,
messages:   [...context, { role: 'user', content: prompt }],
}),
});

if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
const data = await res.json();

return {
text:   data.content[0].text,
tokens: { input: data.usage.input_tokens, output: data.usage.output_tokens },
};
}

async function _dispatchGemini(identity, prompt, context, apiKey) {
const contents = [
...context.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
{ role: 'user', parts: [{ text: prompt }] },
];

const res = await fetch(`${identity.apiUrl}?key=${apiKey}`, {
method:  'POST',
headers: { 'Content-Type': 'application/json' },
body:    JSON.stringify({
system_instruction: { parts: [{ text: identity.persona }] },
contents,
}),
});

if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
const data = await res.json();

return {
text:   data.candidates[0].content.parts[0].text,
tokens: {
input:  data.usageMetadata?.promptTokenCount,
output: data.usageMetadata?.candidatesTokenCount,
},
};
}

// ─── Bridge-Data Hook Registration ───────────────────────────────────────────

/**

- Register this module's hooks with bridge-data.
- Called at boot, after bridge-contracts validates the interface.
- 
- dataBus.registerHook(moduleUuid, handler) — matches bridge-data API.
*/
function registerWithDataBus(dataBus, busEmit) {
for (const [provider, identity] of Object.entries(AI_IDENTITIES)) {
dataBus.registerHook(identity.moduleUuid, async (payload, metadata) => {
const { prompt, apiKey, context, sessionId } = payload;
const classification = classifyIntent(prompt);
    
    // Re-route if intent says different provider
    const targetProvider = classification.provider !== provider
    ? classification.provider
    : provider;
    
    const result = await dispatch(targetProvider, prompt, {
    apiKey, context, sessionId,
    intent: classification.intent,
    });
    
    busEmit('ai:response', {
    ...result,
    classification,
    originalProvider: provider,
    sessionId,
    ts: Date.now(),
    });
    
    return result;
    });
    
    busEmit('ai:identity:registered', {
    appId:    identity.appId,
    provider,
    moduleUuid: identity.moduleUuid,
    strengths:  identity.strengths,
    });
    }
    }
    

// ─── HTTP Route Handlers ──────────────────────────────────────────────────────

/**

- Mount routes onto an Express-compatible app.
- Integrates with Bridge OS's existing HTTP server at :3747.
*/
function mountRoutes(app, { busEmit, gate, ime } = {}) {

// GET /ai/identities — list all registered AI identities
app.get('/ai/identities', (req, res) => {
res.json({
ok: true,
identities: Object.entries(AI_IDENTITIES).map(([key, id]) => ({
provider:   key,
appId:      id.appId,
moduleUuid: id.moduleUuid,
name:       id.name,
model:      id.model,
endpoint:   id.endpoint,
strengths:  id.strengths,
capabilities: id.capabilities,
})),
});
});

// POST /ai/classify — classify a prompt without dispatching
app.post('/ai/classify', (req, res) => {
const { prompt } = req.body;
if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

const result = classifyIntent(prompt);
const identity = AI_IDENTITIES[result.provider];

res.json({
  ok: true,
  ...result,
  providerName: identity.name,
  model:        identity.model,
  endpoint:     identity.endpoint,
  nexusUri:     `nexus://ai-callto?provider=${result.provider}&intent=${result.intent}`,
});

});

// POST /ai/dispatch — classify + dispatch a prompt
app.post('/ai/dispatch', async (req, res) => {
const { prompt, provider: forceProvider, apiKey, context, sessionId } = req.body;
if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

// Classify intent
const classification = classifyIntent(prompt);
const provider = forceProvider || classification.provider;

// Sngate check (if wired)
if (gate) {
  const decision = gate.evaluate({
    uuid:      sessionId || 'anonymous',
    operation: 'ai:dispatch',
    tag:       'ai-callto',
    context:   { provider, intent: classification.intent },
  });
  if (decision.decision === 'deny') {
    return res.status(403).json({ ok: false, error: 'gate:denied', reason: decision.reason });
  }
}

// IME ingest (if wired)
if (ime) {
  await ime.ingest({
    uuid:         sessionId || 'anonymous',
    operation:    'ai:dispatch',
    tag:          'ai-callto',
    payload_hash: require('crypto').createHash('sha256').update(prompt).digest('hex'),
    ts:           Date.now(),
  });
}

const result = await dispatch(provider, prompt, {
  apiKey, context, sessionId,
  intent: classification.intent,
});

busEmit && busEmit('ai:dispatch', {
  provider, intent: classification.intent,
  sessionId, latencyMs: result.latencyMs,
});

res.json({ ok: true, classification, ...result });

});

// GET /ai/callto — callto registry for bridge-core
app.get('/ai/callto', (req, res) => {
res.json({ ok: true, declarations: CALLTO_DECLARATIONS });
});

// GET /ai/status — module health
app.get('/ai/status', (req, res) => {
res.json({
ok:        true,
module:    'bridge-ai-identity',
version:   '1.0.0',
providers: Object.keys(AI_IDENTITIES),
intents:   Object.keys(INTENT_MAP),
keywords:  Object.keys(KEYWORD_SIGNALS).length,
});
});
}

// ─── CLI Command Handler ──────────────────────────────────────────────────────

/**

- Handle natural-language AI commands from bridge-cli.
- 
- Examples:
- ai "debug this error: Cannot read property of undefined"
- ai --provider claude "analyze the architecture of this module"
- ai --classify "write a bash script to monitor disk usage"
*/
async function handleCLICommand(args, opts = {}) {
const { classify: classifyOnly, provider: forceProvider, apiKey } = opts;
const prompt = args.join(' ');

if (!prompt) {
return `
bridge-ai-identity — Sovereign AI Intent Router

Usage:
ai "<prompt>"                          Auto-route to best provider
ai --provider chatgpt "<prompt>"       Force a specific provider
ai --classify "<prompt>"               Show routing decision only
ai --list                              List all AI identities

Providers:
chatgpt  → code generation, debugging, scripting, step-by-step
claude   → analysis, long context, architecture, safety, writing
gemini   → search-grounded, multimodal, real-time, Google Workspace
`.trim();
}

if (opts.list) {
return Object.entries(AI_IDENTITIES).map(([key, id]) =>
  `${key.padEnd(10)} ${id.name.padEnd(12)} ${id.model.padEnd(30)} ${id.strengths.slice(0, 3).join(', ')}`
).join('\n');
}

const classification = classifyIntent(prompt);
const provider = forceProvider || classification.provider;
const identity = AI_IDENTITIES[provider];

if (classifyOnly) {
return [
`Intent:     ${classification.intent}`,
`Provider:   ${identity.name} (${provider})`,
`Fallback:   ${AI_IDENTITIES[classification.fallback]?.name || classification.fallback}`,
`Confidence: ${(classification.confidence * 100).toFixed(0)}%`,
`Signals:    ${classification.signals.map(s => s.keyword).join(', ') || 'none'}`,
`Endpoint:   ${identity.endpoint}`,
`NexusURI:   nexus://ai-callto?provider=${provider}&intent=${classification.intent}`,
].join('\n');
}

const result = await dispatch(provider, prompt, {
apiKey, intent: classification.intent,
});

if (result.mode === 'ui-redirect') {
return [
`→ Routed to ${identity.name} (${classification.intent}, ${(classification.confidence * 100).toFixed(0)}% confidence)`,
  `No API key configured. Open: ${identity.endpoint}`,
  `NexusURI: ${result.nexusUri}`,
].join('\n');
}

return [
`→ ${identity.name} [${result.model}] ${result.latencyMs}ms`,
  `Intent: ${classification.intent} (${(classification.confidence * 100).toFixed(0)}% confidence)`,
'',
result.text,
'',
result.tokens ?   `Tokens: ${result.tokens.input} in / ${result.tokens.output} out` : '',
].join('\n');
}

// ─── Module Export ────────────────────────────────────────────────────────────

module.exports = {
// Core
classifyIntent,
dispatch,

// Registry
AI_IDENTITIES,
INTENT_MAP,
CALLTO_DECLARATIONS,

// Integration
registerWithDataBus,
mountRoutes,
handleCLICommand,

// Module metadata (bridge-contracts compatible)
MODULE: {
name:    'bridge-ai-identity',
version: '1.0.0',
vital:   false,
requires: ['bridge-identity', 'bridge-sngate', 'bridge-IME', 'bridge-data'],
exposes: {
classifyIntent:      'function',
dispatch:            'function',
AI_IDENTITIES:       'object',
CALLTO_DECLARATIONS: 'array',
registerWithDataBus: 'function',
mountRoutes:         'function',
handleCLICommand:    'function',
},
},
};
