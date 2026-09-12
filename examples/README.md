# Examples

Two self-contained applications that install `triiiceratops` **from npm** and
render a viewer. They are not part of the pnpm workspace, are not wired into CI,
and are not linked from the docs — they exist so a real install can be driven by
hand.

| Example           | Stack                                             |
| :---------------- | :------------------------------------------------ |
| [`react/`](react) | React 19 + Vite, real JSX, `@vitejs/plugin-react` |
| [`vue/`](vue)     | Vue 3.5 + Vite, real SFCs, `@vitejs/plugin-vue`   |

## Running one

Each directory is independent. Copy it anywhere, then:

```bash
npm install && npm run dev      # or pnpm / yarn / bun
```

No lockfile is committed and no `file:`, `workspace:`, or `link:` specifier is
used, so any package manager resolves these from the registry. `npm run check`
runs `tsc` if you want the type-check on its own.

## What these cover that the packed-consumer suite does not

`pnpm test:packed` installs the tarball with `file:` — it proves tarball
_contents_, not registry _resolution_. And its React fixture is authored with
`createElement` and no plugins, so the JSX toolchain is unexercised there. These
two apps cover exactly those gaps:

1. A real registry install, resolving the published `exports` map.
2. `@vitejs/plugin-react` with real JSX (the Vue fixture already uses
   `@vitejs/plugin-vue` with real SFCs, so Vue is covered either way).

They are deliberately **not** proof that Svelte stays out of a React or Vue app —
an example app would pass just as happily with `svelte` installed. That claim is
held by `check:dts-svelte-types` and by `assertNoSvelteAndNoSdk` in the packed
suite, which assert the absence mechanically. Neither example installs Svelte,
and neither needs to.

## The version range

Both apps depend on `"triiiceratops": "^1.0.0"`. No lockfile is committed, so
every fresh install resolves the newest 1.x from the registry — which is the
point, since what these prove is that a current release resolves through its
published `exports` map.

The caret rather than a floating `latest` is deliberate. These lines are also the
dependency a reader copies into their own project, so they should state the
compatibility contract; `latest` states nothing and would carry an example across
a major release with no signal. Replace it with an exact version if you would
rather pin hard.
