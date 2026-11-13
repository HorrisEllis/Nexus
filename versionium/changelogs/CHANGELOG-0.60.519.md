# 0.60.519: GR0, the graph census, in Emerge

James, 2026-11-13: "i want the orchastrator and supstrate for the graphs phases" · "find them." · "yes. then the highest leverage."

## Built
- `cos/census/graph.eg` (Emerge, read-only). Every graph Nexus keeps, declared with the token its code names it by (the 2026-10-20 census:
  loom registry, require graph, phase graphs, phase DAG, system boundary, CFR causal graph, crystal lattice and its nodes, person model,
  repo graphs, blueprint index, page blocks). For each graph:
  - **writers and readers**, read from 2,045 source files. A writer writes on the token's line, or through the name that line gives the
    store.
  - **rows**, read from data: a JSON file's entries, a table's `.jsonl` lines, a folder's files, the maps' phases. With no data, rows is
    null and the reason is given.
  - **what its edges rest on**: discovered, declared or observed.
- A graph the code names but the census does not declare is listed under **unknown**, so a new `*_edges` or `*_nodes` table shows up
  without anyone editing the census.
- Through COS: `GET /api/cos/census/graph` (`?markdown=1` for the page), `census graph [--md]` in COS's console, `cos census graph` in
  Idearium's command line. The atlas page is `docs/atlases/graph-census.md`.

## Proof
eg test 4/4: writers through a name; rows read and none invented; a new table appears; the markdown. On the tree: 13,419 loom entries,
5,778 phase graphs, 1,079 phases in 131 maps, one undeclared name (`detect_edges`, vendored). test-cos-pipeline 21/21,
test-cos-console 11/11, test-cos-console-tab 4/4, the cos/pipeline eg suites green. test-cli-route-commands CL-07 fails as before (it
needs Guardian running).

## Not proved
His real counts: the sandbox holds no live tables. On his machine, `census graph` in COS's console gives them.
