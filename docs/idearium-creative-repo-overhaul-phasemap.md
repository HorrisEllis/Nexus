# Idearium Creative-Repo Overhaul — Design + Phasemap

Status: PROPOSED — grounded against real code in `nexus-v0_39_137-mco19-clearglass` /
`Nexus_v0_39_139-integrated` / `Cortex.zip`. Nothing below invents a system that doesn't
already exist unless marked **NET NEW**.

## 0. What this is

Idearium already has a working project/spec library (see the screenshot — "Build" tab,
spec cards, chunk ingest, 500-chunk cap). This overhaul turns that into a full creative
repo host: browse a project like a repo, zoom into modules, see its roadmap, push/pull it,
version every file, and let copilot tune the whole thing live. Below, each of your asks is
mapped to the real subsystem that already does 80% of it, plus what's actually missing.

---

## 1. Requirement → Existing System Map

| Ask | Real system today | Gap |
|---|---|---|
| Full project page from README/custom file | `idearium.idea.show` + `idearium/ui/index.html` | No README-render mode; needs a "project home" view |
| Upload archives, files land in repo (not just chunk placeholders) | `idearium.repo.ingest.capability`, `+ upload project` (seen in screenshot) | Ingest currently produces `.spec` chunks (text), not raw materialized files in a repo tree |
| Roadmap per project | `idearium.idea.phase.*`, `loom.phasemap.*`, `docs/*-phasemap.spec` convention | No per-project phasemap renderer wired to idearium UI |
| Module = zoom level, sub-repos | `idearium.repo.fork/lineage`, `cortex` compartments | **NET NEW**: no zoom/nesting model exists |
| Phasemap reads `.phase` nodes | `loom.phasemap.capability`, `loom/scanners/phasemap-map.js` | No `.phase` node type in `lib/node-schemas/` — phasemaps today are `.spec`/`.md`, not a typed node |
| CI/CD push/pull | — | **NET NEW** |
| SSH support | — | **NET NEW** |
| Versioning via Versionium (root) | `versionium/schemas/schema.versionium_commit`, `versionium.commit.create/history.list/restore.read/state.read/calendar.read` | Real and working, but **not wired to idearium** — no interaction-contract between the two yet |
| Snapshot per file | `cortex/data/snapshots/*.nex`, `cortex/snapshot/index.js` | Exists at the cortex-session level, not per-file-in-a-repo |
| File-change-only tracking ("sigma system") | `cortex/schemas/schema.sigma_record` | This is divergence scoring, not diffs — **NET NEW**: real patch/delta schema needed |
| Rewind / restore | `versionium.restore.read`, `cg.rewind.*` (wrong domain — browser tabs) | Versionium's restore is the right primitive; needs idearium-side UI + API |
| Versionium API into idearium via interaction-contract | `idearium/interaction-contract.json`, `versionium/interaction-contract.json` (if present) | **NET NEW**: no contract wiring these two together |
| 500 cap, adjustable, copilot-writable | Hardcoded in idearium's chunk pipeline (seen as `500/500` in screenshot) | **NET NEW**: config schema + copilot write-path |

---

## 2. New Node Types Needed (following your capability/command/component pattern)

```
idearium.repo.materialize.capability   # archive upload -> real files on disk, not just chunks
idearium.repo.zoom.capability          # get module tree at a given zoom depth
idearium.repo.subrepo.create.capability
idearium.roadmap.get.capability        # reads .phase nodes for a project
idearium.roadmap.phase.update.capability
idearium.cicd.push.capability
idearium.cicd.pull.capability
idearium.ssh.keys.register.capability
idearium.config.get.capability         # returns the adjustable-values block (§4)
idearium.config.set.capability         # copilot + user both call this

versionium.idearium.bridge.capability  # NET NEW — the missing interaction-contract link
versionium.file.snapshot.capability    # per-file snapshot, not session-level
versionium.file.delta.capability       # real sigma-style diff-only record (see §3)
```

New schema: `schema.phase_node` (`.phase` files) —

```yaml
id: phase_node
fields:
  uuid: {type: string, required: true}
  project_id: {type: string, required: true}
  order: {type: number, required: true}
  title: {type: string, required: true}
  status: {type: enum, values: [planned, active, blocked, complete]}
  depends_on: {type: array, items: string}   # other phase_node uuids
  module_path: {type: string}                # which zoom-level module this phase belongs to
```

New schema: `schema.file_delta` (the real "sigma" for files — don't reuse `sigma_record`,
name collision with the existing divergence-score table would corrupt cortex's real data) —

```yaml
id: file_delta
fields:
  uuid: {type: string, required: true}
  file_path: {type: string, required: true}
  commit_ref: {type: string, required: true}   # -> versionium_commit.uuid
  diff: {type: string, required: true}         # unified diff, not full file
  bytes_saved: {type: number}
```

---

## 3. Versionium ↔ Idearium Bridge (the actual missing piece)

Right now these are two islands. The bridge is one interaction-contract, mirroring the
pattern already used elsewhere in the codebase (e.g. `clear-glass/wire/nexus-wire.js`):

```
idearium repo write
  -> versionium.file.snapshot (full file, first write) 
  -> versionium.file.delta   (subsequent writes, diff-only)
  -> versionium.commit.create (groups deltas into a commit, same as today)

idearium "rewind" button
  -> versionium.restore.read (existing capability)
  -> idearium.repo.materialize (writes restored content back to the repo tree)
```

This reuses `versionium.commit.create/history.list/restore.read/state.read` as-is — no
changes needed there. The new work is entirely the bridge contract + the two new
per-file capabilities.

---

## 4. Config Schema (all adjustable, copilot-writable)

```json
{
  "idearium.config": {
    "chunk_cap": { "value": 500, "min": 1, "max": 5000, "copilot_writable": true },
    "zoom_levels": { "value": 4, "copilot_writable": true },
    "snapshot_mode": { "value": "delta", "enum": ["full", "delta"], "copilot_writable": true },
    "auto_phasemap": { "value": true, "copilot_writable": true },
    "cicd": {
      "push_enabled": { "value": false, "copilot_writable": true },
      "pull_enabled": { "value": false, "copilot_writable": true },
      "ssh_key_path": { "value": null, "copilot_writable": false }
    }
  }
}
```

Served via `idearium.config.get` / `idearium.config.set`. Copilot writes go through the
same command-node path as a human edit — no separate privilege tier, just logged with
`actor: "copilot"` in the event taxonomy (matches your existing `event-taxonomy.js`
pattern in idearium/cortex).

---

## 5. Build Roadmap (MCO-increment style, matching your git log convention)

- **MCO-A**: `schema.file_delta` + `schema.phase_node` added to node-taxonomy, registered in both idearium and versionium schema indexes.
- **MCO-B**: Versionium↔Idearium bridge contract + `versionium.file.snapshot`/`file.delta` capabilities. No UI yet — prove it with a CLI round-trip (write file → snapshot → restore → diff clean).
- **MCO-C**: `idearium.repo.materialize` — archive upload writes real files to a repo tree instead of chunk-only. Reuses existing `repo.ingest`, adds the materialize step after it.
- **MCO-D**: Zoom/sub-repo model — `idearium.repo.zoom` + `idearium.repo.subrepo.create`. This is the riskiest net-new piece; scope it to read-only zoom first, write-through later.
- **MCO-E**: Roadmap UI — reads `.phase` nodes, renders per-project, reuses `loom.phasemap.capability` for the scan/build side.
- **MCO-F**: Config schema (§4) + copilot write-path.
- **MCO-G**: CI/CD push/pull + SSH — last, since it's the only piece with real external-network/security surface (key storage, transport auth) and should get its own security pass rather than riding in with the rest.

Each MCO should land as its own commit with a gate-met test, same discipline as the
MCO1–MCO8 commits already in your history.

---

## 6. Open Questions For You

1. Should `versionium.file.delta` live under `versionium/` or `cortex/` — versionium already owns commits, but cortex owns memory/table-compaction. Recommend versionium, to keep "history" in one place.
2. Zoom levels (§4, `zoom_levels: 4`) — what should the 4 levels actually be called? (e.g. world → region → module → file?)
3. CI/CD push/pull target — is this pushing to your real git remotes (`mine`, `nexus0822`, `other`, `person-model` — all seen in the `.git/config`), or a separate idearium-only remote?

---

*This doc is a planning artifact, not a `.spec` — once the open questions above are answered I can draft MCO-A as an actual `.spec` in your idearium spec-engine format for ingestion.*
