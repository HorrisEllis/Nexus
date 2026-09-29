spec:
  meta:
    name:     code-intel
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.273
    uuid:     nexus-lib-code-intel-spec-v1-0000-2026-0927-jamesbrooks-001
    files:    [lib/code-intel/{structure,decls,chunker,text,cards,search,index}.js, lib/code-edit.js, idearium/repo/code-api.js,
               lib/agent-tools/tools/idearium/code.js]
    status:   built — proven by tests/modules/test-code-intel.test.js (CI-101..CI-601), test-code-edit.test.js
              (CE-101..CE-304), test-code-tools.test.js (CT-101..CT-409)
    phasemap: docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec (CB1-CB6)
  purpose: >-
    Idearium solid for building codebases (James, 2026-09-27): every repo idearium holds is cut into structural
    chunks, each chunk carries a card that says what it is and how it connects, the whole repo is searchable by
    meaning and by exact text, and agents change it with precise, checked, revertable edits.

  contract:
    chunker (lib/code-intel/chunker.js, VERSION 2.0.0): >-
      planChunks(content, language) -> { chunks:[{ start, end, kind, name, qualifiedName, parentQName, symbol,
      symbolNames, exported, defines, declLine, signature, key, forced }], symbols, family, fallback }.
      R1 cut only at a statement start of the level being chunked (never mid-body). R2 a declaration's doc comment,
      decorators and attributes open its chunk; a free-standing banner one blank line above counts; a file header that
      begins the file stays the file's preamble. R3 a unit over LIMITS.max (150, CODE_INTEL_CHUNK_MAX) is split at its
      own members / cases / sub-headings, recursively; only one indivisible statement is cut at blank lines, forced:true.
      R4 small neighbours merge (imports, variables, statements; one-line helpers group and keep every symbol). R5 every
      line is in exactly one chunk, checked — a plan that fails is replaced by windows and says so. R6 key = kind +
      qualified name (+ ordinal among same-named) → ids survive code added above. Families: js (strings, templates,
      regex), c (strings, char literals, raw/triple strings), indent (python/ruby/yaml/…; brackets + triple quotes),
      md (headings, fences). An unbalanced brace scan falls back to indentation (fallback says so).
    pipeline: >-
      idearium/repo/import-pipeline.js: parse plans every changed file (unchanged files with the same chunker keep their
      symbols); chunk ids = sha(repo:file:key); chunk JSON gains key, kind, name, qualifiedName, parent, declLine,
      signature, exported, defines, language, forced, chunker; indexes/files.json entries carry chunker + lineCount; a
      file chunked by another chunker version is re-chunked once. After GRAPHING: buildIntel → indexes/cards.json and
      indexes/search.json, events intel:build:complete | intel:build:failed; result.intel. Non-fatal.
    cards: >-
      { id, file, range, lines, language, kind, name, qualifiedName, parent, prev, next, signature, doc, summary,
      defines, exported, imports, uses[{ name, chunkId, file, basis }], usesTotal, usedBy[...], usedByTotal, tests,
      glyph, hash, forced }. basis: import (bound by import/require/createRequire/await import, or require(x).m, or a
      lazy getter _x().m, resolved to a file in the repo that defines it) · same-file (another chunk of the file, or
      this.member of the enclosing class) · name (a DISTINCTIVE code name defined at top level in exactly one other
      file of the same language family). Never a call graph: graph.js keeps `calls` declared unsupported.
    search: >-
      BM25 over name x4, doc+signature x2, path x1.5, body x1; whole identifiers and stemmed parts; a query word that is a
      ≥45% prefix of an indexed word counts at half weight; +8 when the query names a chunk; tests ×0.55 unless the
      question asks for tests (then +8 ×1.6); export/import lists ×0.5; coverage multiplier 0.5 + matched/terms. Hits
      carry id, file, range, kind, name, summary, score, matched, snippet (≤3 lines). grep: literal/regex/word/case,
      path glob, context ≤10, limit ≤200, chunk id per hit, binary and >2 MB files skipped, truncation stated.
    edits: >-
      lib/code-edit.js planEdits — all edits refer to the file as last read; forms { old,new[,replaceAll|occurrence] },
      { startLine,endLine,new[,expectText] }, { insertAfter|insertBefore,new }, { append|prepend }; exact first, then
      unique trailing-space / indentation-insensitive match (re-indented, reported as matchedBy); overlaps, duplicates
      and misses refused with lines. CRLF kept. diagnose: node --check (ESM detected), JSON.parse, python ast, brace
      balance elsewhere. commit: review → propose, or STACK onto this tool's pending proposal for the path; auto →
      propose+apply(defer) each, all-or-nothing with revert of what was applied, one refresh.
    inject (lib/repo-inject.js 0.1.0 +): >-
      op:'delete' (content null; refused for a missing file and on the Nexus gate); apply/revert accept defer;
      currentOf({ layer, repo, path }) = the content an inject is proposed against (live tree on Nexus, real bytes
      otherwise). _current prefers RepoLayer.readTextFile.
    repo-layer (idearium/repo/index.js): >-
      readTextFile — a source-owned (imported) file's real bytes, not its chunk (truncated at max_chunk_bytes);
      deleteTextFile — source bytes + manifest entry + chunk; writeTextFile/deleteTextFile honour { defer }.
    http (idearium/repo/code-api.js, /api/repos/:uuid/code/:op): >-
      GET overview · tree(path,depth) · search(q,path,kind,language,limit,tests) · grep(pattern,regex,case,word,path,
      context,limit) · chunk(id,code,around) · outline(path) · read(path,start,end,view=working|committed) ·
      definition(name) · changes(status,limit). POST edit(path,edits | chunk,content; expectHash,dryRun,force) ·
      write(path,content,overwrite) · delete(path) · move(from,to,overwrite) · batch(ops≤50) · check(paths,tests,max).
      A repo with no cards is indexed on its first code call. A write that introduces a syntax error is refused (422)
      unless force. Emits idearium.repo.code.changed. check answers { passed, files, tests }.
    tools (lib/agent-tools/tools/idearium/code.js): >-
      idearium.code_{map,search,grep,chunk,read,refs,edit,write,batch,check,changes}.tool. repoUuid from the run's
      context (repo-<uuid>). code_changes lists, reverts an applied change, or withdraws the agent's own proposal —
      never approves. In every new repo hat (REPO_TOOL_SCOPE); the six read-only ones are always in scope
      (repo-agent ALWAYS_IN_SCOPE); a hat's persona refresh adds the REPO_TOOL_SCOPE defaults it lacks (toolsAdded, never
      removes); the harness scope lists map/search/chunk/read/edit/write/check + loom.find.

  invariants:
    I1: one write path — every agent write is an .inject through RepoLayer; review mode and the Nexus gate hold.
    I2: derived, never a second truth — cards and search are rebuilt by the pipeline, cached by hash, basis stated.
    I3: bounded output — every read/search/grep is capped and says what it left out and how to get it.
    I4: refusals explain — where the nearest match is, which lines matched twice, which hash disagreed.
    I5: nothing silently fails — a failed intel pass is on the result; the import still completes.
    I6: small-model first — few tools, one job each, ids that survive edits, one-line summaries.

  env:
    CODE_INTEL_CHUNK_TARGET: merge neighbours up to (default 60 lines)
    CODE_INTEL_CHUNK_MAX: split anything over (default 150 lines)
    CODE_INTEL_READ_MAX_LINES / CODE_INTEL_READ_MAX_CHARS: read caps (250 / 16000)

  consumers: >-
    idearium/repo/import-pipeline.js (planChunks, buildIntel), idearium/api/index.js (repo.code → code-api),
    idearium/ui/js/app.js (the repo's Code tab), lib/repo-context.js (dispatch retrieval ranks with the index),
    lib/repo-agent.js (listed tools, scope), lib/repo-hat.js (REPO_TOOL_SCOPE, persona), lib/agent-tools/index.js.
