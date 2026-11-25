# 0.60.660: the piece's own sentence really reaches the 3b

James, 2026-11-25: "Okay you need to be checking."

Checked, and 0.60.659 did not do what it said: on run 9d326b0d the 3b's prompt for served_by held its examples and its refusals but not its sentence ("names the model's file"). The plan gives every function the whole phase paragraph as its description, so the "only when empty" fallback never fired. Now a function's own sentence from its phase always replaces it. It reaches the 3b as the comment above the function in "the module so far", and gaps.eg orders the functions by these sentences (the whole paragraph named every function in every one).
