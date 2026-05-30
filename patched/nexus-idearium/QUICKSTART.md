# NEXUS Systems — Quick Start

## The problem was
`node index.js` in the vortex folder does nothing — it's a module file.
Everything runs through `start.js` and `nexus.js` at the root.

## How to start

### Step 1 — Start the API (keep this terminal open)
```
cd NEXUS-Systems-v1
node start.js
```
You'll see: `✓ Idearium API running at http://127.0.0.1:4800`

### Step 2 — Use the CLI (new terminal)
```
node nexus.js help                        # all commands

node nexus.js idea add "my first idea"    # create idea
node nexus.js idea list                   # list by tension
node nexus.js push "initial commit"       # snapshot
node nexus.js vortex status               # system state
node nexus.js vortex ci <spec-uuid>       # CI gate
```

### Or use npm
```
npm start                   # start API
npm run status              # check services
```

## Open the UI
After `node start.js`, open in browser:
- `systems-ui.html` — systems thinking UI (causal web, timeline, .nex files)
- `idearium/ide.html` — spec editor IDE (Guardian dropdown, SNR meter)

## File structure
```
NEXUS-Systems-v1/
  start.js        ← START HERE (boots Idearium API at :4800)
  nexus.js        ← unified CLI for all commands
  package.json    ← npm start / npm run status
  systems-ui.html ← systems thinking UI
  idearium/
    api/index.js  ← the API server (start.js runs this)
    cli/index.js  ← idearium CLI
    ide.html      ← spec editor IDE
  vortex/
    cli.js        ← vortex CLI (via nexus.js vortex ...)
    index.js      ← module only, not executable
  nex/
    index.js      ← .nex codec (SNAP/BP/CLIP)
  schemas/        ← all JSON schemas
  compartment/
    kernel.js     ← Compartment OS kernel (K-15)
    manager.js    ← Compartment manager
```

## What the files are NOT
- `vortex/index.js` — NOT a CLI, just exports. Don't run directly.
- `idearium/core/index.js` — NOT a server, just the IdeaOS class.
