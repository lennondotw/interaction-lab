# Chat history list

A virtualised chat list that can jump to any message in a long history and return to the latest
message at any time. It is being built bottom-up; this document covers only what exists so far.

| Path                                           | Contents                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| [`virtual-core/`](./virtual-core/)             | The headless size model, its tests, its story, and its docs.     |
| [`anchor/`](./anchor/)                         | Reading-position anchoring over the core's layout.               |
| [`virtual-core/debug/`](./virtual-core/debug/) | The story's wireframe playground, minimap, and state panel.      |
| [`seeded-random.ts`](./seeded-random.ts)       | Deterministic random numbers shared by tests and the playground. |

## Documentation

| Topic                                                        | Scope                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Virtual core size model](./virtual-core/docs/size-model.md) | What the core owns, its deliberate boundaries, viewport and overscan, decisions.                   |
| [Playground story](./virtual-core/docs/playground.md)        | The wireframe story: rendering outside React, painters, size-update flashes, directional overscan. |
| [Anchoring](./anchor/docs/anchoring.md)                      | Reference line and anchor point, candidates, rules for callers, the core-positions decision.       |
| [Minimap](./virtual-core/docs/minimap.md)                    | Defined view behaviour, the fitting decision, and the view, scene and renderer layers.             |
| [Tests](./virtual-core/docs/testing.md)                      | The simulated browser and what each test file covers.                                              |
