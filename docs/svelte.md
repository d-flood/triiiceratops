---
icon: simple/svelte
description: "Use Triiiceratops in Svelte 5 as a native component \u2014 no custom element and no wrapper layer, source-distributed and driven by runes."
---

# Svelte

`triiiceratops/svelte` is the **native** Svelte 5 component — no custom element,
no wrapper layer. Core ships the viewer as a source-distributed component, so
your application compiles it inside its own Svelte runtime: it tree-shakes
normally and never bundles a second copy of Svelte.

This is also the only entry point that needs the optional `svelte` peer
installed. It is a superset of the root entry — everything `triiiceratops`
exports is re-exported here, so a Svelte app imports from this one specifier and
nothing else.

## Install

=== "pnpm"

    ```bash
    pnpm add triiiceratops svelte
    ```

=== "npm"

    ```bash
    npm install triiiceratops svelte
    ```

=== "bun"

    ```bash
    bun add triiiceratops svelte
    ```

## Your first viewer

```html
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    // Import the design tokens + themes exactly once, anywhere in your app.
    import 'triiiceratops/style.css';
</script>

<!-- The container must have a height; the viewer fills it. -->
<div style="height: 600px;">
    <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
</div>
```

!!! important "The stylesheet is an explicit import"

    Importing the component adds **no** global CSS side effects. Styling comes
    from the one `import 'triiiceratops/style.css'`. Every rule in that
    stylesheet is scoped to the viewer root, so it cannot restyle your host page.

!!! note "Works in SvelteKit out of the box"

    Bundler-neutral (no `import.meta.env` reliance) and SSR-safe — core
    server-renders cleanly and initializes the browser-only image renderer
    only on the client, so it hydrates without mismatch warnings. You do **not**
    need `export const ssr = false` or a browser-only guard. Import the
    stylesheet once in your root `+layout.svelte`.

## Reading and commanding state

Svelte needs no handle abstraction and no selector API. `ViewerState` is a rune
class, so its members are already reactive: read them in your markup or in a
`$derived` and Svelte tracks the dependency for you. There are two ways to get
the instance.

**`bind:viewerState`** — when the state belongs to this component:

```html
<script lang="ts">
    import { TriiiceratopsViewer, type ViewerState } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';

    let viewerState = $state<ViewerState | undefined>();

    // Reactive: recomputes when the viewer navigates.
    const canvasId = $derived(viewerState?.canvasId ?? 'No canvas yet');
</script>

<p>{canvasId}</p>
<button onclick={() => viewerState?.nextCanvas()}>Next canvas</button>

<div style="height: 600px;">
    <TriiiceratopsViewer
        bind:viewerState
        manifestId="https://example.org/manifest.json"
    />
</div>
```

**`getContext(VIEWER_STATE_KEY)`** — inside any descendant, with no prop
threading:

```html
<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from 'triiiceratops/svelte';

    const state = getContext<ViewerState>(VIEWER_STATE_KEY);
</script>

<span>{state.currentCanvasIndex + 1} / {state.sequenceCount}</span>
```

The component sets that context, so this is the same instance `bind:viewerState`
exposes — the one the plugin SDK and every other host read. `ViewerState` is
per-viewer: two viewers on a page are two independent instances.

!!! tip "`undefined` until the viewer mounts"

    `bind:viewerState` is populated when the component mounts its viewer, so the
    bound variable is `undefined` for the first tick. `$derived` plus `?.`, as
    above, is the whole pattern.

The framework-neutral [`triiiceratops/selectors`](configuration.md) runtime
exists for hosts that need memoized, equality-gated projections. Svelte's
reactivity already does that work, so you do not need it here.

## Props

| Prop | Type |
| :-- | :-- |
| `manifestId` | `string` |
| `canvasId` | `string` |
| `contentState` | `string` |
| `readContentStateFromUrl` | `boolean` (default `false`) |
| `manifestJson` | `Record<string, any>` |
| `theme` | `BuiltInTheme` |
| `themeConfig` | `ThemeConfig` |
| `config` | `ViewerConfig` |
| `initialCanvasRegion` | `CanvasRegion \| null` |
| `plugins` | `readonly SdkPlugin[]` |
| `searchProvider` | `SearchProvider \| null` |
| `viewerState` | `ViewerState` (bindable, read-only in practice) |
| `onpluginerror` | `(error: PluginError) => void` |
| `onviewererror` | `(error: ViewerError) => void` |

Plain Svelte props — objects and functions pass straight through, so none of the
attribute-versus-property care the custom element needs applies. `manifestId`
and `canvasId` are **uncontrolled**: one-way instructions to the viewer, not
enforced bindings. Re-asserting the current `canvasId` writes nothing, so your
markup never fights a user who navigated internally; read `viewerState` to
follow where the viewer actually is.

## Errors

The two callback props receive the same structured objects the custom element
dispatches as `pluginerror` and `viewererror` events:

```html
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
</script>

<TriiiceratopsViewer
    manifestId="https://example.org/manifest.json"
    onpluginerror={(error) => console.warn(error.pluginName, error.phase)}
    onviewererror={(error) => console.error(error.code, error.message)}
/>
```

`PluginError` carries a `retry()`, so a host can offer the user a second attempt
rather than only reporting the failure.

## Multiple manifests

`manifestsState` (and its `ManifestsState` class) is exported from this entry for
apps that coordinate several manifests — a collection browser, say — outside any
single viewer instance.

```ts
import { manifestsState } from 'triiiceratops/svelte';
```

## Live example

[The Svelte example](examples/svelte/) is a Vite + Svelte 5 application that
imports `triiiceratops/svelte` and `triiiceratops/style.css` from the published
package. It is published beside these pages and runs this release's bundles, so
what it does is what the version documented here does.

## Where to go next

Everything below is framework-neutral and has a **Svelte** tab on every example:

- [Configuration & state](configuration.md) — panels, layout, gallery, and the
  full `ViewerState` surface.
- [Theming](theming.md) — `theme`, `themeConfig`, and CSS variables.
- [Plugins](plugins.md) — the `plugins` prop, and
  [authoring](plugin-authoring.md) your own.
- [Content Security Policy](csp.md) — Svelte hosts use the light-DOM recipe,
  whose component styles are nonce-addressable.

## Verified against the packed package

CI runs packed-consumer fixtures across Chromium, Firefox, and WebKit:
`svelte-vite` (the native component under Vite) and `sveltekit-ssr`
(server-rendered, then hydrated, with no mismatch warnings). Every code sample on
this site is type-checked against those same tarballs.
