# cos/spec/deny-list.spec — what must never appear in Nexus again. CK-233 "forbidden things absent" (negative space,
# cos/spec/check-catalogue.spec) reads this file; a repo adds its own in <repo>/.nexus/deny.yaml (same shape).
# Each entry: { id, what, pattern (a regex, one line), files (extensions), paths (roots, relative), except (path prefixes),
# skip_comments, why (his words), since (the version that removed it) }.
spec:
  meta:
    name: deny-list
    version: 1.0.0
    date: 2026-10-14
    owner: "cos (CK-233) · tests/modules/test-check-catalogue.test.js"
    origin: >-
      James, 2026-10-13: "so why is compartment browser in clearglass ui. should be gone" · "it should have it no where.
      im scared of regression." · 2026-10-14: "yes start QA1". The one-off guards he asked for (test-no-compartment-label,
      CG-001b) become entries of one list a gate can run, and the removed Architect page gets the guard it never had.
  deny:
    - id: compartment-label
      what: 'a "compartment · <kind>" label drawn in a page or window'
      pattern: 'compartment\s*(·|&middot;|\\u00b7)\s*\$?\{?[a-z]'
      files: [html, js, css]
      paths: [clear-glass/renderer, clear-glass/src, idearium/ui]
      skip_comments: true
      why: '"so why is compartment browser in clearglass ui. should be gone" · "it should have it no where. im scared of regression."'
      since: 0.60.11
    - id: playwright
      what: 'Playwright loaded by a test, probe, script or system'
      pattern: '(require\(\s*[''"`](@playwright/test|playwright(-core)?)[''"`]\s*\)|from\s+[''"`](@playwright/test|playwright(-core)?)[''"`]|import\(\s*[''"`](@playwright/test|playwright(-core)?)[''"`])'
      files: [js, cjs, mjs]
      paths: ['.']
      except: [node_modules, data, _archive, .git]
      why: '"No playwright. That''s literally what clearglass was born from." (AXIOMS §4.1, 2026-10-05)'
      since: 0.59.0
    - id: architect-page
      what: "a link or opener for Idearium's removed Architect page (ui/architect.html)"
      pattern: '[''"`/][^''"`\s]*architect\.html[''"`?#]'
      files: [html, js]
      paths: [idearium/ui]
      except: [idearium/ui/_archive]
      skip_comments: true
      why: '"can you delete this architecture afrom idearium?" (the Architect page; the repo''s Architect tab stays)'
      since: 0.60.19
