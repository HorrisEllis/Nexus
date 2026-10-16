# 0.60.93 - 2026-10-16

_Built on the branch claude/code-tab-run-state-phasemap (PR #91) as 0.60.72; renumbered 0.60.93 at the merge with main (main had already used 0.60.72)._

James: "auto updates from dropping in new zips, downloading it from clearglass."

## What changed (COSA7: Clear Glass delivers)
- **`clear-glass/src/releases/deliver.js`:** asks GitHub for the latest Nexus release. If COS already has that version (or it is older than what COS has) nothing happens. Otherwise the zip is downloaded to a `.part` file, hashed as it streams, capped at COS's 600 MB, and compared with the release's published `SHA256SUMS`. Only a match is renamed into COS's inbox, last, with `<zip>.sha256` beside it, so COS's watcher never sees half a file and shows the version as **verified**. A mismatch deletes the download and says both hashes.
- **No published checksum:** the zip is still delivered, reported **not verified**, and COS's update policy `auto` will not switch to it by itself (it offers). If `SHA256SUMS` exists but cannot be read, nothing is downloaded.
- **Where:** `nexus-release status` (downloads nothing: what is out, what COS has, what a fetch would do) and `nexus-release fetch` (a person's act, not an agent's), `GET /cli/releases/status`, `POST /cli/releases/fetch`, and the Automation job **Bring new Nexus releases to COS** (every 6 h; it only delivers, it never switches).
- **`release.yml`** now publishes `SHA256SUMS` beside the zip, from the next release on.
- What COS does next is its **Updates** setting (off / ask / auto, 0.60.90), and with the autopilot idle signal (0.60.92) auto can switch while Nexus runs once the running Nexus is 0.60.92 or newer.

## Honest limits
- The checksum comes from the SAME release as the zip: it proves the download is intact, not that the release is trustworthy. A compromised release would have a matching checksum.
- The NP16 quarantine vault is not built, so a delivered zip is protected by the checksum and COS's own inspection (size, entry count, path traversal, folder = VERSION), not by quarantine.
- Public releases only (a token is accepted by the code, not wired to a setting). Tested against a local server that plays GitHub (RD-01..13), including a real zip imported by COS's real store; not run against real GitHub from here. Releases before this one publish no `SHA256SUMS`, so the first deliveries are unverified.
