/**
 * idearium/index.js — ESM entry point
 * UUID: idearium-entry-v1-0000-4000-0000-000000000004
 * §8.3 SISO is a load-order prerequisite — imported by core, not re-exported here
 */
export { getIdeaOS, VERSION, IdeaOS, IDEA_PHASES, GAP_STATUSES, LINK_TYPES } from './core/index.js';
export { startAPI } from './api/index.js';
