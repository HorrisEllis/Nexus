# NEXUS 0.39.169 — key management in compartment options

## Correction first

An earlier note in this work said there was "no key management subsystem
in this codebase". **That was wrong**, and the mistake mattered — it was
about to cause a second store to be built alongside a real one.
`cos/vault/` already does the hard parts: AES-256-GCM
(`cos/vault/crypto.js`), a master key on disk, per-compartment scoping
with grants (`canAccess()`), an audit log, and export/import.

`cos/ci/keys.js` therefore stores **nothing of its own**. It is a
CI-shaped façade over that vault.

## Two kinds of thing, deliberately different

**SSH keys — registered by PATH, never material.** The vault holds the
path string; the private key stays where it is on disk, owned by the OS.
This is not a limitation being worked around: copying key material into a
store would make a second copy of the most sensitive file on the machine.
What the vault adds is **indirection** — a pipeline names
`keyAlias: "deploy"` instead of an absolute path, so `.nexus-ci.json` can
be committed and shared without leaking where anyone's keys live.

**CI secrets — values, encrypted.** Tokens and passwords have nowhere
else to live, so they go in the vault and are injected as env vars
(`CI_SECRET_<NAME>`) into a stage's process.

## Value exposure — one door, and it isn't HTTP

A secret value is returned by exactly one function, `secretsEnvFor()`,
which exists to hand values to a spawning process. It is never routed to
an HTTP response or a tool result. Every listing endpoint returns names
and metadata only. This is the same call `cos-vault.js`'s agent tool
already made, for the same reason (a tool an LLM can call is reachable by
anything that can get the model to call it), and this module holds that
line rather than quietly reopening it.

**Captured stage output is redacted** before it is stored or returned —
proven in test: `echo "token=$CI_SECRET_DEPLOY_TOKEN"` captures as
`token=«redacted»`, and the raw value appears nowhere in the run record.
Best-effort by nature and stated as such: a value the command transforms
(base64, split, hashed) cannot be matched.

## Resolution is re-checked at USE time
A key registered months ago may have been moved, deleted, or had its
permissions widened since. `resolveSshKey()` re-runs the full
`checkKeyRef()` on every run, so a pipeline fails with a clear reason
instead of an opaque ssh error. Proven: registering at mode 600, then
`chmod 644`, makes the next resolve refuse with the real cause.

`denied` and `absent` are reported as **different** errors — collapsing
them would send someone hunting for a key that is right there but not
granted to this compartment.

## Env precedence, chosen deliberately
`{ ...vaultSecrets, ...pipelineEnv, ...stageEnv }` — a plain env entry
**wins** over a vault secret of the same name. That order means a
committed `.nexus-ci.json` can never silently shadow-read a vault value it
did not set. Only `CI_SECRET_*` is injected; blanket-injecting every vault
entry would hand unrelated credentials to any command a pipeline runs.

A vault that cannot be opened is **not fatal** — a pipeline with no
secrets is the common case. A stage that actually needed one fails on its
own, visibly (`ci:vault:unavailable` is emitted).

## Bug found by testing
`getSecret()` defaults to `reveal:false` and returns
`{record, value:null, denied}`. That default is a deliberate vault safety
property — a caller must *say* it wants plaintext. Omitting it made every
resolve look like "no such key" even when registration had just
succeeded. Caught by the smoke test registering and failing to resolve in
the same breath.

## Surface
`GET/POST /api/repos/:uuid/ci/keys` · `DELETE .../ci/keys/:alias` ·
`GET/POST .../ci/secrets` · `DELETE .../ci/secrets/:name` — all six
registered as real commands. A repo with no compartment is refused.

## Tests — `cos/ci/ci-keys.smoke.cjs`, against a real created compartment
Alias validation · pasted key material refused · mode-644 key refused at
registration · register/resolve round-trip with path match · unknown alias
refused · permissions re-checked at use time · listing exposes alias only
· secret listing carries no value · secret reaching a real process as env
· output redaction · raw secret absent from the stored run record · ssh
stage resolving via `keyAlias` · `keyAlias`-vs-`keyRef` validation (both,
neither, alias alone).

All four suites re-run: 0 failures.

## Still open
`triggers.onChunkDone`/`onCommit` still fire nothing · agents tab +
per-repo CLI · Map tab · chunk tags · chunk editing · AI IDE · Versionium
tab · spacial void.
