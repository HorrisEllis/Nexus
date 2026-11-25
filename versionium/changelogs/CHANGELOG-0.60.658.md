# 0.60.658: the 3b is told how Emerge's contains works; helpers named after Emerge's words are refused

James, 2026-11-25: "it needs to be checking its own work. Compiler is supposed to debug its own code."

On the 3b-alone run of EMB10 (e2721c42), with each piece now checked against its own examples (0.60.657), served_by was refused honestly and the 3b broke it down into helpers: is_member, contains, is_element, hasElement, includes. Every one was held, for one reason in the compiler's own words: `expected "(" to open the parameter list, found "contains"`. The 3b wrote contains as a call and as a function name; in Emerge it is a word between two values. Nothing told it so, and the hint table even listed starts_with and ends_with as builtins to call.

In Emerge (idearium/lib/gaps.eg):
- **The hint table** answers that refusal: contains, starts_with and ends_with are words between two values (`models contains file`), never calls or names. The row that listed them as builtins to call is corrected.
- **A helper named after one of Emerge's own words** (contains, and, if, return, ...) is never linked in: no function can carry that name, so it could never be filled.

Checked: gaps.eg's Emerge tests 18 of 18, two new (a keyword helper is not linked; the contains refusal gets its fix). EMB10's earlier piece files are kept, renamed, and the next proof run starts the phase fresh.
