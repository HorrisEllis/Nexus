'use strict';
/**
 * cos/ci/keys.js — key and secret management for a compartment's CI.
 * UUID: nexus-cos-ci-keys-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.1.0
 *
 * §KEYS 2026-09-20 — James: "back to the key management which will reside
 * in the options for the compartment."
 *
 * §CORRECTION. An earlier note in this work claimed there was "no key
 * management subsystem in this codebase". That was wrong, and the mistake
 * mattered: cos/vault/ is real and already does the hard parts —
 * AES-256-GCM (cos/vault/crypto.js), a master key on disk, per-compartment
 * scoping with grants (canAccess()), an audit log, and export/import.
 * This module therefore stores NOTHING of its own. It is a CI-shaped
 * façade over that vault, and every secret below lives in the vault's
 * encrypted store under the owning compartment's scope.
 *
 * §TWO KINDS OF THING, DELIBERATELY DIFFERENT
 *
 *   SSH KEYS are registered by PATH, not material. The vault holds the
 *   path string; the private key stays where it is on disk, owned by the
 *   OS, never copied into any store of ours. This is unchanged from
 *   cos/ci/index.js's original rule and is not a limitation being worked
 *   around — moving key material into a database would make a second
 *   copy of the most sensitive file on the machine. What the vault adds
 *   is INDIRECTION: a pipeline names `keyAlias: "deploy"` instead of
 *   hardcoding an absolute path, so .nexus-ci.json can be committed and
 *   shared without leaking where anyone's keys live.
 *
 *   CI SECRETS are values (tokens, passwords) and those DO go in the
 *   vault encrypted, because there is nowhere else for them to live.
 *   They are injected as env vars into a stage's process.
 *
 * §WHAT IS NEVER RETURNED. listKeys()/listSecrets() return names and
 * metadata. A secret VALUE is returned by exactly one function,
 * secretsEnvFor(), which exists to hand values to a spawning process and
 * is never routed to an HTTP response. cos/vault's own agent tool
 * (lib/agent-tools/tools/sandbox/cos-vault.js) made the same call for the
 * same reason — see its header — and this module holds that line.
 */

const path = require('path');

const SSH_PREFIX = 'CI_SSHKEY_';
const SECRET_PREFIX = 'CI_SECRET_';
const MODULE_ID = 'nexus-cos-ci-keys-v1-0000-2026-0920-jamesbrooks-001';
const VERSION = '0.1.0';

// Alias rule: something safe as an env-var suffix and readable in a
// pipeline file. Checked here so a bad alias fails at registration rather
// than producing an unreferencable secret.
const ALIAS_RE = /^[a-z][a-z0-9_]{1,38}$/;

function _vault() { return require('../vault/index.js'); }
function _createHost() { return require('../host/index.js').createHost; }

/** A host, created on demand unless the caller already has one. */
function hostFor(host) { return host || _createHost()(); }

function validateAlias(alias) {
  if (!alias || typeof alias !== 'string') return { ok: false, error: 'alias is required' };
  if (!ALIAS_RE.test(alias)) {
    return { ok: false, error: `alias "${alias}" must be snake_case, 2-39 chars, starting with a letter — it becomes part of an env var name` };
  }
  return { ok: true };
}

// ── ssh keys (by path, never material) ────────────────────────────────

/**
 * registerSshKey({ host, compartmentName, alias, keyPath })
 *
 * Verifies the key is real, on disk, and owner-only BEFORE recording it —
 * the same cos/ci/index.js checkKeyRef() a run uses, so a key that
 * registers cleanly is a key that will actually work, rather than one that
 * fails at deploy time.
 */
function registerSshKey({ host, compartmentName, alias, keyPath } = {}) {
  const a = validateAlias(alias);
  if (!a.ok) return { ok: false, error: a.error };
  if (!compartmentName) return { ok: false, error: 'compartmentName is required — keys live in a compartment, not globally' };
  if (!keyPath || typeof keyPath !== 'string') return { ok: false, error: 'keyPath is required (an absolute path to a private key already on disk)' };

  // Refuse pasted key material outright, loudly. This is the single most
  // likely wrong thing for someone to do here.
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(keyPath)) {
    return { ok: false, error: 'that is key MATERIAL, not a path. Private keys are never stored here — register the path to the key file instead.' };
  }

  const { checkKeyRef } = require('./index.js');
  const check = checkKeyRef(keyPath);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    const h = hostFor(host);
    const record = _vault().setSecret(h, {
      compartmentName,
      key: `${SSH_PREFIX}${alias}`,
      value: path.resolve(keyPath),
      scope: 'compartment',
    });
    return { ok: true, alias, keyPath: path.resolve(keyPath), recordId: record.id };
  } catch (e) {
    return { ok: false, error: `vault write failed: ${e.message}` };
  }
}

/** resolveSshKey(...) -> { ok, keyPath } — the path, re-checked at use time.
 *  A key registered months ago can have been moved, deleted, or had its
 *  permissions widened since; checking only at registration would let a
 *  pipeline fail with an opaque ssh error instead of a clear one. */
function resolveSshKey({ host, compartmentName, alias } = {}) {
  try {
    const h = hostFor(host);
    // §FIXED 2026-09-20 — getSecret() defaults to reveal:false and returns
    // { record, value:null, denied }. That default is a deliberate vault
    // safety property, not an inconvenience: a caller must SAY it wants
    // the plaintext. Omitting it made every resolve look like "no such
    // key" even when the key was registered fine — caught by
    // cos/ci/ci-keys.smoke.cjs, which registered and then failed to
    // resolve in the same breath.
    const res = _vault().getSecret(h, { compartmentName, key: `${SSH_PREFIX}${alias}`, reveal: true });
    // Denied and absent are different problems with different fixes, and
    // collapsing them into one message would send someone hunting for a
    // key that is right there but not granted to this compartment.
    if (res && res.denied) return { ok: false, denied: true, error: `ssh key "${alias}" exists but this compartment has no grant for it` };
    const keyPath = res && res.value;
    if (!keyPath) return { ok: false, error: `no ssh key registered under alias "${alias}" for this compartment` };
    const { checkKeyRef } = require('./index.js');
    const check = checkKeyRef(keyPath);
    if (!check.ok) return { ok: false, error: `ssh key "${alias}" is registered but no longer usable: ${check.error}` };
    return { ok: true, alias, keyPath };
  } catch (e) {
    return { ok: false, error: `vault read failed: ${e.message}` };
  }
}

/** listSshKeys(...) — aliases and their paths. Paths are locations, not
 *  secrets; the material they point at is never read by this module. */
function listSshKeys({ host, compartmentName } = {}) {
  try {
    const h = hostFor(host);
    const records = _vault().listSecrets(h, compartmentName) || [];
    return {
      ok: true,
      keys: records
        .filter(r => r.key && r.key.startsWith(SSH_PREFIX))
        .map(r => ({
          alias: r.key.slice(SSH_PREFIX.length),
          scope: r.scope, createdAt: r.createdAt, updatedAt: r.updatedAt,
          grants: r.grants || [],
        })),
    };
  } catch (e) { return { ok: false, error: `vault list failed: ${e.message}` }; }
}

function removeSshKey({ host, compartmentName, alias } = {}) {
  try {
    const h = hostFor(host);
    _vault().deleteSecret(h, { compartmentName, key: `${SSH_PREFIX}${alias}` });
    return { ok: true, alias };
  } catch (e) { return { ok: false, error: `vault delete failed: ${e.message}` }; }
}

// ── ci secrets (values, encrypted) ────────────────────────────────────

function setSecret({ host, compartmentName, name, value } = {}) {
  const a = validateAlias(name);
  if (!a.ok) return { ok: false, error: a.error };
  if (value === undefined || value === null || value === '') return { ok: false, error: 'value is required' };
  try {
    const h = hostFor(host);
    const record = _vault().setSecret(h, {
      compartmentName, key: `${SECRET_PREFIX}${name}`, value: String(value), scope: 'compartment',
    });
    // The value is deliberately NOT echoed back.
    return { ok: true, name, recordId: record.id, envVar: `${SECRET_PREFIX}${name}`.toUpperCase() };
  } catch (e) { return { ok: false, error: `vault write failed: ${e.message}` }; }
}

/** Names and metadata only — never values. */
function listSecrets({ host, compartmentName } = {}) {
  try {
    const h = hostFor(host);
    const records = _vault().listSecrets(h, compartmentName) || [];
    return {
      ok: true,
      secrets: records
        .filter(r => r.key && r.key.startsWith(SECRET_PREFIX))
        .map(r => ({
          name: r.key.slice(SECRET_PREFIX.length),
          envVar: r.key.toUpperCase(),
          scope: r.scope, createdAt: r.createdAt, updatedAt: r.updatedAt,
        })),
    };
  } catch (e) { return { ok: false, error: `vault list failed: ${e.message}` }; }
}

function removeSecret({ host, compartmentName, name } = {}) {
  try {
    const h = hostFor(host);
    _vault().deleteSecret(h, { compartmentName, key: `${SECRET_PREFIX}${name}` });
    return { ok: true, name };
  } catch (e) { return { ok: false, error: `vault delete failed: ${e.message}` }; }
}

/**
 * secretsEnvFor({ host, compartment }) — THE ONLY function here that
 * returns secret values. It exists to hand them to a spawning CI process
 * and must never be routed to an HTTP response or a tool result.
 *
 * Scoped by the vault's own canAccess(), so a compartment only ever
 * receives the secrets it is actually entitled to. Only CI_SECRET_* is
 * injected: the SSH path entries are resolved explicitly per stage, and
 * blanket-injecting every vault entry into every child process would hand
 * unrelated credentials to any command a pipeline happens to run.
 */
function secretsEnvFor({ host, compartment } = {}) {
  try {
    const h = hostFor(host);
    const all = _vault().getInjectionEnvVars(h, compartment) || {};
    const env = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(SECRET_PREFIX)) env[k.toUpperCase()] = v;
    }
    return { ok: true, env };
  } catch (e) { return { ok: false, error: `vault injection failed: ${e.message}`, env: {} }; }
}

/** Redact anything that looks like a known secret value out of captured
 *  stage output. Best-effort and stated as such: a secret that a command
 *  transforms (base64s, splits, hashes) cannot be caught this way. It
 *  catches the common, real case — a script echoing a token, or a tool
 *  printing the command line it ran. */
function redact(text, values) {
  if (!text || !values || !values.length) return text;
  let out = text;
  for (const v of values) {
    if (typeof v !== 'string' || v.length < 4) continue; // too short to redact without mangling output
    out = out.split(v).join('«redacted»');
  }
  return out;
}

module.exports = {
  MODULE_ID, VERSION, SSH_PREFIX, SECRET_PREFIX, ALIAS_RE,
  validateAlias, hostFor,
  registerSshKey, resolveSshKey, listSshKeys, removeSshKey,
  setSecret, listSecrets, removeSecret, secretsEnvFor,
  redact,
};
