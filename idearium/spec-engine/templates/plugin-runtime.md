<!-- §SEED PROVENANCE — extracted verbatim from SYSTEM_SPEC_v1_0_0.md,
     section "## 12. PLUGINS — plugins/", authored by james-brooks. Real
     isolation/load/unload/hot-swap contract for a shipped plugin system —
     chosen as the reference shape for a "Plugin Runtime" archetype. -->
## 12. PLUGINS — `plugins/`

Plugins are structurally isolated. They communicate only through the bus. They cannot import
from the kernel or from each other. They cannot write to the database directly. They cannot
modify contracts. Any plugin that attempts to do so is rejected at load time and logged.

**Load criteria:**
1. `plugin.json` validates against `plugin.contract.json`
2. All declared `emits` and `consumes` are registered in `events.schema.json`
3. No UUID conflict with any loaded plugin or core module

**Unload:** `teardown()` is called, subscriptions are removed, UUID is flagged inactive in the
registry, and the gap report is re-run.

**Hot-swap:** Plugins can be loaded and unloaded at runtime without kernel restart. The bus
handles subscription cleanup automatically on teardown.

---

