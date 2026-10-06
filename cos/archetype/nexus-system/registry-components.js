// registry-components.js — the spine. Every component connects only to this.
// Each id points at a node in data/nodes/; the node schemas are in schemas/. A new component is one entry here,
// its file in lib/, and its component, capability, command and event nodes — nothing else is rewired.
module.exports = {
  system: '{{slug}}',
  components: [
    {
      type: 'component',
      id: '{{slug}}.core',
      uuid: '{{uuid8}}-core-0000-0000-000000000001',
      file: 'lib/core.js',
      intent: 'the system reporting on itself: its status and its nodes',
      version: '0.1.0',
      status: 'built',
      capabilities: ['{{slug}}.core.observe'],
      hooks: ['{{slug}}.core.http'],
      consumers: [],
      data: { dir: 'data/nodes', store: 'node', types: ['component', 'capability', 'command', 'event', 'route', 'hook', 'wire', 'bundle'] },
    },
    // ── the idea's components slot in below ──
  ],
};
