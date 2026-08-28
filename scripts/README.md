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
