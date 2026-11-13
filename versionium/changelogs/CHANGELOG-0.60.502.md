# 0.60.502 — Emerge gets a clock and a file check, natively (CIE13 slice a)

James, 2026-11-13: "Working on it in another session. Maybe you can work on finishing emerge. So we can stop using JavaScript"

## Found
Emerge had no clock, interpreted or native, and no native way to ask whether a path exists. Any Emerge port of a JavaScript module that
times a step, waits, or looks for a file stopped there. CIE13 (Process, Clock and File from the kernel) is the phase the rest of the
JavaScript removal names as its blocker: COS's manager in Emerge, the tests that start processes, the desktop driver.

## Built
- Three builtins of emerge.exe, by Linux syscalls directly (no libc), in `lang/native/rt.eg`:
  - `now_ms()`: whole milliseconds since 1970 (clock_gettime);
  - `sleep_ms(n)`: waits n milliseconds (nanosleep); refuses anything but a whole count, 0 or more;
  - `path_exists(p)`: true or false (access).
- The interpreter has the same three (`lang/runtime.js`; `path_exists` was there already), so a program answers the same both ways.
- The compiler's check environment regenerated (`native/check_env_text.eg`), and the native compiler rebuilt (`native/bin/emerge`).

## Proof
- The compiler at a fixpoint: built by the interpreter, by itself, and by that copy, the three are byte-identical.
- `lang/test/native.test.js` 112/112, with 3 new cases (the clock; path_exists; sleep_ms refusing -1), each compared with the interpreter.
- Emerge's own suites green: 31, 14 and 6.

## Not yet (CIE13, next slices)
- `list_dir`, `make_dir`, `remove_path` and `move_path` natively: the interpreter has them, the native runtime does not.
- Process (spawn, wait, kill), timers and watching a folder.
- Windows (CIE12).

## JavaScript, said
Five lines were added to JavaScript that already exists and is to be retired: two builtins in the interpreter (`runtime.js`), and three
cases in `native.test.js`. No new JavaScript file.
