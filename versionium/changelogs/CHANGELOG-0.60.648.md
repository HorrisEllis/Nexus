# 0.60.648: the pipeline runs on our own model server

James, 2026-11-24: "migrate the bridge into the model server/" · "i just want to get back to the pipeline" · "It should be in the old ollama folder" · "Download CUDA 12.4. Not Vulkan. And don't download both yet."

Ollama's app was uninstalled, and with it the engine and the model files, so nothing local answered and Nexus's build pipeline could not ask any model anything. Now:

- **The engine**: llama.cpp's `llama-server`, build b12716 with CUDA 12.4, from its official GitHub release (checksums matched), in the old Ollama folder where the model server already looks. It sees the GTX 1650.
- **The models**: qwen2.5-coder 3b and 7b, abliterated, back in the old Ollama models folder (checksums matched). DeepSeek-Coder-V2-Lite 16b is still downloading.
- **The bridge talks to the model server**: every model call from the bridge (the build pipeline, Copilot, the agents) goes to the model server's engine for a model the model server holds, starting that model's engine when it is not running. Ollama is the second backend, used only for a model the model server does not have. The tape, the activity log and the shape of each answer are unchanged.
- **The model server** names a model the way the ladder asks for it (`huihui_ai/qwen2.5-coder-abliterate:3b`) and has a new hook, **launch**: how one model's engine starts, from that model's own settings in COS › Settings › Model server.

Checked: a request through the bridge's door answered by the 3b on the GTX 1650 (61 tokens a second warm; the first request after the engine starts is slow while it warms up); the model server's own tests (10 pass); the bridge's tests (the two that fail, reply continuation and OA-003, fail the same way without this change). Not yet checked: a full build round of the pipeline, and calls with tools (they still go to Ollama's chat).

Map: PC25 b (the engine swap), docs/2026-11-08-pipeline-canvas-phasemap.spec. The move of the bridge's code into the model server (PC25 a) is next.
