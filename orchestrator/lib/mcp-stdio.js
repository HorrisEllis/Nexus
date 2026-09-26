#!/usr/bin/env node
'use strict';
/**
 * lib/mcp-stdio.js — NEXUS MCP stdio transport
 * UUID: nexus-mcp-stdio-v1-0000-2026-0625-jamesbrooks-001
 *
 * Runs the MCP server over stdio so Claude Code can connect
 * without Claude Desktop or any config file.
 *
 * Usage (in Claude Code's MCP config or directly):
 *   node nexus-v0_9_9-complete/lib/mcp-stdio.js
 *
 * Or add to .claude/mcp.json in your project:
 *   {
 *     "nexus": {
 *       "command": "node",
 *       "args": ["lib/mcp-stdio.js"]
 *     }
 *   }
 *
 * §1.2 Nothing silently fails — all errors logged to stderr
 */

const { TOOLS, MODULE_ID, VERSION } = require('./mcp-server');

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'nexus-mcp', version: VERSION },
    }});
    return;
  }

  if (method === 'notifications/initialized') return; // no response

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: {
      tools: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }});
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` }});
      return;
    }
    try {
      const result = await tool.handler(args || {});
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: String(result) }],
      }});
    } catch(e) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: `Tool error: ${e.message}` }});
    }
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` }});
}

// Read newline-delimited JSON from stdin
let _buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  _buf += chunk;
  const lines = _buf.split('\n');
  _buf = lines.pop(); // keep incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handle(msg).catch(e => process.stderr.write(`[nexus-mcp-stdio] error: ${e.message}\n`));
    } catch(e) {
      process.stderr.write(`[nexus-mcp-stdio] parse error: ${e.message}\n`);
    }
  }
});

process.stdin.on('end', () => process.exit(0));
process.stderr.write(`[nexus-mcp-stdio] v${VERSION} — ${TOOLS.length} tools ready\n`);
