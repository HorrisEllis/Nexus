spec:
  meta:
    name:     cos-debug-report
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.271
    uuid:     nexus-cos-debug-report-v1-0000-2026-0927-jamesbrooks-001
    file:     lib/cos-debug-report.js
    status:   built — proven by tests/modules/test-one-idearium-phases-nodes.test.js
    phasemap: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (T3)
  purpose: >-
    What a failed COS run tells you, pointed at the code: the error, the frames in the repo, and their source lines.
  contract:
    report: >-
      (run, { cwd }) -> null for a pass, else { file, exitCode, error, errorLines, frames:[{file,line,col,fn,lang,
      inRepo,excerpt}], outside, timedOut, hint }. Reads node:assert / node --test TAP (error block, actual/expected),
      jest/vitest, mocha, pytest, go, rust, rspec, phpunit failure lines; Node, Python, Go/Rust/Ruby/PHP frames.
      Frames in node:internal, node_modules, site-packages are counted, not listed. Excerpts are read from the run
      directory before lib/cos-run.js cleans it up. Nothing is guessed.
    compact: (report) -> the same, trimmed for idearium_repo_runs rows (the Debug tab).
