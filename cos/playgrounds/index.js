/**
 * playgrounds/index.js
 * COMPARTMENT OS — Playgrounds Public API (Phase 30, spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 */

'use strict';

const {
  PlaygroundError,
  PLAYGROUND_MODES,
  createPlayground,
  destroyPlayground,
  promoteCompartment,
  playgroundStatus,
} = require('./factory.js');

/**
 * @param {object} host
 * @param {string} idOrName
 * @returns {object|null}
 */
function getPlayground(host, idOrName) {
  const playgrounds = host.sysmap.get().playgrounds;
  return playgrounds.find(p => p.id === idOrName || p.name === idOrName) || null;
}

/**
 * @param {object} host
 * @returns {object[]}
 */
function listPlaygrounds(host) {
  return host.sysmap.get().playgrounds;
}

module.exports = {
  PlaygroundError,
  PLAYGROUND_MODES,
  createPlayground,
  destroyPlayground,
  promoteCompartment,
  playgroundStatus,
  getPlayground,
  listPlaygrounds,
};
