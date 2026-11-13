# 0.60.512 — Emerge starts, waits on and stops processes natively (CIE13 slice c)

James, 2026-11-13: "Maybe you can work on finishing emerge. So we can stop using JavaScript" · told process control was next, the piece
that lets COS's supervisor be written in Emerge: "Next."

## Built
Five builtins of emerge.exe, by Linux syscalls directly (fork, execve, wait4, kill, pipe2, dup2; no libc), in `lang/native/rt.eg`:
- `proc_run(cmd, args)` → `{ code, out }`: runs a command to its end and gives what it wrote to stdout.
- `proc_start(cmd, args)` → a process id. The child shares this program's output and environment.
- `proc_wait(pid)` → its exit code, or 128 + the signal that ended it.
- `proc_wait_ms(pid, ms)` → the same, waiting at most ms; `null` when it is still running.
- `proc_signal(pid, sig)` → true or false: 15 asks it to stop, 9 ends it.

A command with no `/` is looked for in the usual folders. One that cannot be started ends with code 127.

The interpreter has the same five (`lang/runtime.js`), so a program answers the same both ways.

## Proof
- One program, the same output interpreted and native, and a case in `lang/test/native.test.js`:
  - `echo`'s output read back; 138,894 bytes from `seq` read back whole;
  - exit codes 0, 3, 7, and 127 for a command that is not there;
  - a `sleep 30` still running after 150 ms (`null`), stopped with signal 15, its code 143.
- native.test 117/117; Emerge's suites 31, 14, 6; the compiler at a fixpoint (three builds byte-identical).
- Right on the first native run.

## CIE13, where it stands
Met: a native program spawns a child, reads its exit code, stops one that hangs; reads the clock and waits; makes, lists, moves and
removes folders. Not yet: watching a folder for changes, a timer that fires, the child's stderr captured, Windows (CIE12), and Pillar's
Process, Clock and File contracts (named as a prerequisite in the map; not written in pillar/contracts yet).

## Readings to confirm
The names and shapes of the five (`proc_run` returning `{ code, out }`, `proc_wait_ms` returning `null`) are the coder's.

## JavaScript, said
22 lines added to the interpreter (`lang/runtime.js`), which is to be retired (CIE11): it cannot wait on a child without giving up its
turn, so it reads the child's state from `/proc` (Linux only). Two cases added to `native.test.js`. No new JavaScript file.
