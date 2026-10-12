# 0.59.12 — 2026-10-11

James: "the nexus> is for you. not me. give yourself the tools using nexus>. dude...." · "In the git, can you copy the atlas to use as the readme? In the GitHub."

Before this, he had asked the agent in Idearium's Code tab to bring up the Clear Glass renderer, and it ran out of iterations:
- A Code-tab agent gets 8 tool rounds.
- Its first message lists only its code tools, a tool finder and the tool-layer index. Finding, expanding and reading the browser tool takes most of those rounds.
- The one action that opens a tab, `open_tab`, opens a **background** tab, so nothing would have appeared on screen anyway.

`nexus>` lines are the way the agent in a chat Clear Glass watches works on his machine. Until now that agent could count phases but could not show him a page or read a log.

## The agent's own `nexus>` tools

| Line | What it does |
|---|---|
| `glass open <url>` | Shows James a page. The window already on that site comes to the front; otherwise the main window goes there; otherwise a new window opens. `localhost` and IP addresses use http. |
| `log [autopilot\|errors\|<path>.log] [--lines n] [--grep p]` | The end of a Nexus log. `errors` is `data/error.log`. |
| `file <path> [--from n] [--lines n]` | Numbered lines of a file in the Nexus tree, or a folder listing. The answer says where the next part starts. |
| `grep <pattern> [--path dir] [--limit n]` | `file:line: text` across the code. It skips node_modules, data and _archive. |

- **Opening a page:** the wire server's `POST /open` logic (focus the window already on that origin, the boot race on `default`) moved into `openOrFocus()` in `clear-glass/src/main/index.js`. `/open` and the new `/cli/open` both use it.
- **Reading:** `log`, `file` and `grep` run in the process that hears the line (`lib/nexus-read.js`, through new `local` rows in `idearium/cli/route-commands.js`). They are read-only.
- **Secrets:**
  - Always refused: anything outside the Nexus folder; `.env`, `.git`, `.ssh`; key files.
  - Also refused: a non-code file whose name mentions a secret (token, password, vault, cookie, credential, accounts), and anything under `data/` that isn't a `.log`.
  - Source code is still readable, such as `passwords/vault.js`.
  - Key-shaped strings are replaced with `[redacted]` in everything that comes back (`sk-…`, `ghp_…`, `Bearer …`, `"password": …`).
- **Allowed from a watched chat:** `glass open` joins `dump` as a write a watched chat may do. `log`, `file` and `grep` are read-only by construction. Everything that changes Nexus is still refused there.
- **Room for long answers:** a row may carry `maxChars`. These four carry 8000 characters; other answers are still cut at 1200.
- **Agents:** `nexus.command`'s description names the new commands, so every agent sees them.

## README

- `README.md` on GitHub is now the NEXUS atlas (`docs/atlases/nexus-atlas.md`). Its links are written from the repo root, so they work there.
- The old README (the Emergence-era design, marked superseded by its own banner) is kept at `_archive/README-v5.1.0-superseded-2026-10-11.md`.
- `scripts/generate-atlases.js` copies the atlas over the README each run (`syncReadme()` in `lib/atlas-generate.js`). `test-readme-atlas` fails if they drift apart.

## Fixed

`test-nexus-atlas-refs` was failing 52/53 since 0.59.11. The copilot atlas row added then used code style for plain text, and that test needs code style to name real files. It passes 53/53 again.

## Tests

- `test-nexus-read` passes 4/4 and is new: secrets refused, keys redacted, file/grep/log, the chat policy.
- `test-readme-atlas` passes 1/1 and is new.
- These still pass:

| Suite | Result |
|---|---|
| `test-nexus-ask` | 6/6 |
| `test-nexus-chat` | 8/8 |
| `test-listener-commands` | 5/5 |
| `test-cg-copilot-verbs` | 9/9 |
| `test-nexus-command-tool` | 7/7 |
| `test-cli-route-commands` | 8/8 |
| `test-cm3-commands` | 4/4 |
| `test-event-contracts` | 8/8 |
| `test-nexus-atlas-refs` | 53/53 |
| `test-idea-dump` | 3/3 |
| `test-field-nerve` | 5/5 |
