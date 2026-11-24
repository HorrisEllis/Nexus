# 0.60.645: the end state first

James, 2026-11-23: "Every step can be broken down using end state first and a dag." · "The 3b, I approve" · "Yes, record from code" · "yes dynamic chunking ... injecting things up stream, nexus has the tools" · "Using schemas, templates, and schematics or specs. For reusable structure. That's one thing nexus was supposed to be doing."

Before a phase can be built it needs its end state: examples of what its functions return. None of the 289 phases Nexus could build had any, so the builder could take none of them.

The COS builder can now write them with the small model (qwen2.5-coder 3b):
- The model writes only the calls. Where the code already exists, Nexus runs it and records what it really returns.
- Every answer is saved to disk before it is checked.
- A call that keeps failing splits into its arguments, one piece each.
- An argument that has a schema gets a template made from that schema, and the model fills only the holes. Any of 77 of Nexus's 79 schemas can make one.

Result: on the walker phase, 0 of 25 tries passed without a template and 2 of 2 passed on the first try with one. Two of the three test phases now have their examples, waiting for James's approval.

Not yet: the screen to approve examples; templates for Emerge code.
