'use strict';
/**
 * versionium/config.js — real, distinct config, matching ollama/config.js's
 * and intelligence/config.js's exact established pattern: one file, every
 * real value env-overridable, no magic numbers scattered across the tree.
 *
 * §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
 * phasemap.spec) — James: "versionium is its own folder. it's system with
 * a server.js. cli. api." Port 3754 was checked directly before choosing
 * it — confirmed free against orchestrator/orchestrator.config.json's real
 * ports block and every port literal found tree-wide, not assumed.
 */
const path = require('path');

module.exports = {
  // ── Network ────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.VERSIONIUM_PORT || '3754', 10),
  ORCH_URL: process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000',

  // ── Storage — real, own data directory (VS1's own requirement: "data
  // folder"), not sharing cortex's jaaDB tables the way the embedded
  // version did before this migration. Overridable, matching this
  // codebase's own established JAA_DATA_DIR convention (cortex/memory/
  // jaa-db.js), so tests can isolate against a real temp dir instead of
  // production data. ──────────────────────────────────────────────────
  DATA_DIR: process.env.VERSIONIUM_DATA_DIR || path.join(__dirname, '..', 'data', 'versionium'),

  // ── Causal field / ring buffer ────────────────────────────────────────
  // §VS2 (same phasemap) — same real ring size cortex/versionium/index.js
  // used before this migration (intelligence/rfr2/kernel's createKernel),
  // kept unchanged rather than re-tuned blind.
  KERNEL_RING_CAP: parseInt(process.env.VERSIONIUM_RING_CAP || '50000', 10),
  SIGMA_THRESH: parseFloat(process.env.VERSIONIUM_SIGMA_THRESH || '0.7'),
  AUTOCOMMIT_COOLDOWN_MS: parseInt(process.env.VERSIONIUM_AUTOCOMMIT_COOLDOWN_MS || String(5 * 60 * 1000), 10),
  POLL_MS: parseInt(process.env.VERSIONIUM_POLL_MS || '3000', 10),

  // ── Per-file layer (MCO-B, spec/versionium.file-versioning.spec) ───────
  // Every value env-overridable, none scattered in lib/files.js.
  FILE_MAX_BYTES: parseInt(process.env.VERSIONIUM_FILE_MAX_BYTES || String(2 * 1024 * 1024), 10),
  FILE_KEYFRAME_INTERVAL: parseInt(process.env.VERSIONIUM_FILE_KEYFRAME_INTERVAL || '20', 10),
  FILE_DELTA_MAX_RATIO: parseFloat(process.env.VERSIONIUM_FILE_DELTA_MAX_RATIO || '0.9'),
  FILE_MAX_RECORD_BYTES: parseInt(process.env.VERSIONIUM_FILE_MAX_RECORD_BYTES || String(32 * 1024 * 1024), 10),
  FILE_BLOB_DIR: process.env.VERSIONIUM_FILE_BLOB_DIR || path.join(process.env.VERSIONIUM_DATA_DIR || path.join(__dirname, '..', 'data', 'versionium'), 'file-blobs'),

  // ── Identity (not tunable) ─────────────────────────────────────────────
  SYSTEM_ID: 'versionium',
  VERSION:   '3.3.0',
};
