'use strict';
/**
 * src/plugins/context-items.js — the right-click menu entries plugins contribute (contribution type 'context-menu-item').
 * Same idea as src/toolbar/commands.js's registerPluginCommand: the plugin host registers the DISPLAY entry here when a plugin installs and removes
 * it when the plugin is disabled, so a disabled plugin never leaves a dead menu row. The renderer asks (plugins:contextItems) each time the menu opens.
 * Clicking a row invokes the entry's signature on the bus (plugins:invoke) — the entry's Gate (host.js) runs the plugin's handler.
 * §0.60.169 NP11 — first user: plugins/snowflake ("Open link with Snowflake").
 */
const ITEMS = [];
const WHEN = ['link', 'page'];
function registerContextItem(item) {
  if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') throw new Error('[context-items] an item needs an id and a label');
  if (ITEMS.some(i => i.id === item.id)) throw new Error(`[context-items] duplicate item id: '${item.id}' (plugin already installed?)`);
  const when = item.when || 'link';
  if (!WHEN.includes(when)) throw new Error(`[context-items] when must be one of ${WHEN.join(', ')} (got ${JSON.stringify(item.when)})`);
  ITEMS.push({ id: item.id, label: item.label, icon: item.icon || '', when, pluginId: item.pluginId || null });
  return true;
}
function unregisterContextItem(id) { const i = ITEMS.findIndex(x => x.id === id); if (i === -1) return false; ITEMS.splice(i, 1); return true; }
function listContextItems(when) { return ITEMS.filter(i => !when || i.when === when).map(i => ({ ...i })); }
module.exports = { registerContextItem, unregisterContextItem, listContextItems, WHEN };
