# 0.60.53 - 2026-10-15

James: "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact? like i want to keep a record overtime. like anything that slots to a gig template. to automate. you can have the agents also have a listener for that? like my agent chats, logging skills, patterns, everything valuable for fiverr?"

## What it is
`lib/gig-ledger.js`: an append-only file of claims. Each claim carries evidence a program checks: a commit exists, a file exists, a test prints `N passed, 0 failed` (N > 0), a folder holds at least the claimed count. `facts()` returns only claims whose latest check passed and that nobody withdrew. Claims are filed under the gig part they fill: skills, portfolio, numbers, process, about.

## The agents' listener
`lib/gig-ledger-listener.js` hears `run.finished`. It files a deliverable claim whose evidence is the files that run changed. It does not file what the agent said about itself: a chat's words are not evidence. This is the coder's reading of "my agent chats"; to confirm (PF0a in the map).

## Proof and limits
Tests GL-01..GL-10 (10/10), including an overstated count that fails, a made-up commit that fails, and a claim with no evidence that is kept but never shown. Not built: a route, a command row for agents, the sources that prove skills and patterns (PF1), the link into the gig draft (PF2), the screen (PF3). Until PF1, skills and patterns only enter by hand.
