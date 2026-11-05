{
  "envelope": 1,
  "uuid": "emerge-comp-comm-0002-2026-1105-000000000006",
  "type": "command",
  "id": "emerge.compiler.build",
  "system": "emerge",
  "summary": "the whole pipeline: host preflight, T0/T1, host writeback and sync; the files come back as text",
  "payload": {
    "capability": "emerge.compiler.spec",
    "cli": "build-spec",
    "route": "emerge.compiler.build",
    "events": [
      "emerge.compiler.built"
    ],
    "expects": {
      "in": "{ spec: YAML text, name?, host?: { name, ping?, preflight?, writeback?, sync? } each a URL Emerge POSTs to (EAS_D9), skipHost?, force? }",
      "out": "{ ok: true, skipped, moduleName, files: { relative/path: text }, cortex: the host's preflight, writeback, sync, ms }",
      "fails": "400 naming a missing or non-settings field \u00b7 { ok: false, error, step } when the pipeline refuses \u00b7 a host route that does not answer is said in its part of the result, never taken as a pass"
    }
  }
}
