---
icon: lucide/code-xml
---

# Web Component integration

Triiiceratops ships the viewer as a standards-based custom element,
`<triiiceratops-viewer>`, in two forms:

- **ESM registration** (`triiiceratops/element/register`) for projects with a
  bundler (Vite, webpack, Rollup, …).
- **Self-contained IIFE** (`triiiceratops/element`) for no-bundler pages loaded
  from a `<script>` tag.

Both register the **same tag** and expose the same properties, methods, events,
styles, and content-state behavior. Styles and themes are installed **inside the
element's shadow root** — there is no separate element stylesheet to import.

## ESM (with a bundler)

Install core and import the registration entry once; it defines the element as a
side effect:

```bash
pnpm add triiiceratops
```

```ts
// Registers <triiiceratops-viewer> as a side effect.
import 'triiiceratops/element/register';

// Complex values (objects, arrays) are set as JS properties, not attributes.
const el = document.querySelector('triiiceratops-viewer');
if (el) {
    (el as any).manifestId = 'https://example.org/manifest.json';
}
```

```html
<triiiceratops-viewer
    manifest-id="https://example.org/manifest.json"
></triiiceratops-viewer>

<style>
    triiiceratops-viewer {
        display: block;
        width: 100%;
        height: 600px;
    }
</style>
```

## No-bundler (IIFE / script tag)

Load the self-contained IIFE from a CDN or a copied file. It bundles the element,
the Svelte runtime, OpenSeadragon, and all styles:

```html
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

<triiiceratops-viewer
    manifest-id="https://example.org/manifest.json"
></triiiceratops-viewer>

<style>
    triiiceratops-viewer {
        display: block;
        width: 100%;
        height: 100vh;
    }
</style>
```

To pass in-memory manifest JSON, set it as a property after the element upgrades:

```html
<triiiceratops-viewer id="viewer"></triiiceratops-viewer>
<script>
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.getElementById('viewer');
        viewer.manifestJson = {
            id: 'urn:example:manifest',
            type: 'Manifest',
            label: { none: ['Local manifest'] },
            items: [],
        };
    });
</script>
```

## Duplicate and conflicting registration

- Loading the **same** core version twice is a harmless no-op.
- Loading a **different** core version alongside one already registered leaves
  the first registration and custom element untouched and reports an actionable
  conflict error. Side-by-side multi-version loading on one page is not
  supported.

## Activating plugins

Plugins are their own scoped packages. In the browser they register a factory
into the shared, order-independent `window.Triiiceratops.plugins` registry;
activation is an explicit, per-viewer step. See the
[migration guide](migration-1.0.md#2-browser-globals-and-explicit-activation-the-one-structural-change)
for the full before/after and the [plugins guide](plugins.md) for each plugin.

```html
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
<script src="https://unpkg.com/@triiiceratops/plugin-image-manipulation/dist/iife.js"></script>

<triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>

<script>
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');
        const plugin = window.Triiiceratops.plugins.get(
            '@triiiceratops/plugin-image-manipulation',
        );
        viewer.plugins = [plugin];
    });
</script>
```

## Content Security Policy

The runtime supports a strict CSP without `unsafe-eval`, including a style nonce
and constructable-stylesheet fallbacks. See the [CSP recipe](csp.md).

## Verified against the packed package

CI runs `wc-esm` (bundler registration) and `plain-html-iife` (script tag)
packed-consumer fixtures, plus `plugin-image-manip-iife` which loads core and a
plugin IIFE in **both** script orders and activates through
`window.Triiiceratops.plugins`.
