spec:
  meta:
    name:        grammar-engine
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-grammar-engine-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Reads component registry grammar tree. Builds trie for O(k)
      command resolution. Tab completion. Live rebuild on SSE.
      Grammar owned by registry. Engine reads. Never writes.
      §CR-006: CLI does not own grammar. Registry does.

  exports:
    - "fetch(orchestratorUrl) → { ok, componentCount }"
    - "load(tree, aliases) → { ok, componentCount }  (test/offline use)"
    - "buildTrie(tree) → TrieNode"
    - "resolve(input) → { componentId, matched, remainder, params, fromAlias } | null"
    - "complete(partial) → string[]"
    - "parseParams(remainder, schema) → { ok, parsed, errors }"
    - "invalidate() → void"
    - "rebuild(orchestratorUrl) → { ok }"
    - "status() → { ready, componentCount, aliasCount }"

  resolution_order:
    1: "Check aliases (single and multi-word)"
    2: "Walk trie token by token"
    3: "Return last valid componentId found"
    4: "Remainder = tokens after matched command"

  tests:
    count: 16
    status: "16/16 PASSING"
