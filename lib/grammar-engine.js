'use strict';
/**
 * lib/grammar-engine.js — NEXUS Grammar Engine
 * UUID: nexus-grammar-engine-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Reads the component registry grammar tree.
 * Builds a trie for O(k) command resolution.
 * Tab completion from trie.
 * Live rebuild on component.registered SSE.
 *
 * Grammar is owned by the registry. This engine reads. Never writes.
 *
 * §CR-006: grammar owned by registry. CLI reads. CLI does not write.
 */

const http   = require('http');
const crypto = require('crypto');

const MODULE_ID = 'grammar-engine';
const VERSION   = '1.0.0';

// ── State ─────────────────────────────────────────────────────────────────────
let _tree    = null;   // raw GrammarTree from registry
let _trie    = null;   // compiled trie for O(k) lookup
let _aliases = {};     // flat alias map
let _ready   = false;

// ── Fetch grammar tree from registry ─────────────────────────────────────────
async function fetch(orchestratorUrl = 'http://127.0.0.1:9000') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      orchestratorUrl + '/api/components/grammar',
      { method: 'GET', headers: { 'Accept': 'application/json' } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const d = JSON.parse(Buffer.concat(chunks).toString());
            if (d.tree) {
              _tree    = d.tree;
              _aliases = d.aliases || {};
              _trie    = buildTrie(_tree);
              _ready   = true;
              resolve({ ok: true, componentCount: d.componentCount });
            } else {
              reject(new Error('invalid grammar response'));
            }
          } catch(e) { reject(e); }
        });
      }
    );
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('grammar fetch timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Build trie from grammar tree ──────────────────────────────────────────────
// The tree shape from the registry:
//   { cortex: { gaps: { list: { componentId, params } } } }
// The trie adds parent pointers and flattens for O(k) lookup.
function buildTrie(tree) {
  const trie = { children: {}, componentId: null, params: [], returns: null };

  function insert(node, parts, componentId, params, returns) {
    if (!parts.length) {
      node.componentId = componentId;
      node.params      = params || [];
      node.returns     = returns || null;
      return;
    }
    const part = parts[0];
    if (!node.children[part]) {
      node.children[part] = { children: {}, componentId: null, params: [], returns: null };
    }
    insert(node.children[part], parts.slice(1), componentId, params, returns);
  }

  function walk(subtree, prefix) {
    for (const [key, value] of Object.entries(subtree)) {
      if (value && typeof value === 'object') {
        if (value.componentId) {
          // Leaf node
          insert(trie, [...prefix, key], value.componentId, value.params, value.returns);
        } else {
          // Interior node
          walk(value, [...prefix, key]);
        }
      }
    }
  }

  walk(tree, []);
  return trie;
}

// ── Resolve command string to component ───────────────────────────────────────
// Returns { componentId, params, raw, matched, remainder }
// O(k) where k = number of tokens in input
function resolve(input) {
  if (!_ready) return null;

  const tokens = (input || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  // Check aliases first (single-token shortcuts)
  if (tokens.length === 1 && _aliases[tokens[0]]) {
    return {
      componentId: _aliases[tokens[0]],
      matched:     tokens[0],
      remainder:   [],
      params:      [],
      fromAlias:   true,
    };
  }

  // Also check multi-word alias
  const fullInput = tokens.join(' ');
  if (_aliases[fullInput]) {
    return {
      componentId: _aliases[fullInput],
      matched:     fullInput,
      remainder:   [],
      params:      [],
      fromAlias:   true,
    };
  }

  // Walk trie
  let node   = _trie;
  let i      = 0;
  let lastMatch = null;

  while (i < tokens.length) {
    const token = tokens[i];
    if (node.children[token]) {
      node = node.children[token];
      i++;
      if (node.componentId) {
        lastMatch = { componentId: node.componentId, matchedTokens: i, params: node.params, returns: node.returns };
      }
    } else {
      break;
    }
  }

  if (!lastMatch) return null;

  return {
    componentId: lastMatch.componentId,
    matched:     tokens.slice(0, lastMatch.matchedTokens).join(' '),
    remainder:   tokens.slice(lastMatch.matchedTokens),
    params:      lastMatch.params,
    returns:     lastMatch.returns,
    fromAlias:   false,
  };
}

// ── Tab completion ────────────────────────────────────────────────────────────
// Returns array of completion strings for partial input
function complete(partial) {
  if (!_ready) return [];

  const tokens = (partial || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const completions = [];

  // Walk trie as far as we can
  let node = _trie;
  for (const token of tokens) {
    if (node.children[token]) {
      node = node.children[token];
    } else {
      // Partial match — find children that start with this token
      const matches = Object.keys(node.children).filter(k => k.startsWith(token));
      const prefix  = tokens.slice(0, -1).join(' ');
      for (const m of matches) {
        completions.push(prefix ? prefix + ' ' + m : m);
      }
      return completions;
    }
  }

  // At a valid node — return all children
  const prefix = tokens.join(' ');
  for (const child of Object.keys(node.children)) {
    completions.push(prefix ? prefix + ' ' + child : child);
  }

  // Also include aliases that match
  for (const [alias, componentId] of Object.entries(_aliases)) {
    if (alias.startsWith(partial.toLowerCase())) {
      completions.push(alias);
    }
  }

  return [...new Set(completions)].sort();
}

// ── Parse params from remainder tokens ───────────────────────────────────────
// Takes remainder tokens and component param schema
// Returns { ok, parsed, errors }
function parseParams(remainder, paramSchema) {
  const parsed = {};
  const errors = [];

  if (!paramSchema || !paramSchema.length) return { ok: true, parsed, errors };

  // Parse --flag value pairs
  const tokens = [...remainder];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const flag  = token.slice(2);
      const param = paramSchema.find(p => p.cli === token || p.name === flag);
      if (!param) { errors.push(`unknown flag: ${token}`); i++; continue; }
      const value = tokens[i + 1];
      if (!value || value.startsWith('--')) {
        if (param.type === 'boolean') { parsed[param.name] = true; i++; }
        else { errors.push(`${token} requires a value`); i++; }
      } else {
        parsed[param.name] = _coerceParam(value, param);
        i += 2;
      }
    } else {
      // Positional — assign to first unpopulated required param
      const pos = paramSchema.find(p => p.required && !parsed[p.name]);
      if (pos) { parsed[pos.name] = _coerceParam(token, pos); }
      i++;
    }
  }

  // Apply defaults and check required
  for (const p of paramSchema) {
    if (parsed[p.name] === undefined) {
      if (p.default !== undefined) parsed[p.name] = p.default;
      else if (p.required) errors.push(`${p.name} is required`);
    }
    // Enum validation
    if (p.type === 'enum' && parsed[p.name] && !p.values?.includes(parsed[p.name])) {
      errors.push(`${p.name} must be one of: ${p.values?.join(', ')}`);
    }
  }

  return { ok: errors.length === 0, parsed, errors };
}

function _coerceParam(value, param) {
  if (param.type === 'number') return parseFloat(value);
  if (param.type === 'boolean') return value === 'true' || value === '1';
  return value;
}

// ── Invalidate and rebuild ────────────────────────────────────────────────────
function invalidate() {
  _trie  = null;
  _ready = false;
}

async function rebuild(orchestratorUrl) {
  invalidate();
  return fetch(orchestratorUrl);
}

// ── Status ────────────────────────────────────────────────────────────────────
function status() {
  const componentCount = _tree ? _countLeaves(_trie) : 0;
  return {
    ready:          _ready,
    componentCount,
    aliasCount:     Object.keys(_aliases).length,
    version:        VERSION,
  };
}

function _countLeaves(node) {
  if (!node) return 0;
  let count = node.componentId ? 1 : 0;
  for (const child of Object.values(node.children || {})) {
    count += _countLeaves(child);
  }
  return count;
}

// Allow tests to load a mock grammar tree directly
function load(tree, aliases) {
  _tree    = tree;
  _aliases = aliases || {};
  _trie    = buildTrie(_tree);
  _ready   = true;
  return { ok: true, componentCount: _countLeaves(_trie) };
}

module.exports = {
  fetch, load, buildTrie, resolve, complete, parseParams,
  invalidate, rebuild, status,
  MODULE_ID, VERSION,
};
