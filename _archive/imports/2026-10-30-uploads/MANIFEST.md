# Uploads, 2026-10-30 — kept whole (§0.3)

James sent these into a session whose files vanish when it ends, so they are kept here as he sent them. Read, not yet integrated:
where each part goes is recorded in docs/2026-10-24-emerge-warp-system-phasemap.spec and docs/architecture-spec/architecture-spec.spec.

| File | What it is | sha256 as received |
|---|---|---|
| `update-system.zip` | His server-push update system over WebRTC (10 files). Two defects found and probed: see docs/2026-10-15-cos-app-phasemap.spec addendum 2026-10-30 | `6bee150b2c2ebfd162efd017964f26672a7ecbcc7a1ac175bd018768b84e443a` |
| `emergence-6.zip` | Emergence 0.1.0 on WARP: pattern engine, RFR2 observer, CFR creator, lattice, causal graph, idea store; the other half of RFR2; emerge-language.spec 2.0.0 | `6038e8555006c6c644253d0251ac24bf48e4b54015dc5f8ade8d51f55d51bfbe` |
| `Signal_to_Noise1.zip` | SNR Passthrough: INPUT → plugin chain → OUTPUT (checkpoint, snr-gate, tagger, behavior-pattern, resonance-field, analytics …), POST /snr/input, a SISO bus, a UI | `1d8824aa9211430a2ce9d5022b630e18490733e6fd81eebaa295252f157063e7` |
| `ESS-spec-v0.1.0.docx` (+ `.txt`, its text) | ESS, End-State Signal, v0.1.0: a content-addressed signal routing language; five primitives (WRITE, BIND, CALLTO, RESOLVE, UNRESOLVE) | `d43bc5288e426b44706ba7a7f126603e50169dec119d8a5b3b9ae2935b284f42` |
| `Associative_Lattice.zip` | ALK v1.8.0 (behavioral signal runtime: face, body, voice, expression, latent state, WebGL particle field), CrystalBall, the Resonance Engine (TypeScript), mastermind, the listener, NEXUS-FORGE pages, revisions v1.2.1–v1.6.2 | received `a176035e6b3f8175c0a65bae4ac1ee164b9f998ca85a813313c49581c1f277fd`; kept `ecabcc04b1c878c68850e302428c196767a004cb28c8e92ca17a1107f76626d3` |

**One entry removed, and why.** `Associative Lattice/cmd.exe` (339,968 bytes, sha256
`14cc8ab1dcf0d9f19e8fb82deb547cf8c462c56a0e43f7addc02641ab3c81651`) is Microsoft's Windows Command Processor 10.0.26100
(its version resource: CompanyName Microsoft Corporation, OriginalFilename Cmd.Exe). Every Windows install has it, so it is
redundant, and it is not ours to redistribute. Everything else in that zip is unchanged.

**Attribution, as the files state it.** `ALK/siso.js` and `jaa-browser.js` name Jonathan Bailey as author of SISO and of Jaa's
architecture, as lib/siso/spec/siso.spec does in Nexus.
