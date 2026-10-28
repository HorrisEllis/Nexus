# 0.39.292 — 2026-10-02

James: "how can i import into the pipeline. the specs also need to convert into actual spec files. also cant import into the pipeline, since you merged."

James's spec library (0.39.290) turned each document into an idea with a spec. But the pipeline (Phases, Generate code, Build & prove) works on repos, and nothing turned a library spec into a repo. This release closes that gap.

## A library document into the pipeline
- **The spec becomes a repo.** It takes the same promotion every spec takes (`_promoteSpecToRepo`). The default is `manual`, because the document is a design and generating code is the pipeline's step. `mode: 'emerge'` also runs the guardian's module extraction and compile.
- **The document becomes a real `.spec` file in that repo.** It is written as YAML: the meta (name, version, family, kind, summary, where it was found, its sha, when it was imported) plus every section in the document's own order. The import tag the spec engine puts on each section is removed. The file loads back as YAML.
- **The original stays beside it.** When the original is text (`.md`, `.txt`, `.spec`, `.yaml`, `.json`), it is written at `spec/original/<name>`, byte for byte. A Word document's original stays in the library, where it already is (§0.3).
- **One idea, not two.** The library's idea becomes the repo's idea and moves to `specced`. No second "Repo: …" idea is created beside it.
- **Asking twice opens the same repo.** The library row remembers the repo and its `.spec` file.
- **Refusals are stated.** A diagram, PDF or image has no spec to build from, so it is refused with that reason. A failed promotion is reported and the row is left unchanged.

## Where
| Surface | What it does |
|---|---|
| API | `POST /api/spec-library/:key/to-repo` takes a sha, a sha prefix or a title (any case). With `{ "mode": "emerge" }` it also runs extract + compile. |
| CLI | `idearium spec-library to-repo <title\|sha> [--emerge]`. `idearium spec-library` lists the repo beside each document already sent. |
| UI | The library page has **→ pipeline** on every row with a spec, and **open repo** once it has been sent. The main Idearium window opens the repo, and accepts that message only from the library window it opened. |

## Mapped, in his words (master phasemap 1.8.0)
- **IL2**: this release.
- **CP1**: "i want copilot to be able to help with idearium. communicate with the agents,"
  - **What copilot reaches today:** the codebase tools, a repo's chunk nodes, `run_closed_loop`, `call_system`, and the archive drop box.
  - **What it cannot reach:** the library, the pipeline, verify and prove, and the agents themselves.
  - **Plan:** the routes that already exist become copilot tools. Copilot can then message a repo's agent and read a running job. Every write goes through the same gates.
- **CO1**: "then we need to clear out the original cos." Not acted on until James says which COS he means. Whatever it is will be archived, never deleted.

## Proof
`tests/modules/test-spec-library.test.js`: 10/10. SL-09 runs against the real `RepoLayer` and checks:
- the repo exists and its idea is the library's idea;
- `spec/rheon-studio.spec` loads as YAML with all 3 sections and no import tag;
- the original matches byte for byte;
- the row remembers the repo, and a second request promotes nothing;
- a diagram is refused, and a failed promotion is reported.
