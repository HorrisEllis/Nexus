/**
 * archetype/registry.js
 * COMPARTMENT OS — Built-in Archetype Registry (spec §60.2)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * All 16 built-in archetypes, transcribed from spec §60.2.
 *
 * NOTE on `id`: spec §60.1's JSON Schema requires `id: { format: "uuid" }`,
 * but §60.2's illustrative listing used mnemonic strings like
 * 'arch-web-server-0001' — those are not valid UUID v4 and fail
 * validateArchetype() (which enforces the schema literally, COS-1).
 * Real UUID v4s were minted once and hardcoded below. The spec mnemonic
 * is kept as a comment next to each entry for cross-reference back to
 * the spec text. Lookup by `name` (kebab-case, e.g. 'web-server') is the
 * stable, human-facing identifier — that string is unchanged from spec.
 *
 * Every entry runs through validateArchetype() before being frozen into
 * ARCHETYPES — a malformed built-in throws at require() time, not later.
 */

'use strict';

const { validateArchetype } = require('./schema.js');

const ARCHETYPES_RAW = [

  // arch-web-server-0001
  {
    id: 'bbc98301-13a0-4fde-b078-64f71d59beb0',
    name: 'web-server',
    version: '1.0.0',
    displayName: 'Web Server',
    description: 'HTTP server with health checks, proxy, and hot-reload',
    icon: '🌐',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'go', 'bun', 'deno'],
    resources: {
      cpuLimitPercent: 80, cpuPriority: 'normal',
      ramLimitMB: 512, ramReservedMB: 64,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 80,
      stallTimeoutMs: 60000, crashLoopLimit: 3, crashLoopWindowMs: 60000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: { path: '/', expectedStatus: 200, intervalMs: 30000, timeoutMs: 5000, failThreshold: 3 },
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 3, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['request:received', 'response:sent', 'error:thrown', 'server:started', 'server:stopped'],
      consumes: ['db:query:result', 'auth:validated', 'cache:hit'],
    },
    fsTemplate: [
      { path: 'index.js',     content: "// {{name}} — web server\nconst http = require('http');\nconst server = http.createServer((req, res) => { res.end('OK'); });\nserver.listen(process.env.PORT || 3000);", binary: false },
      { path: 'package.json', content: '{"name":"{{slug}}","version":"1.0.0","main":"index.js","scripts":{"start":"node index.js","dev":"node --watch index.js"}}', binary: false },
      { path: '.cosignore',   content: 'node_modules\n.cos-wal\n*.nex', binary: false },
    ],
    detectionHints: [
      'express', 'fastify', 'hono', 'koa', 'flask', 'django', 'fastapi',
      'gin', 'chi', 'fiber', 'net/http',
      'app.listen(', 'server.listen(', 'http.ListenAndServe', 'uvicorn',
    ],
    tags: ['web', 'http', 'server'],
    builtIn: true, pluginId: null,
  },

  // arch-api-server-0002
  {
    id: '0369e98f-6c2b-477c-88a5-cc00865e311e',
    name: 'api-server',
    version: '1.0.0',
    displayName: 'API Server',
    description: 'REST or GraphQL API — loopback only, internal facing',
    icon: '⚡',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'go', 'bun', 'rust'],
    resources: {
      cpuLimitPercent: 80, cpuPriority: 'normal',
      ramLimitMB: 512, ramReservedMB: 64,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 80,
      stallTimeoutMs: 30000, crashLoopLimit: 3, crashLoopWindowMs: 60000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: { path: '/health', expectedStatus: 200, intervalMs: 15000, timeoutMs: 3000, failThreshold: 2 },
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 1, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['api:request', 'api:response', 'api:error', 'route:registered'],
      consumes: ['db:query:result', 'auth:token:validated', 'cache:result'],
    },
    fsTemplate: [
      { path: 'index.js',     content: "// {{name}} — API server\nconst express = require('express');\nconst app = express();\napp.use(express.json());\napp.get('/health', (_, res) => res.json({ ok: true }));\napp.listen(process.env.PORT || 4000);", binary: false },
      { path: 'package.json', content: '{"name":"{{slug}}","version":"1.0.0","main":"index.js","scripts":{"start":"node index.js","dev":"node --watch index.js"},"dependencies":{"express":"^4.18.0"}}', binary: false },
    ],
    detectionHints: ['express', 'fastify', 'hono', '/api/', 'router.get(', 'router.post(', 'graphql', 'REST'],
    tags: ['api', 'rest', 'graphql', 'internal'],
    builtIn: true, pluginId: null,
  },

  // arch-worker-0003
  {
    id: '27de13a3-b8dd-4bb2-a185-24e5d524d3f2',
    name: 'worker',
    version: '1.0.0',
    displayName: 'Worker',
    description: 'Background job processor — isolated, crash-loop monitored',
    icon: '⚙️',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'bun'],
    resources: {
      cpuLimitPercent: 60, cpuPriority: 'low',
      ramLimitMB: 256, ramReservedMB: 32,
      governorPolicy: 'background', ioThrottle: 'light',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 256, cpuLimitPct: 60,
      stallTimeoutMs: 120000, crashLoopLimit: 3, crashLoopWindowMs: 60000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['job:received', 'job:done', 'job:failed', 'job:progress'],
      consumes: ['job:enqueued', 'job:cancel'],
    },
    fsTemplate: [
      { path: 'worker.js', content: "// {{name}} — background worker\nprocess.on('message', async (job) => {\n  try {\n    // process job\n    process.send({ type: 'job:done', id: job.id });\n  } catch (e) {\n    process.send({ type: 'job:failed', id: job.id, error: e.message });\n  }\n});", binary: false },
    ],
    detectionHints: ['queue', 'worker', 'bull', 'bee-queue', 'celery', 'rq', 'job.process('],
    tags: ['worker', 'background', 'queue'],
    builtIn: true, pluginId: null,
  },

  // arch-scheduler-0004
  {
    id: 'f0e8baec-deec-4cb7-b0d8-723921ace4e3',
    name: 'scheduler',
    version: '1.0.0',
    displayName: 'Scheduler',
    description: 'Job dispatcher / cron runner — enqueues work to workers',
    icon: '🗓️',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python'],
    resources: {
      cpuLimitPercent: 20, cpuPriority: 'background',
      ramLimitMB: 128, ramReservedMB: 16,
      governorPolicy: 'background', ioThrottle: 'light',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 128, cpuLimitPct: 20,
      stallTimeoutMs: 60000, crashLoopLimit: 5, crashLoopWindowMs: 300000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['job:enqueued', 'job:dispatched', 'schedule:tick', 'schedule:missed'],
      consumes: ['job:done', 'job:failed'],
    },
    fsTemplate: [
      { path: 'scheduler.js', content: '// {{name}} — job scheduler\n// Dispatch jobs on a schedule or trigger', binary: false },
    ],
    detectionHints: ['cron', 'node-cron', 'schedule', 'setInterval', 'APScheduler'],
    tags: ['scheduler', 'cron', 'dispatch'],
    builtIn: true, pluginId: null,
  },

  // arch-sandbox-browser-0005
  {
    id: '48888556-2512-414e-8da1-f4f62d39c8f3',
    name: 'sandbox-browser',
    version: '1.0.0',
    displayName: 'Sandbox Browser',
    description: 'Controlled browser — all traffic logged, full replay',
    icon: '🔍',
    runtimeId: 'electron',
    runtimeOptions: ['electron', 'html'],
    resources: {
      cpuLimitPercent: 70, cpuPriority: 'normal',
      ramLimitMB: 1024, ramReservedMB: 256,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 1024, cpuLimitPct: 70,
      stallTimeoutMs: 0, crashLoopLimit: 2, crashLoopWindowMs: 60000,
      fsPolicy: 'block', netPolicy: 'log',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 3, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['page:loaded', 'link:clicked', 'download:started', 'form:submitted', 'network:request'],
      consumes: ['navigate:to', 'inject:script', 'tab:close'],
    },
    fsTemplate: [],
    detectionHints: ['.url file', 'bookmarks.json', 'puppeteer', 'playwright', 'selenium'],
    tags: ['browser', 'sandbox', 'audit'],
    builtIn: true, pluginId: null,
  },

  // arch-compiler-0006
  {
    id: '64dd63bb-d821-497a-9fb4-a5131c1f3edd',
    name: 'compiler',
    version: '1.0.0',
    displayName: 'Compiler',
    description: 'Build runner — high CPU, burst priority, isolated',
    icon: '🔨',
    runtimeId: 'node',
    runtimeOptions: ['node', 'shell', 'go', 'rust'],
    resources: {
      cpuLimitPercent: 100, cpuPriority: 'high',
      ramLimitMB: 512, ramReservedMB: 128,
      governorPolicy: 'burst', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 100,
      stallTimeoutMs: 300000, crashLoopLimit: 2, crashLoopWindowMs: 120000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot+stop',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['build:started', 'build:done', 'build:failed', 'build:warning'],
      consumes: ['build:trigger', 'build:cancel'],
    },
    fsTemplate: [
      { path: 'build.js', content: "// {{name}} — build runner\nconst { execSync } = require('child_process');\ntry {\n  execSync('npm run build', { stdio: 'inherit' });\n  process.exit(0);\n} catch (e) { process.exit(1); }", binary: false },
    ],
    detectionHints: ['tsconfig.json', 'webpack.config', 'vite.config', 'Makefile', 'Cargo.toml', 'go.sum', 'build.gradle'],
    tags: ['build', 'compile', 'ci'],
    builtIn: true, pluginId: null,
  },

  // arch-test-runner-0007
  {
    id: '1b67e397-de99-45ee-95f6-e609b848914b',
    name: 'test-runner',
    version: '1.0.0',
    displayName: 'Test Runner',
    description: 'Automated test suite — times out, isolated, reports pass/fail',
    icon: '✅',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'go', 'rust'],
    resources: {
      cpuLimitPercent: 90, cpuPriority: 'high',
      ramLimitMB: 512, ramReservedMB: 64,
      governorPolicy: 'burst', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 90,
      stallTimeoutMs: 120000, crashLoopLimit: 1, crashLoopWindowMs: 60000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot+stop',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['test:started', 'test:passed', 'test:failed', 'test:suite:done', 'coverage:report'],
      consumes: ['test:trigger', 'test:filter'],
    },
    fsTemplate: [
      { path: 'test/index.test.js', content: "// {{name}} — test suite\ndescribe('{{name}}', () => {\n  it('runs', () => {\n    expect(true).toBe(true);\n  });\n});", binary: false },
    ],
    detectionHints: ['jest', 'vitest', 'mocha', 'pytest', 'go test', 'cargo test', '*.test.js', '*.spec.ts', 'test_*.py'],
    tags: ['test', 'ci', 'quality'],
    builtIn: true, pluginId: null,
  },

  // arch-database-0008
  {
    id: 'be3f2db8-82ad-44a9-9b60-6fe8313db137',
    name: 'database',
    version: '1.0.0',
    displayName: 'Database',
    description: 'Data store — loopback only, strict memory limits',
    icon: '🗄️',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python'],
    resources: {
      cpuLimitPercent: 50, cpuPriority: 'normal',
      ramLimitMB: 1024, ramReservedMB: 256,
      governorPolicy: 'reserved', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 1024, cpuLimitPct: 50,
      stallTimeoutMs: 30000, crashLoopLimit: 2, crashLoopWindowMs: 120000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 1, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['query:received', 'query:result', 'query:error', 'connection:opened', 'connection:closed'],
      consumes: ['db:migrate', 'db:seed', 'db:backup'],
    },
    fsTemplate: [
      { path: 'db.js', content: '// {{name}} — database adapter\n// Wrap your DB client here', binary: false },
      { path: 'data/.gitkeep', content: '', binary: false },
    ],
    detectionHints: ['sqlite', 'better-sqlite3', 'pg', 'mysql2', 'mongoose', 'prisma', 'drizzle', 'sqlalchemy', 'psycopg2'],
    tags: ['database', 'storage', 'data'],
    builtIn: true, pluginId: null,
  },

  // arch-job-queue-0009
  {
    id: '04fdfc75-0c4f-485d-8252-f52b7985e337',
    name: 'job-queue',
    version: '1.0.0',
    displayName: 'Job Queue',
    description: 'In-memory or persistent job queue — stall detection strict',
    icon: '📋',
    runtimeId: 'node',
    runtimeOptions: ['node'],
    resources: {
      cpuLimitPercent: 30, cpuPriority: 'low',
      ramLimitMB: 256, ramReservedMB: 64,
      governorPolicy: 'reserved', ioThrottle: 'light',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 256, cpuLimitPct: 30,
      stallTimeoutMs: 30000, crashLoopLimit: 5, crashLoopWindowMs: 300000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 1, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['job:enqueued', 'job:dispatched', 'queue:full', 'queue:drained'],
      consumes: ['job:add', 'job:cancel', 'queue:pause', 'queue:flush'],
    },
    fsTemplate: [
      { path: 'queue.js', content: "// {{name}} — job queue\nconst queue = [];\nmodule.exports = { enqueue: (job) => queue.push(job), dequeue: () => queue.shift() };", binary: false },
    ],
    detectionHints: ['bull', 'bullmq', 'bee-queue', 'kue', 'queue', 'FIFO'],
    tags: ['queue', 'jobs', 'async'],
    builtIn: true, pluginId: null,
  },

  // arch-file-processor-0010
  {
    id: '60db5523-3a29-4ad4-a756-31bd17adc476',
    name: 'file-processor',
    version: '1.0.0',
    displayName: 'File Processor',
    description: 'Consumes and transforms files — I/O monitored',
    icon: '📁',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'shell'],
    resources: {
      cpuLimitPercent: 70, cpuPriority: 'normal',
      ramLimitMB: 512, ramReservedMB: 64,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 70,
      stallTimeoutMs: 60000, crashLoopLimit: 3, crashLoopWindowMs: 120000,
      fsPolicy: 'log', netPolicy: 'block',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: {
      exposes: ['file:received', 'file:processed', 'file:error', 'batch:done'],
      consumes: ['file:submit', 'batch:trigger'],
    },
    fsTemplate: [
      { path: 'processor.js', content: '// {{name}} — file processor\n// Drop files into /input, processed results written to /output\n', binary: false },
      { path: 'input/.gitkeep',  content: '', binary: false },
      { path: 'output/.gitkeep', content: '', binary: false },
    ],
    detectionHints: ['multer', 'formidable', 'fs.readFile', 'glob', 'chokidar', 'PIL', 'ImageMagick', 'ffmpeg'],
    tags: ['files', 'processing', 'transform'],
    builtIn: true, pluginId: null,
  },

  // arch-containment-0011
  {
    id: '886d79f0-a15b-4ada-80cb-8018330f1e67',
    name: 'containment',
    version: '1.0.0',
    displayName: 'Containment',
    description: 'Maximum isolation. Run untrusted code. Full audit. Kill on violation.',
    icon: '🔒',
    runtimeId: 'exe',
    runtimeOptions: ['exe', 'node', 'python', 'shell'],
    resources: {
      cpuLimitPercent: 25, cpuPriority: 'background',
      ramLimitMB: 256, ramReservedMB: 16,
      governorPolicy: 'background', ioThrottle: 'strict',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 256, cpuLimitPct: 25,
      stallTimeoutMs: 0, crashLoopLimit: 1, crashLoopWindowMs: 0,
      fsPolicy: 'block', netPolicy: 'block',
      onAnomaly: 'snapshot+stop',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['containment:started', 'containment:violation', 'containment:stopped', 'audit:event'],
      consumes: [],
    },
    fsTemplate: [],
    detectionHints: ['untrusted', 'unknown', 'audit', 'malware', 'suspicious'],
    tags: ['security', 'containment', 'audit', 'sandboxie'],
    builtIn: true, pluginId: null,
  },

  // arch-exe-runner-0012
  {
    id: 'a1d47ab6-cea2-4749-bd42-06895d23791b',
    name: 'exe-runner',
    version: '1.0.0',
    displayName: 'EXE Runner',
    description: 'Native Windows executable — full lifecycle management',
    icon: '🪟',
    runtimeId: 'exe',
    runtimeOptions: ['exe'],
    resources: {
      cpuLimitPercent: 80, cpuPriority: 'normal',
      ramLimitMB: 512, ramReservedMB: 64,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 512, cpuLimitPct: 80,
      stallTimeoutMs: 0, crashLoopLimit: 1, crashLoopWindowMs: 0,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 3, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['exe:started', 'exe:exited', 'exe:crashed', 'exe:stdout', 'exe:stderr'],
      consumes: ['exe:launch', 'exe:kill', 'exe:inject-args', 'exe:stdin'],
    },
    fsTemplate: [],
    detectionHints: ['*.exe', 'PE32', 'PE32+'],
    tags: ['exe', 'windows', 'native'],
    builtIn: true, pluginId: null,
  },

  // arch-windows-sandbox-0017
  {
    id: 'e3c1a5f4-7a2b-4b8e-9c1d-2f6a8b0d4e17',
    name: 'windows-sandbox',
    version: '1.0.0',
    displayName: 'Windows Sandbox',
    description: 'Disposable, isolated Windows VM — Sandboxie-style. Every run starts clean, nothing survives.',
    icon: '🧊',
    runtimeId: 'qemu-windows',
    runtimeOptions: ['qemu-windows'],
    resources: {
      cpuLimitPercent: 100, cpuPriority: 'normal',
      ramLimitMB: 4096, ramReservedMB: 512,
      governorPolicy: 'reserved', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 4096, cpuLimitPct: 100,
      stallTimeoutMs: 0, crashLoopLimit: 1, crashLoopWindowMs: 0,
      fsPolicy: 'block', netPolicy: 'block',
      onAnomaly: 'snapshot+stop',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    // Hardware-virtualized isolation is stronger than networkPreset can
    // describe (a whole guest kernel, not a host process) — level 0 /
    // isolated:true still communicates "no network by default" correctly,
    // and qemu-runtime.js's vmConfig.network defaults to 'none' to match.
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['vm:started', 'vm:stopped', 'vm:crashed', 'vm:reset'],
      consumes: ['vm:launch', 'vm:powerdown', 'vm:reset', 'vm:snapshot'],
    },
    fsTemplate: [
      { path: 'vm.json', content: JSON.stringify({
          disk: 'overlay.qcow2',
          baseImage: '{{baseImage}}',
          ramMB: 4096,
          cpus: 2,
          ephemeral: true,
          network: 'none',
          headless: true,
        }, null, 2), binary: false },
    ],
    detectionHints: ['sandboxie', 'isolated windows', 'disposable vm', 'throwaway windows'],
    tags: ['security', 'windows', 'vm', 'qemu', 'sandbox', 'sandboxie', 'ephemeral'],
    builtIn: true, pluginId: null,
  },

  // arch-windows-vm-0018
  {
    id: 'a9d2e6c8-3f15-4a0b-8d7e-1c5b9f2a6d38',
    name: 'windows-vm',
    version: '1.0.0',
    displayName: 'Windows VM',
    description: 'Persistent isolated Windows environment — hardware-virtualized, cross-platform (QEMU/KVM).',
    icon: '🪟',
    runtimeId: 'qemu-windows',
    runtimeOptions: ['qemu-windows'],
    resources: {
      cpuLimitPercent: 100, cpuPriority: 'normal',
      ramLimitMB: 8192, ramReservedMB: 1024,
      governorPolicy: 'reserved', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 8192, cpuLimitPct: 100,
      stallTimeoutMs: 0, crashLoopLimit: 2, crashLoopWindowMs: 300000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 2, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['vm:started', 'vm:stopped', 'vm:crashed', 'vm:snapshot:saved'],
      consumes: ['vm:launch', 'vm:powerdown', 'vm:snapshot:save', 'vm:snapshot:restore'],
    },
    fsTemplate: [
      { path: 'vm.json', content: JSON.stringify({
          disk: 'windows.qcow2',
          ramMB: 8192,
          cpus: 4,
          ephemeral: false,
          network: 'nat',
          headless: true,
        }, null, 2), binary: false },
    ],
    detectionHints: ['windows vm', 'persistent windows', 'windows guest'],
    tags: ['windows', 'vm', 'qemu', 'persistent'],
    builtIn: true, pluginId: null,
  },

  // arch-ai-agent-0013
  {
    id: '59389abf-253d-4ce6-af4e-0854b1076a89',
    name: 'ai-agent',
    version: '1.0.0',
    displayName: 'AI Agent',
    description: 'LLM-powered agent — API allowlist, token tracking',
    icon: '🤖',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python'],
    resources: {
      cpuLimitPercent: 60, cpuPriority: 'normal',
      ramLimitMB: 2048, ramReservedMB: 256,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 2048, cpuLimitPct: 60,
      stallTimeoutMs: 120000, crashLoopLimit: 3, crashLoopWindowMs: 120000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: {
      isolated: false, level: 2, proxyPort: null,
      allowedHosts: ['api.anthropic.com', 'api.openai.com', 'api.groq.com', 'api.mistral.ai', 'generativelanguage.googleapis.com'],
      deniedHosts: [], dnsOverride: {}, logAllTraffic: true,
    },
    pipeSignature: {
      exposes: ['prompt:received', 'response:sent', 'tool:called', 'token:spent', 'agent:thinking'],
      consumes: ['context:provided', 'tool:result', 'system:prompt:update'],
    },
    fsTemplate: [
      { path: 'agent.js',          content: '// {{name}} — AI agent\n', binary: false },
      { path: 'system-prompt.txt', content: 'You are a helpful assistant.', binary: false },
      { path: 'tools.json',        content: '[]', binary: false },
      { path: '.env.example',      content: 'ANTHROPIC_API_KEY=\nOPENAI_API_KEY=\n', binary: false },
    ],
    detectionHints: ['anthropic', 'openai', 'langchain', 'llamaindex', 'groq', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'llm', 'agent'],
    tags: ['ai', 'llm', 'agent'],
    builtIn: true, pluginId: null,
  },

  // arch-reverse-proxy-0014
  {
    id: '5d6a8a2e-7163-44df-be68-09ff795db57c',
    name: 'reverse-proxy',
    version: '1.0.0',
    displayName: 'Reverse Proxy',
    description: 'Routes external traffic to internal compartments',
    icon: '🔀',
    runtimeId: 'node',
    runtimeOptions: ['node'],
    resources: {
      cpuLimitPercent: 30, cpuPriority: 'low',
      ramLimitMB: 128, ramReservedMB: 32,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: true,
      memoryLimitMB: 128, cpuLimitPct: 30,
      stallTimeoutMs: 30000, crashLoopLimit: 5, crashLoopWindowMs: 300000,
      fsPolicy: 'log', netPolicy: 'log',
      onAnomaly: 'snapshot+restart',
      httpHealthCheck: { path: '/__health', expectedStatus: 200, intervalMs: 10000, timeoutMs: 2000, failThreshold: 2 },
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 4, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: {
      exposes: ['route:incoming', 'route:forwarded', 'route:rejected', 'upstream:down'],
      consumes: ['route:register', 'route:remove', 'upstream:healthcheck'],
    },
    fsTemplate: [
      { path: 'proxy.js', content: '// {{name}} — reverse proxy\n', binary: false },
    ],
    detectionHints: ['http-proxy', 'http-proxy-middleware', 'nginx.conf', 'caddy'],
    tags: ['proxy', 'routing', 'gateway'],
    builtIn: true, pluginId: null,
  },

  // arch-scratch-0015
  {
    id: '7c6070d8-e802-48f2-8124-09a6dc56378b',
    name: 'scratch',
    version: '1.0.0',
    displayName: 'Scratch',
    description: 'Open sandbox — no restrictions, full network, logged',
    icon: '🧪',
    runtimeId: 'node',
    runtimeOptions: ['node', 'python', 'bun', 'deno', 'shell'],
    resources: {
      cpuLimitPercent: 0, cpuPriority: 'normal',
      ramLimitMB: 0, ramReservedMB: 0,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: false,
      memoryLimitMB: 0, cpuLimitPct: 0,
      stallTimeoutMs: 0, crashLoopLimit: 0, crashLoopWindowMs: 0,
      fsPolicy: 'allow', netPolicy: 'log',
      onAnomaly: 'log-only',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: false, level: 4, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: true },
    pipeSignature: { exposes: [], consumes: [] },
    fsTemplate: [
      { path: 'scratch.js', content: '// {{name}} — scratch pad\n', binary: false },
    ],
    detectionHints: [],
    tags: ['scratch', 'dev', 'open'],
    builtIn: true, pluginId: null,
  },

  // arch-blank-0016
  {
    id: '12bbe504-2c44-4d2f-9f25-8e4f8fe78ffb',
    name: 'blank',
    version: '1.0.0',
    displayName: 'Blank',
    description: 'Empty compartment — you configure everything',
    icon: '⬜',
    runtimeId: 'node',
    runtimeOptions: ['node','python','electron','html','deno','bun','go','rust','dotnet','php','ruby','java','shell','wasm','exe'],
    resources: {
      cpuLimitPercent: 0, cpuPriority: 'normal',
      ramLimitMB: 256, ramReservedMB: 0,
      governorPolicy: 'fair', ioThrottle: 'none',
    },
    watchdogPreset: {
      enabled: false,
      memoryLimitMB: 0, cpuLimitPct: 0,
      stallTimeoutMs: 0, crashLoopLimit: 0, crashLoopWindowMs: 0,
      fsPolicy: 'allow', netPolicy: 'allow',
      onAnomaly: 'log-only',
      httpHealthCheck: null,
      customRules: [], alertWebhook: null,
    },
    networkPreset: { isolated: true, level: 0, proxyPort: null, allowedHosts: [], deniedHosts: [], dnsOverride: {}, logAllTraffic: false },
    pipeSignature: { exposes: [], consumes: [] },
    fsTemplate: [],
    detectionHints: [],
    tags: ['blank', 'custom'],
    builtIn: true, pluginId: null,
  },
];

// ─── Validate every built-in at load time — COS-1 ─────────────────────────────

for (const a of ARCHETYPES_RAW) {
  validateArchetype(a);
}

const ARCHETYPES     = Object.freeze(ARCHETYPES_RAW.map(a => Object.freeze(a)));
const ARCHETYPE_MAP  = new Map(ARCHETYPES.map(a => [a.id, a]));
const ARCHETYPE_NAME_MAP = new Map(ARCHETYPES.map(a => [a.name, a]));
const ARCHETYPE_IDS  = Object.freeze(ARCHETYPES.map(a => a.id));
const ARCHETYPE_NAMES = Object.freeze(ARCHETYPES.map(a => a.name));

/**
 * Look up a built-in archetype by id (UUID) or name (kebab-case).
 * @param {string} idOrName
 * @returns {object|null}
 */
function getBuiltInArchetype(idOrName) {
  return ARCHETYPE_MAP.get(idOrName) || ARCHETYPE_NAME_MAP.get(idOrName) || null;
}

module.exports = {
  ARCHETYPES,
  ARCHETYPE_MAP,
  ARCHETYPE_NAME_MAP,
  ARCHETYPE_IDS,
  ARCHETYPE_NAMES,
  getBuiltInArchetype,
};
