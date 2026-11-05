# docs/2026-11-05-clear-glass-webgl-phasemap.spec — Clear Glass has WebGL again (Fiverr's bot check crashed on its absence). Owner: clear-glass.

origin: >-
  James, 2026-11-05, reporting a local session's finding: "The autofill failed before any field. Fiverr's bot-check script crashes inside
  Clear Glass (TypeError reading 'replace', ERRCODE PXCR10002539), and Clear Glass isn't spoofing anything." · "i need that fixed. i cant use
  fiverr at all. clearglass is my main driver"

found: >-
  (§0.1, measured 2026-11-05 on Electron 42.11.6, the version in node_modules) Clear Glass turns hardware acceleration off unless CG_GPU=on
  (clear-glass/src/main/index.js, since 0.60.3, for a GPU crash-loop). 0.60.3's note says pages then read WebGL as "Google SwiftShader". That
  is no longer true: newer Chromium dropped the automatic software fallback for WebGL, so with acceleration off getContext('webgl') returns
  null on every machine. Probe, run under xvfb: as Clear Glass runs today → "webgl: null"; with --enable-unsafe-swiftshader → "ANGLE (Google,
  Vulkan 1.3.0 (SwiftShader Device …))". A bot-check script that reads the WebGL renderer string and calls .replace on it fails on null —
  the coder's reading of the TypeError, to confirm on his machine.

phases:
  WG1_webgl_with_acceleration_off:
    status: "BUILT 0.60.394 — test-cg-webgl"
    depends_on: []
    files: [clear-glass/src/main/index.js, tests/modules/test-cg-webgl.test.js, tests/modules/run-all.js]
    does: >-
      With hardware acceleration off, Clear Glass also passes --enable-unsafe-swiftshader, so WebGL exists (software-rendered) instead of
      missing. CG_GPU=on is unchanged: hardware acceleration and the real GPU, the better choice on a machine whose GPU works. The trade-off,
      said: Chromium names the switch "unsafe" because software WebGL is less hardened than the GPU path; it is used only while acceleration is
      off.
    proof: "the source passes the switch exactly when acceleration is off; the probe in real Electron reads WebGL null without it and a renderer with it"
  WG2_gpu_on_by_default:
    status: "BUILT 0.60.395 — test-cg-webgl WG-01"
    origin: "James, 2026-11-05: \"that might explain why the tv ui or idearium is so laggy in clearglass. enable it by default\" (the reading of \"it\" as hardware acceleration is the coder's, from the line before it)"
    depends_on: [WG1_webgl_with_acceleration_off]
    files: [clear-glass/src/main/index.js, tests/modules/test-cg-webgl.test.js]
    does: >-
      Hardware acceleration is on by default (with it off, every page — the TV UI, Idearium — was drawn by the CPU). It is off when CG_GPU=off,
      or when the GPU process died 3 times in one run: then <userData>/gpu-off.flag keeps later starts in software mode (WG1's software WebGL),
      said in the log, until the flag is deleted or CG_GPU=on. The 0.60.3 default (off) is superseded and kept in the comment (§0.3).
    proof: "WG-01: on by default; off with CG_GPU=off or the flag; three GPU deaths write the flag"
  WG3_a_failing_gpu_restarts_in_software_now:
    status: "BUILT 0.60.401 — test-cg-webgl WG-01"
    origin: "James, 2026-11-05: \"clearglass is looping\" · \"finish clearglass.\""
    depends_on: [WG2_gpu_on_by_default]
    files: [clear-glass/src/main/index.js, tests/modules/test-cg-webgl.test.js]
    does: >-
      The coder's miss in WG2, found the same day: Clear Glass passes disable-gpu-process-crash-limit, so with the GPU on by default a failing
      GPU process restarts forever, and WG2's flag only took effect at the next start. On the third GPU death the flag is written and Clear
      Glass restarts itself once, in software mode. Whether this was his loop is his machine's to show.
    proof: "WG-01: the third death writes the flag and relaunches"
