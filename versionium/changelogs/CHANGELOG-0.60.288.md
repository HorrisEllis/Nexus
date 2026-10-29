# 0.60.288 — how much of Nexus is wired; Guardian pre-cleaned

James, 2026-10-29: "Tell me, how much of a nexus that you could tell is actually fucking wired together?" · then: "Well, first of all, let's
clean it. Pre-clean it out".

## The measurement — `node scripts/wired-report.js`

What it counts:
- 1,910 code files, about 427,000 lines (tests and the archive left out).
- A file counts as wired when something that starts can reach it: one of the 12 systems autopilot launches, Clear Glass, or the CLIs.
- The links followed: requires, launched processes, `<script>` tags, and files loaded by name.

Results:
- **67% of files, 72% of lines**, counting only certain links.
- **78% / 82%** with files loaded by name. That is an upper bound: a quoted file name is not proof the file is loaded.
- Of 415 unreached files: 189 (about 39,000 lines) only tests load; 226 (about 39,000 lines) nothing loads.

It is a floor, not a verdict:
- HTTP between systems is not counted as a link.
- Being reachable is not the same as working.

The first count said 56%. It was low because of two scanner blind spots, both fixed and tested:
- a `/*` inside a `//` comment hid the rest of the file (`lib/agent-tools/index.js`: 38 of 125 links seen);
- Idearium's `_require` was not read.

## Guardian pre-clean

**Archived** to `_archive/2026-10-29-guardian-preclean/` (see the README there):
- `guardian/mesh/` and `guardian/routes/mesh.js`.
  - His 2026-09-06 decision: "DNS/firewall/crypto/host-rotation is redundant and should be deleted". That pass retired the Clear Glass
    copies.
  - The 2026-10-24 refactor (RF2) moved these copies into Guardian instead of retiring them.
  - Nothing that runs loaded them.
- `guardian/guardian-api.js`: unused, and its memory calls go to routes that 404.

**Kept:**
| File | Why |
|---|---|
| `guardian-service.js` | the COS entry the guardian-into-cos map plans (GD8) |
| `dropzone.js` | a standalone CLI |
| `lib/command-registry.js` | his `.command`-nodes feature: built, not wired |
| `lib/agent-model-nodes.js` | his `.agent_model` nodes: built, not wired |

**Result:** Guardian goes from 82 to 67 files, and from 35,928 to 30,380 lines.

## Proof

These suites are unchanged after the move:
- test-system-boundary 10/10;
- test-sovereign-systems 10/10;
- test-loom-map 19/19;
- test-architecture-migrate 5/5;
- guardian-command-index 9/9;
- guardian-cfr-proxy 6/6;
- test-agent-mesh-guardian-coverage 7/7;
- test-copilot-tools-guardian-ncp-mesh 9/9.

test-guardian-data-sovereignty fails 3 checks both before and after this change.
