# interaction-lab

Interaction and animation experiments — UI motion, gestures, view transitions, canvas and SVG work — as Storybook stories.

Everything lives in `lab/`. The lab _is_ this package; `packages/` holds the three small things it depends on.

The toolchain experiments that used to share this repo are now in [monorepo-tooling-lab](https://github.com/lennondotw/monorepo-tooling-lab), and the app scaffolds in [webapp-factory](https://github.com/lennondotw/webapp-factory).

## Layout

|                        |                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `lab/`                 | The Storybook workspace — 222 stories in five sections, below.                                        |
| `packages/utils`       | `cn()` and friends.                                                                                   |
| `packages/tailwindcss` | The shared stylesheet Tailwind resolves against.                                                      |
| `packages/tsconfig`    | Shared `tsconfig` bases.                                                                              |
| `archive/`             | Frozen investigation write-ups and probes. Outside every tsconfig, kept runnable rather than current. |

### The five sections of `lab/src`

|                | What earns a place                                                                         |
| -------------- | ------------------------------------------------------------------------------------------ |
| `components/`  | Something else would build with it — primitives, and the ones with a state machine.        |
| `scenes/`      | It needs the whole viewport and the page's scroll to exist at all.                         |
| `studies/`     | It exists to answer a question, and puts the answer on the screen next to the subject.     |
| `instruments/` | It is what you look at the other stories _with_ — the FPS readout, the scope, the console. |
| `templates/`   | The file you copy to start a new story.                                                    |

`studies/` and `scenes/` may import `components/`, never the other way round. That
direction is the whole reason the sections exist rather than being a filing
preference: a component that imports a study has its dependency backwards, since
the study is the thing that is about the component. `lab/src/docs` carries the
longer version, alongside the conventions for writing a story.

## Deployment

GitHub Actions deploys the `storybook-static` artifact from the same workflow run
to Cloudflare Workers after lint, typechecking, tests, and the Storybook build pass.
Pushes to `main` publish production at <https://lab.lennon.sh>. Other branch pushes
upload a version with a stable preview alias, without changing production. Preview
links appear in the deployment job summary and GitHub environment, and require
Cloudflare Access sign-in. Pull request events run validation without deploying;
fork pull requests never receive deployment credentials.

`wrangler.jsonc` defines static assets and SPA fallback. The custom domain and
preview-only Access policy are managed in the Cloudflare dashboard. Keep Access
enabled before enabling preview URLs; the CI token cannot manage Access or DNS.
Workers Builds is not connected, so GitHub Actions is the only automatic publisher.

Repository secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token
is stored in 1Password's Personal vault as
**Cloudflare · interaction-lab · GitHub Actions Deploy**, with scope and rotation
instructions. It grants Workers Scripts Edit on the personal Cloudflare account.

The former Pages project `interaction-lab` at `demos-storybook.pages.dev` is kept
as a migration rollback reference, with automatic builds disabled after cutover.
To roll back a Workers release, select the previous active production version in
Cloudflare Deployments; do not promote an arbitrary branch preview.

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

`jsx-a11y` and `vitest` are on. Turning them on surfaced 31 findings that eslint had never looked for; roughly half were real and are fixed, the rest were the rules mismatching this code and carry a reason at the site:

- The three split-panel dividers are draggable splitters. `role="separator"` is right for that (WAI-ARIA's window-splitter pattern) and `<hr>` cannot be dragged, so `prefer-tag-over-role` is suppressed there — but `control-has-associated-label` had a point, and they now have accessible names.
- `vitest/valid-expect` reports every `expect(actual, message)` call. vitest's `expect` extends Chai's, which takes a message second argument; the rule applies jest's single-argument constraint.
- `vitest/expect-expect` did not recognise a local `expectPoint()` helper. Configured via `assertFunctionNames` rather than suppressed.
- Two clickable divs became keyboard-operable. Neither could become a `<button>` — one holds a `<style>` element and nested divs, which are not valid button content; the other is a demo _of_ box-model behaviour, so a button's own display and intrinsic sizing would be the thing under test.

### Why TypeScript is on 6.x

TS 7 moved the compiler into platform binaries and stopped shipping `lib/typescript.js`, so anything doing `import ts from 'typescript'` breaks. Removing typescript-eslint cleared the original reason for the pin, but Storybook's docgen path — `@storybook/react-vite` → `react-docgen-typescript` and `@joshwooding/vite-plugin-react-docgen-typescript` — consumes the package too, so the constraint outlived eslint.

The typecheck itself runs on `tsgo` from `@typescript/native-preview`, a separate native binary, and is unaffected. webapp-factory, which has no Storybook, runs TS 7.0.2 with its own native `tsc` and no `native-preview` at all.
