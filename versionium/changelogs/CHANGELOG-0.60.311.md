# 0.60.311 — spec and map first: cos/dependencies and the COS cockpit, every decision by the axioms

James, 2026-10-30:
> "no not every keystroke, only when you need it. or maybe make it a setting, using the contiious event stream."
> "copy every file you need to a cos/dependancies folder. then lets build cos, tabs, beautiful, what about using forking idearium specifically for cos for now, llook at the tablet spec. i want it to look beautiful, not cramped, open and use the axioms as law for each decisiion. full control panel/cockpit for each system."
> "SPEC AND MAP FIRST. DAG" · "THE AXIOMS IN DOCS THE 3.1 AS LAW"

The coder had started copying before the spec: a folder was made, nothing was copied, and the folder was removed. This release is that work done in his order.

## Decisions (`docs/2026-10-24-cos-manager-phasemap.spec`)
- **MG_D9, his: `cos/dependencies`.** COS's outside files are copied with `VENDOR.lock.json` and a check that fails on any edit. By the axioms: §0.3, §10.3, §5.15 rule 2, §16.5 and §17.12.
  - **Copied:** Emerge, the ERAVOS canvas and schemas, his update system, SNR Passthrough, and the ESS text.
  - **Not copied:** Emergence and the Associative Lattice. They are Emerge's components, and stay in `_archive`.
  - **Named gap:** two copies of Emerge exist until F2 switches the callers of `lib/emerge`.
- **MG_D10, by the axioms: COS's own cockpit server.** It runs on 127.0.0.1:7797, serves the pages and forwards to the one door. CORS `*` is refused, because any website could then restart his systems (§4.3).
  - Also by: §5.12, §5.15, §16.5 and the tablet connection law.
  - **Found:** the tablet is served by nothing, and `/status` sends no CORS header, so it has only ever shown its fallback.
- **MG_D11, his: Idearium's look forked.** Its tokens and fonts are copied, with a test that keeps them equal. Open, not cramped. "The look, not the pages" is a reading, to confirm.
- **MG_D12, by the axioms: pages in frames and a declared bus, with sections as folders** (§5.7, §5.12, §5.13). The registry bus follows in MG30, after DB16.
- **F_D3, his (foundation map): the assistant acts when it's needed, on the continuous event stream.** How eagerly it acts is a setting.

## Specced (`cos/spec/cos-manager.spec`)
- **New schema:** VendorLock.
- **New modules:** cos-dependencies, cockpit-server, cockpit-theme, container-rows, ui-cockpit and ui-registry-bus.
- **The cockpit's tabs** follow the tablet's container: Overview, API, Data, Files, Events, Tests, and Snapshot (said as not built).

## Phases
- **MG28:** dependencies.
- **MG29:** command rows first, then the cockpit (§3.4).
- **MG30:** the pages on the registry bus.
- **MG18 re-based on today's door.** Its old dependencies are kept in the addendum.

## Proof
- `test-substrate-spec` 3/3.
- The DAG has no dangling references and no cycles.
- The phase graphs show no new crossings: MG29's two are already known, pre-existing in `route-commands.js`.

Spec and map only. Nothing is built.
