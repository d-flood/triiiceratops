---
icon: lucide/server
---

# SvelteKit integration (SSR)

The `triiiceratops` core package is **SSR-safe**: it imports cleanly on the
server, produces stable server output, lazily loads browser-only dependencies
(OpenSeadragon), and hydrates without mismatch warnings. It works in SvelteKit
without any special configuration beyond the normal Svelte usage.

Start from the [Svelte integration guide](integration-svelte.md); this page
covers only the SSR-specific concerns.

## Install

```bash
pnpm add triiiceratops
```

## Import the stylesheet in the root layout

Import the stylesheet once in `src/routes/+layout.svelte` (or your root layout)
so every route is styled:

```svelte
<script lang="ts">
    import 'triiiceratops/style.css';
    let { children } = $props();
</script>

{@render children()}
```

## Render the viewer

The component renders on a normal page. It server-renders its markup and defers
the WebGL/OpenSeadragon work until it is in the browser, so hydration completes
without diagnostics:

```svelte
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops';
</script>

<div style="height: 80vh;">
    <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
</div>
```

!!! note "No `ssr = false` needed"

    You do **not** need to disable SSR (`export const ssr = false`) or wrap the
    viewer in a browser-only guard. Core loads its browser-only dependencies
    lazily on mount, so the server render is safe and hydration is clean. Only
    reach for a browser guard if your own surrounding code is browser-only.

## Bundler-neutral

Core contains no `import.meta.env` replacement or other Vite-specific
environment assumptions, so SvelteKit's Vite pipeline (or any other bundler)
compiles it without extra plugins or `define` shims.

## Content state and routing

Reading the `iiif-content` URL parameter is **opt-in** and does not take over
your routing. Precedence is unchanged from the RC: discrete props win over a
content-state prop, which wins over the URL parameter. See the
[configuration guide](configuration.md) for content-state details.

## Verified against the packed package

CI runs a `sveltekit-ssr` packed-consumer fixture: a clean SvelteKit app
installs the real `triiiceratops` tarball, server-renders a route containing the
viewer, and asserts the server output is stable and the client hydrates without
mismatch warnings before the viewer becomes interactive.
