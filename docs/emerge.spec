spec:
  meta:
    name:        emerge
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        :4242
    uuid:        nexus-emerge-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      DSL runtime. Reads .eg / .emerge files — a purpose-built declarative language. Tokenizer, parser, SNR gate, emitter. 569 keywords, 7 axioms. Ollama for codegen. IDE serves at :4242.

  modules:
    - id: tokenizer
      description: "Lexer for .eg files. 569 keyword vocabulary."
    - id: parser
      description: "AST builder. SNR-gated — rejects low-fidelity input."
    - id: kernel
      description: "Validates compartment definitions against schema."
    - id: emitter
      description: "Generates JavaScript from validated AST."
    - id: codegen
      description: "Ollama-backed code generation for T2 gaps in .eg files."
    - id: ide-server
      description: "HTTP server for Emerge IDE. Proxied through orchestrator."
  handshake:
    components:
      - id: "emerge.run"
        grammar: ["emerge run", "eg run", "er"]
        route: { method: POST, path: "/api/emerge/run" }
        description: "Run an .eg / .emerge file through the DSL runtime"
        params: [{ name: file, type: string, required: true }]
      - id: "emerge.validate"
        grammar: ["emerge validate", "eg validate", "ev"]
        route: { method: POST, path: "/api/emerge/validate" }
        description: "Validate an .eg file against the kernel schema"
