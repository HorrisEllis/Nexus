// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-core/index.js
 * Common primitives every bridge module imports.
 * SISO, bus, registries.
 */

const { Event, Gate, Stream, StreamLog } = require('./siso/index');
const { createBus }                       = require('./bus');
const { createCalltoRegistry, createNodeRegistry, NON_DOM_CALLTOS } = require('./registry/index');
const cryptoEngine                         = require('./crypto-engine');

module.exports = {
  // SISO primitives
  Event, Gate, Stream, StreamLog,
  // Bus factory
  createBus,
  // Registry factories
  createCalltoRegistry, createNodeRegistry,
  // Constants
  NON_DOM_CALLTOS,
  // Crypto engine (AES-256-GCM, ECDH, HKDF, HMAC, scrypt)
  cryptoEngine,
};
