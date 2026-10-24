'use strict';
/**
 * .architecture/registry/api.js — the real, cross-system-safe surface
 * onto this registry. Other systems (copilot, agents, anything) reach
 * this over HTTP, never via require() — the sovereignty rule this
 * whole pattern already enforces applies here too: in-process access
 * is fine for code IN this system, everything else goes through here.
 *
 * Adds two things watcher.js alone doesn't have:
 *  1. Query, not just list-all — filter one node type by field.
 *  2. Config as a node kind — a `config` node's value is meant to
 *     change at runtime (HARDLINE_AS_LITTLE_AS_POSSIBLE); writing one
 *     through POST /config/:id is a real, watched file write, so the
 *     existing watcher/ledger machinery covers it with zero new code.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createWatcher, NODE_TYPES } = require('./watcher.js');

function query(watcher, type, filter) {
  const all = watcher.all(type);
  if (!filter || Object.keys(filter).length === 0) return all;
  return all.filter(({ node }) =>
    Object.entries(filter).every(([k, v]) => String(node[k]) === String(v))
  );
}

/** history(nodesDir, type, id) — reads this type's ledger, filters to one id. */
function history(nodesDir, type, id) {
  const ledgerPath = path.join(nodesDir, type, '_ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(entry => entry.id === id);
}

function createRegistryApi({ nodesDir, checkFns, port = 0 }) {
  const watcher = createWatcher({ nodesDir, checkFns });
  const configDir = path.join(nodesDir, 'config');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const parts = url.pathname.split('/').filter(Boolean);
    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /nodes/:type              → all nodes of one type, or filtered by query params
      if (req.method === 'GET' && parts[0] === 'nodes' && parts.length === 2) {
        const type = parts[1];
        if (!NODE_TYPES.includes(type)) { res.writeHead(404); return res.end(JSON.stringify({ error: `unknown type: ${type}` })); }
        const filter = Object.fromEntries(url.searchParams);
        res.writeHead(200); return res.end(JSON.stringify(query(watcher, type, filter)));
      }
      // GET /nodes/:type/:id/history  → this node's real ledger entries
      if (req.method === 'GET' && parts[0] === 'nodes' && parts.length === 4 && parts[3] === 'history') {
        const [, type, id] = parts;
        res.writeHead(200); return res.end(JSON.stringify(history(nodesDir, type, id)));
      }
      // GET /config                   → every config node, current value
      if (req.method === 'GET' && parts[0] === 'config' && parts.length === 1) {
        res.writeHead(200); return res.end(JSON.stringify(watcher.all('config') || []));
      }
      // POST /config/:id              → write (or update) one config node — a real,
      // watched file write; the running system picks it up via the same
      // watcher path any other node change goes through, no separate hot-reload code
      if (req.method === 'POST' && parts[0] === 'config' && parts.length === 2) {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          fs.mkdirSync(configDir, { recursive: true });
          fs.writeFileSync(path.join(configDir, `${parts[1]}.json`), body);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, id: parts[1] }));
        });
        return;
      }
      res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
  });

  return {
    start: () => new Promise(resolve => {
      watcher.start();
      server.listen(port, () => resolve(server.address().port));
    }),
    stop: () => { watcher.stop(); server.close(); },
    watcher,
  };
}

module.exports = { createRegistryApi, query, history };
