# nexus-healer → diagnostic (0.60.136, 2026-10-17)

James: "diagnostic and nexus healer should be one system."

nexus-healer was its own top-level system. It never ran on its own: nothing started its port 3755. Its code is now part of
diagnostic, which does run (port 7825), and git kept each file's history through the move:

| was | now |
|---|---|
| nexus-healer/api/index.js | diagnostic/healer/api/index.js (served by diagnostic under /healer) |
| nexus-healer/cli/index.js | diagnostic/healer/cli/index.js (`nexus /healer …`) |
| nexus-healer/schemas/ | diagnostic/schemas/ |
| nexus-healer/registry-components.js | diagnostic/registry-components.js (with diagnostic's contract routes) |
| nexus-healer/spec/, docs/ | diagnostic/spec/healer.node-taxonomy.md, diagnostic/spec/healer.spec.md |

Kept here, not deleted:
- `nexus-healer.interaction-contract.json`, the old contract. Its routes are in diagnostic's contract under /healer.
- `data/`, nexus-healer's generated nodes and node index. They regenerate under diagnostic from its registry at boot.

On a machine that ran 0.60.133–0.60.135, nexus-healer's own store `nexus-healer/data/jaa` is untracked, so git leaves it
in place. Diagnostic's store brings its `healer_proposals` home from there, or from cortex's store, once. The rows at the
source are kept.
