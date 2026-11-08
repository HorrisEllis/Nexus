# 0.60.459 — the API step: any API, agnostic

James, 2026-11-08: "API for anything. Agnostic remeber. Nexus systems, APIs from web services. Etc. http sockets etc" · "They need to work
completely independent of each other. Like add support to drag .pipeline nodes into Eravos. I want them to stay separate projects."

- **⟷ "Call any API":** one step, chosen by its address.
  - `http(s)://`: a web service.
  - `ws(s)://`: a socket. It sends, then collects replies up to a count or a time limit.
  - `tcp://host:port`: a raw socket.
  - `nexus://<system>/<path>`: any Nexus system by name. COS gives the address from its system declarations, so the engine needs no fixed port
    list.
  - Every failure is named, including a socket that never answers.
- **Proof:** OA-09, against a real HTTP, WebSocket and TCP server. test-orchestrator-automation is 9/9, and every engine suite passes.
- **Recorded:** COS and ERAVOS stay separate projects that work fully independently. They meet only through node files. Dragging a `.pipeline`
  into ERAVOS is ERAVOS's own feature, built in its repository. Nexus is already in Idearium, so nothing was built for that.
- **Next:** COS's Workflows page, built as previewed, with Edit inside COS.
