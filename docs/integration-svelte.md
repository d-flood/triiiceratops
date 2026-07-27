---
icon: lucide/component
---

# Svelte integration

Triiiceratops' core package (`triiiceratops`) ships the viewer as a **source-
distributed Svelte 5 component**. Your application compiles it inside its own
Svelte runtime, so it tree-shakes normally and never bundles a second copy of
Svelte. The package is bundler-neutral (no reliance on `import.meta.env`
replacement) and SSR-safe (see the [SvelteKit guide](integration-sveltekit.md)).

## Install

```bash
pnpm add triiiceratops
```

You do not need to install `openseadragon` or `manifesto.js` separately — they
are core's own runtime dependencies.

## Render the viewer

Import the component and the stylesheet once, then mount it in a container that
has a height:

```svelte
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops';
    // Import the design tokens + themes exactly once, anywhere in your app.
    import 'triiiceratops/style.css';
</script>

<div style="height: 600px;">
    <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
</div>
```

!!! important "The stylesheet is an explicit import"

    Importing the component adds **no** global CSS side effects. Styling comes
    from the one `import 'triiiceratops/style.css'`. Every rule in that
    stylesheet is scoped to the viewer root, so it cannot restyle your host page.

## In-memory manifests and custom search

Svelte hosts can pass manifest JSON directly instead of a URL, and feed search
results from local state, SQLite, or an app service via `searchProvider`:

```svelte
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops';
    import 'triiiceratops/style.css';

    const manifestJson = {
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: [],
    };
</script>

<div style="height: 600px;">
    <TriiiceratopsViewer manifestId="urn:example:manifest" {manifestJson} />
</div>
```

The `SearchProvider` and `SearchResultGroup` types are exported from the package
for typed custom providers:

```ts
import type { SearchProvider } from 'triiiceratops';

// A SearchProvider is a function: (query, context) => Promise<SearchResultGroup[]>.
const searchProvider: SearchProvider = async (query, _context) => {
    // Return grouped hits from your own data source.
    return [];
};
```

## Activating plugins

First-party plugins are separate scoped packages; pass their factories to the
`plugins` prop:

```ts
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExport = createPdfExportPlugin({
    coverSheet: { title: 'Export', fields: [] },
});

// <TriiiceratopsViewer manifestId="..." plugins={[ImageManipulationPlugin, pdfExport]} />
const plugins = [ImageManipulationPlugin, pdfExport];
```

See the [plugins guide](plugins.md) for each plugin's configuration and the
[plugin authoring guide](plugin-authoring.md) to write your own.

## Theming

Pick a built-in theme, or override tokens with the typed `themeConfig` prop:

```ts
import type { ThemeConfig } from 'triiiceratops';

const customTheme: ThemeConfig = {
    primary: '#0ea5e9',
    panelBg: '#0f172a',
    radiusBox: '1rem',
};
// <TriiiceratopsViewer manifestId="..." theme="light" themeConfig={customTheme} />
```

The full token surface is in the [theming guide](theming.md).

## Verified against the packed package

This integration is exercised in CI by the `svelte-vite` packed-consumer
fixture: a clean Vite + Svelte app that installs the real `triiiceratops`
tarball, imports the component and `triiiceratops/style.css`, and asserts the
viewer mounts, paints its first canvas, and is styled by the stylesheet export.
