# Agent notes

## No defensive fallbacks

Validate untrusted data where it enters the system. Inside a module, trust the types.

When the code relies on a structural invariant, such as `viewport.firstElementChild!`, keep the assertion so a violation fails loudly. Do not replace it with `?? 0`, an `instanceof` skip, or an early return that silently changes behavior.

Use `?.` and `??` only for genuinely optional options or state.

## Experiment first

Browser behavior is not something to reason out from memory. Before concluding that something is a bug, or before fixing it, reproduce it with a probe or a test in a real browser.

When a check fails, run it against the base commit too. Only a failure that is new on your branch is a regression you caused.
