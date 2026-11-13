# 0.60.510 — folders natively; Emerge reports 6 primitives not native, down from 10 (CIE13 slice b)

James, 2026-11-13: "Continue. Look a the graph substrate. Like emerge should reduce friction between primitives.   It’s meant to be self
aware." · told the next step was the four folder builtins off Emerge's own list: "Yeah."

## Built
Five builtins of emerge.exe, by Linux syscalls directly (no libc), in `lang/native/rt.eg`:
- `is_dir(p)`: a folder or not (stat); a path not there is not a folder.
- `make_dir(p)`: the folder, and every folder on the way to it (mkdir).
- `list_dir(p)`: its names, in byte order (getdents64); a folder not there is `[]`.
- `move_path(a, b)`: moved (rename); the folder it goes to is made first.
- `remove_path(p)`: removed, all the way down (unlink, rmdir); a path not there is no error; a link is removed, not followed.

The interpreter already had all five. The compiler's check environment and runtime text were regenerated, and `native/bin/emerge` rebuilt.

## Found by Emerge's map of itself
`is_dir` was added to the interpreter by the other session the same day, and the check environment was not regenerated, so the native
compiler did not know the name. Once regenerated, `eg run lang/self.eg` listed it as not native; it is native now.

## Emerge, by its own count
122 primitives; 115 run interpreted and native; 6 only interpreted: `wrap_add`, `wrap_sub`, `wrap_mul`, `ledger_proof`,
`ledger_check_proof`, `observe_gaps`.

## Proof
- One program of 17 lines (make three levels, write files, list, move, remove, remove again): the same output interpreted and native.
  It is a case in `lang/test/native.test.js`.
- The compiler at a fixpoint: built by the interpreter, by itself, and by that copy, byte-identical.
- `lang/cie/test/self.test.eg` 3/3, its ratchet lowered from 10 to 6.

## Differences, said
- Natively these do not add a ledger entry; the interpreter's make_dir, move_path and remove_path do (as with write_file natively).
- `list_dir` sorts by bytes natively and by UTF-16 units interpreted: the same for every name without characters past U+FFFF.

## JavaScript, said
One case added to `native.test.js`. No other JavaScript touched.
