# 0.60.394 — Clear Glass has WebGL again (WG1)

James, 2026-11-05: "i cant use fiverr at all. clearglass is my main driver". His local session had found: "Fiverr's bot-check script crashes
inside Clear Glass (TypeError reading 'replace', ERRCODE PXCR10002539), and Clear Glass isn't spoofing anything."

## Found
- Clear Glass turns hardware acceleration off unless `CG_GPU=on`. That has been the case since 0.60.3, to stop a GPU crash-loop.
- Newer Chromium no longer falls back to software WebGL, so WebGL was missing on every machine. Measured on Electron 42.11.6:
  `getContext('webgl')` returns `null`.
- My reading, to confirm on your machine: Fiverr's bot check reads the WebGL renderer, and its `.replace` failed on the missing value.

## Built
- With acceleration off, Clear Glass now asks for software WebGL (`--enable-unsafe-swiftshader`).
- `CG_GPU=on` still gives the real GPU, and it is the better choice on a machine whose GPU works.
- Chromium calls the switch "unsafe" because software WebGL is less hardened than the GPU path. It is used only while acceleration is off.

## Proof
`test-cg-webgl` 2/2. WG-02 runs in real Electron: WebGL is `null` without the switch, and has a SwiftShader renderer with it.
