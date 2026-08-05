# interaction-lab

Interaction and animation experiments — UI motion, gestures, view transitions, canvas and SVG work — as Storybook stories.

Everything lives in `lab/`. The lab _is_ this package; `packages/` holds the three small things it depends on.

The toolchain experiments that used to share this repo are now in [monorepo-tooling-lab](https://github.com/lennondotw/monorepo-tooling-lab), and the app scaffolds in [webapp-factory](https://github.com/lennondotw/webapp-factory).

## Layout

|                        |                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `lab/`                 | The Storybook workspace — 169 stories across animations, components, demos, and SVG playgrounds.      |
| `packages/utils`       | `cn()` and friends.                                                                                   |
| `packages/tailwindcss` | The shared stylesheet Tailwind resolves against.                                                      |
| `packages/tsconfig`    | Shared `tsconfig` bases.                                                                              |
| `archive/`             | Frozen investigation write-ups and probes. Outside every tsconfig, kept runnable rather than current. |

## Toolchain

pnpm workspace with a strict catalog, Vite 8, React 19, Storybook 10, vitest, `tsgo` for typechecking via project references, and the oxc family for lint and format.

```sh
pnpm install

pnpm lint              # syntax only, instant
pnpm lint:type-aware   # adds the tsgolint semantic rules
pnpm format            # oxfmt --write
pnpm format:check
pnpm tsc:build:packages
pnpm test:packages
```

### What the move to oxc gave up

oxlint replaced eslint and oxfmt replaced prettier. The format side is a clean swap. The lint side is not, and this is the record of what stopped being checked, so it can be picked back up when oxlint's coverage catches up:

- **`eslint-plugin-react-hooks` 7.x** — `refs`, `set-state-in-effect`, `use-memo`, `purity` have no oxlint equivalent. These were not idle: `refs` is what found a `useMemo` reading a ref it could not depend on, and a props snapshot written during render that an rAF loop was already painting.
- **`react-hooks/exhaustive-deps`** — oxlint ships a rule by that name and it is enabled here, but it is not equivalent. With the eleven suppressions in this repo removed, it reports nothing at any of them.
- **`eslint-plugin-react-refresh`**, **`eslint-plugin-storybook`**, **`eslint-plugin-mdx`** — no equivalents. The two `.mdx` files are no longer linted.
- **typescript-eslint's `strictTypeChecked` / `stylisticTypeChecked` tiers** — replaced by oxlint's default TypeScript set plus five explicitly enabled type-aware rules. tsgolint implements 59 of the 61 targeted rules, but oxlint enables few by default, so the effective set is narrower than the tiers were.

The `eslint-disable` comments for rules in that list are inert now. They are kept because they explain _why_ a dependency array is deliberately incomplete, or a ref is read where it is — worth knowing regardless of which linter is running.

`jsx-a11y` and `vitest` are available and switched off. eslint was not running them either, so turning them on belongs in its own change. They currently report two missing `alt` attributes, two click handlers with no keyboard equivalent, six tests with no assertions, and four `expect` calls taking an extra argument.

### Why TypeScript is on 6.x

TS 7 moved the compiler into platform binaries and stopped shipping `lib/typescript.js`, so anything doing `import ts from 'typescript'` breaks. Removing typescript-eslint cleared the original reason for the pin, but Storybook's docgen path — `@storybook/react-vite` → `react-docgen-typescript` and `@joshwooding/vite-plugin-react-docgen-typescript` — consumes the package too, so the constraint outlived eslint.

The typecheck itself runs on `tsgo` from `@typescript/native-preview`, a separate native binary, and is unaffected. webapp-factory, which has no Storybook, runs TS 7.0.2 with its own native `tsc` and no `native-preview` at all.
