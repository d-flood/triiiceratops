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

## The pinned version

Both apps depend on:

```json
"triiiceratops": "^1.0.0-rc.33"
```

**This must be a published version that contains the framework wrappers.** At the
time these were written the newest published version was `1.0.0-rc.32`, whose
`exports` map has no `./react` or `./vue` — the wrappers were still unreleased —
so `npm install` here will not resolve until a release carrying them is on npm.
Bump the range if the first such release is not `rc.33`.

The caret is deliberate: `^1.0.0-rc.33` resolves to that release, any later `rc`,
**and** `1.0.0` once it ships, so these do not need editing at general release.
Replace it with an exact version if you would rather pin hard.
