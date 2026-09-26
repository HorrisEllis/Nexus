// Copyright (c) 2026 James Brooks. All rights reserved.
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
const { createNodeRegistry }             = require('./registry/index');

module.exports = {
  // SISO primitives
  Event, Gate, Stream, StreamLog,
  // Bus factory
  createBus,
  // Registry factories
  createNodeRegistry,
};
