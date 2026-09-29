spec:
  meta:
    name:     living-spec
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.271
    uuid:     nexus-idearium-repo-living-spec-v1-0000-2026-0927-jamesbrooks-001
    file:     idearium/repo/living-spec.js
    status:   built — proven by tests/modules/test-one-idearium-phases-nodes.test.js
    phasemap: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (S1-S2)
  purpose: >-
    A repo's living model: the .spec files of its spec folder, parsed into what the living-model rule asks for.
  contract:
    listSpecs: >-
      ({ repo, repoDir }) -> { scope, specs, primary } — a nexus system: its spec/ from the immutable base (core:
      docs/ + architecture-spec/, primary the architecture spec); all of NEXUS: each system's primary spec; any
      other repo: *.spec under spec/ or specs/ plus root *.spec. Phasemaps are left out (the Phases tab).
    readSpec: ({ repo, repoDir, specPath }) -> { path, text, bytes, system, parsed }.
    parseSpec: >-
      (text) -> { ok, error {message, line}, root, meta, sections [{key, kind, size, value}], versionHistory, gaps,
      addenda [{line, title, date, text}] } — js-yaml when it loads; a spec that is not valid YAML says where and is
      still shown by its top-level keys.
    route: GET /api/repos/:uuid/living-spec[?path=] (idearium repo.living-spec).
