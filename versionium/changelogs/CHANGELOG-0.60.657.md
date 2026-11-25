# 0.60.657: a piece is "passed" only when it does its job

James, 2026-11-25: "Passed but useful?" · "Okay you need to be checking. And then it needs to be checking its own work. Compiler is supposed to debug its own code. Or raids comparison engine, reflection engine, or what ever we can for that."

Found on the 3b proof run: "5 of 5 pieces passed" meant only that Emerge's compiler accepted them. served_by was rewritten 16 times, compiled every time, and was wrong every time. Nexus already had the check (EMB8: each piece run in Emerge against its own examples, refused with what it gave against what its contract says), but it never ran for EMB10: it took its examples only from an end-state record the phase did not have.

- **Each piece's contract comes from its phase's own examples** when there is no end-state record; the rung's gate then runs it in Emerge and refuses a wrong body with the exact cases ("served_by(...) gave false, want true").
- **The gate writes Emerge literals, not JSON**: a brace in a string is escaped (Emerge reads { as interpolation, so every EMB10 example with JSON text failed to parse and a correct body would have been refused), maps and lists are Emerge's; an expected value like { text: "", done: true } is read as a literal.

Checked: replaying the gate on a correct EMB10 module, 14 of 14 examples hold; on the 3b's served_by, refused with its two wrong cases. The rung's tests 14 of 14, the contract gates' tests 20 of 20. Next: the 3b-alone proof run again.
