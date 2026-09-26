# SESSION-PROTOCOL.md — how to avoid another silent fork

**Read this before starting substantial work in this codebase.**

## What happened, honestly

This codebase had no version control until 2026-07-13. Every working
session — human or AI — operated on an isolated zip snapshot with no way
to see what any other session had changed. Two sessions independently
continued past a shared 2026-07-11 checkpoint, each building real, tested,
non-overlapping work, with neither aware the other existed. Reconciling
them required a manual, whole-tree, file-by-file diff against the last
shared point — checking every file that existed in both trees against that
baseline to determine who'd actually touched what, then hand-merging the
one file both sides had genuinely edited. That's not a process that scales,
and it already happened more than once at a smaller scale before this (see
`unintegrated/README.md`'s branch-a/branch-b history — the same root cause,
smaller blast radius).

Git doesn't make two sessions unable to touch the same file. Nothing does,
short of real-time coordination this project doesn't have. What it does:
makes divergence *visible in seconds* (`git log`, `git status`) instead of
requiring the kind of archaeology this merge needed, and gives real merge
tooling for the regions that do overlap instead of eyeballing `diff -rq`
output across a thousand files by hand.

## The actual protocol

**Starting a session:**
1. `git log --oneline -20` — see what's landed since you last knew about
   this codebase. If there's a commit you don't recognize, read it (`git
   show <hash>`) before touching anything it might have touched.
2. `git status` — confirm you're starting from a clean tree, not
   accidentally building on top of uncommitted changes from a session that
   never finished.

**During a session:**
3. Commit real, working increments — not one giant commit at the end. This
   codebase's existing discipline (dated `§FIXED`/`§BUILT` comments,
   `lib/version.js`'s detailed changelog array) is genuinely good practice
   and should continue *in addition to* commits, not be replaced by them —
   but it was never a substitute for the thing that lets two sessions see
   each other's work, and now it doesn't have to be.
4. If you know another session might be working in parallel, say so in
   your commit messages and check `git log` more often, not less.

**Ending a session:**
5. Commit everything real and working, with a message that would let a
   completely different session understand what changed and why without
   re-reading the diff — matching the standard this codebase's own
   `lib/version.js` changelog entries already set.
6. If you're handing off via a zip export (still likely, given these
   sessions don't share a live filesystem) — export the `.git` directory
   *with* the code, not just the working tree. A zip with no `.git` folder
   recreates exactly the problem this file exists to fix.

## What this doesn't solve

- **Two sessions running at the literal same time, both committing,** still
  need one of them to `git pull`/rebase before the other can push cleanly —
  that's normal git, not a NEXUS-specific gap. If concurrent sessions
  become common, a real shared remote (not just passing `.git` folders
  around in zips) is the next real step, not more process on top of this one.
- **A session that doesn't read this file.** The tooling exists now; the
  discipline of checking it still depends on whoever's running the session.
