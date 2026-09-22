# scripts

Checks that need a browser and a running app, so they cannot be unit tests.

Unlike `archive/`, these are meant to be kept current: they run against whatever
the lab is today rather than recording what it was on one afternoon.

| Script              | What it answers                                                |
| ------------------- | -------------------------------------------------------------- |
| `smoke-stories.mjs` | Does every story still mount, paint something, and stay quiet? |

```sh
pnpm --filter @monorepo/lab dev        # in one terminal
pnpm smoke:stories                     # in another
pnpm smoke:stories -- --filter studies/ # a subset, matched against the story id
```

`STORYBOOK_URL` overrides the port. Exit code is 1 if anything failed, so a branch
can be gated on it.

They are not in CI. `smoke-stories` is minutes for 230-odd stories, and its answer
only changes when a component does — so it belongs before a refactor lands, not on
every push. It is what caught the two React warnings fixed alongside it, neither of
which the build or the unit tests could see.

`research/chat-inertia-repro.mjs` and `research/chat-inertia-stop.mjs` are manual research probes,
not pass/fail CI checks. See the [inertia research note](../lab/src/components/chat-scroll-container/docs/inertia-research.md)
for commands, platform limits, and the recorded observations. Generated evidence goes to ignored
`artifacts/research/` by default.

`research/ios-inertia-collector.mjs` and `research/ios-inertia-harness.html` provide the corresponding
Safari/simulator experiment surface. See the [iOS experiment procedure](../lab/src/components/chat-scroll-container/docs/inertia-ios-experiments.md)
for native gesture sequences, intervention variants, and the numeric snapshot.

`node scripts/test-chat-touch-takeover.mjs` covers touch/mouse/pen policies, cancelable native-inertia takeover, and real Chromium flings. It runs in the local full chat suite, not the CI subset.

`node scripts/test-chat-wheel-stability.mjs` checks full upward movement, no reversal, and no programmatic
position writes during idle scrolling across three chat stories. It exercises wheel and browser smooth-scroll
continuation separately, without claiming physical-hardware replay. Use `STORYBOOK_URL` to select a running
Storybook. Frame evidence is saved to `/tmp/chat-wheel-stability.json` and collected by the local full suite;
the CI subset is unchanged.
