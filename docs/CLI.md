# NEXUS — Unified CLI Design

## The Problem

Right now there are 4 separate CLIs:
```
node cortex/cortex.js       cortex ask / status / gaps / tail
node guardian/cli.js        guardian /code / /chat / jobs / providers
node cockpit/cli.js         forge pipeline / seam / idea / gap / jaa
node idearium/cli/index.js  idea / spec / gap / push / snr
```

A developer needs to know which binary to reach for. There's no single entry point.

## The Fix: `cli/nexus.js`

```
nexus <system> <command> [args]
nexus <shorthand>          # common commands without system prefix
```

### Shorthands (no prefix needed)
```bash
nexus status               # all systems health
nexus start                # boot all servers
nexus stop                 # kill all servers
nexus dispatch <prompt>    # send to chatgpt (default)
nexus jobs                 # list recent jobs
nexus events               # tail cortex event log
nexus gaps                 # all open gaps
nexus idea "text"          # create idea in idearium
nexus ask "question"       # ask cortex
nexus push "message"       # snapshot + versionium commit
```

### Full routing
```bash
nexus bridge health
nexus bridge request job.dispatch --from cockpit --to guardian --payload '{"prompt":"..."}'
nexus bridge tag <id> --tags "type:job,priority:high"
nexus bridge find --tag "status:pending"
nexus bridge subscribe "guardian.job.*"

nexus cortex status
nexus cortex events [--n 20]
nexus cortex post --type "my.event" --payload '{"x":1}'
nexus cortex gaps [--status open]
nexus cortex memory search "query"
nexus cortex tail artifacts --n 10

nexus guardian dispatch --provider chatgpt --command code --prompt "..."
nexus guardian jobs [--status pending|complete|failed]
nexus guardian status <jobId>
nexus guardian response <jobId>
nexus guardian watch <jobId>        # SSE stream
nexus guardian providers

nexus idea add "text"
nexus idea list [--phase seed|building|complete]
nexus idea tension <uuid>
nexus spec build <uuid>
nexus gap open "description"
nexus gap resolve <uuid> "resolution"
nexus snr

nexus test                 # unit tests
nexus test:integration     # integration tests
```

## Implementation

`cli/nexus.js` reads the interaction contract from each system and routes:

```javascript
const CONTRACTS = {
  bridge:   { port: 9999, path: '/bridge/health' },
  cortex:   { port: 3748, path: '/health' },
  guardian: { port: 7820, path: '/health' },
  idearium: { port: 4800, path: '/health' },
  emerge:   { port: 4242, path: '/status' },
};
```

Every command maps to one HTTP call. Output is formatted as ANSI table or JSON (`--json` flag).

## Boot Script

Add to `package.json`:
```json
"scripts": {
  "nexus": "node cli/nexus.js"
}
```

Then: `npm run nexus status`  
Or globally: `npm link` → `nexus status`
