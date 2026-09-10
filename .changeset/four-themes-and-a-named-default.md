---
'triiiceratops': minor
---

Four themes ship, and a viewer with no `theme` now paints `light`.

The stylesheet had a fifth palette that nothing could name. `themes.css` carried a
`prefers-color-scheme: dark` block that survived the removal of Tailwind and daisyUI
still holding daisyUI's indigo primary and cooler neutral, and its light half had
drifted from `[data-theme="light"]` by a button radius. Because no name selected it,
nothing rendered it deliberately, the theming reference never documented it, and
`check-contrast.ts` — which walks the four named themes — never measured its contrast.

So the block is gone and the defaults block is now `light`'s own values, token for
token, with `theme/defaults.test.ts` holding the two together and asserting the
stylesheet declares exactly the themes `BUILTIN_THEMES` names.

**What changes for a deployment:** a viewer that sets no `theme` used to follow the
reader's `prefers-color-scheme` — and, in dark, to paint a palette nobody designed.
It now paints `light` whatever the reader prefers. Which scheme a reader sees is the
host page's decision rather than the component's: a component that turned dark inside
a light page overrules the page it sits in, and a media query has no answer while a
host prerenders. Following the reader stays one line where a page wants it:

```svelte
<TriiiceratopsViewer manifestId="…" theme={prefersDark.current ? 'dark' : 'light'} />
```

A deployment that named a theme, or that sets its own tokens through `themeConfig` or
CSS variables, is unaffected.
