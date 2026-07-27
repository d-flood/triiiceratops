---
icon: lucide/arrow-right-left
---

# Migrating from the RC to 1.0

Triiiceratops 1.0 intentionally corrects a handful of prerelease (RC) contracts
before they become stable-for-life. These are **breaking changes**, applied as a
clean cut: there are **no runtime aliases, shims, or compatibility facades**. An
RC import, global, CSS token, theme name, or export that changed simply no longer
exists in 1.0.

This guide is an exact find-and-replace reference. There is no codemod — the
changes are mechanical, and every "old" string below is gone from the published
packages, so a project-wide search for it finds only your own call sites.

!!! info "What did not change"

    Viewer features, configuration props, IIIF behavior, annotation workflows,
    and the documented core viewer API are preserved. This migration is about
    **package names, browser globals, CSS token names, the `teal` identifier, the
    removed `bundle` export, and the LocalStorage namespace** — nothing else.

## Breaking changes at a glance

| Area                | RC (old)                                             | 1.0 (new)                                                  |
| :------------------ | :--------------------------------------------------- | :--------------------------------------------------------- |
| First-party plugins | `triiiceratops/plugins/*` subpath imports            | Scoped packages `@triiiceratops/plugin-*`                  |
| Browser plugins     | `window.TriiiceratopsPlugins.*` globals              | `window.Triiiceratops.plugins` registry + explicit activation |
| Runtime sharing     | `window.__TriiiceratopsSvelteRuntime`                | Removed — plugins no longer share core's Svelte runtime    |
| CSS variables       | Unnamespaced (`--color-primary`, `--viewer-bg`, …)   | `--tri-*` namespace                                        |
| Theme identifier    | `Teal`                                               | `teal`                                                     |
| Undocumented export | `triiiceratops/bundle`                               | Removed                                                    |
| Local annotations   | RC LocalStorage keys                                 | New `@triiiceratops/plugin-annotation-editor:v1` namespace |

Each is detailed below.

## 1. First-party plugin imports → scoped packages

Every first-party plugin now ships as its own independently versioned npm
package under the `@triiiceratops` scope. The `triiiceratops/plugins/*` subpaths
have been removed (importing one now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`).

Install the packages you use:

```bash
pnpm add @triiiceratops/plugin-image-manipulation
pnpm add @triiiceratops/plugin-image-download
pnpm add @triiiceratops/plugin-pdf-export
pnpm add @triiiceratops/plugin-annotation-editor
```

Then update every import:

| Old import path (RC)                                    | New package (1.0)                                    |
| :------------------------------------------------------ | :--------------------------------------------------- |
| `triiiceratops/plugins/image-manipulation`              | `@triiiceratops/plugin-image-manipulation`           |
| `triiiceratops/plugins/image-download`                  | `@triiiceratops/plugin-image-download`               |
| `triiiceratops/plugins/pdf-export`                      | `@triiiceratops/plugin-pdf-export`                   |
| `triiiceratops/plugins/annotation-editor`               | `@triiiceratops/plugin-annotation-editor`            |
| `triiiceratops/plugins/annotation-editor/testing`       | `@triiiceratops/plugin-annotation-editor/testing`    |

The exported symbol names are unchanged, so only the module specifier moves:

```ts
// example-ignore
// BEFORE (RC) — this subpath no longer exists:
import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';
```

```ts
// AFTER (1.0):
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExportPlugin = createPdfExportPlugin({ coverSheet: { fields: [] } });
viewer.plugins = [ImageManipulationPlugin, pdfExportPlugin];
```

Core no longer depends on `@annotorious/*` or `pdf-lib`; those live with the
annotation-editor and pdf-export packages respectively. A core-only install pays
for none of them.

## 2. Browser globals and explicit activation (the one structural change)

For no-bundler / script-tag pages this is the only change that alters *shape*,
not just a name. In the RC, each plugin IIFE attached a preconfigured object to
`window.TriiiceratopsPlugins`, and core exposed its Svelte runtime on
`window.__TriiiceratopsSvelteRuntime` for plugins to borrow.

In 1.0:

- There is **one** versioned namespace: `window.Triiiceratops`. Every core and
  plugin IIFE bootstraps it if absent, so scripts may load in any order.
- Plugin IIFEs **register a factory** into `window.Triiiceratops.plugins`;
  loading a script no longer activates anything.
- Activation is **explicit and per viewer**: you fetch the registered factory
  and assign it to a viewer's `plugins` property.
- `window.TriiiceratopsPlugins` and `window.__TriiiceratopsSvelteRuntime` are
  **removed**. Plugins run in the page's realm and receive the live `ViewerState`
  directly; they do not share core's Svelte runtime.

### Before (RC)

```html
<!-- BEFORE (RC): plugin object read straight off window.TriiiceratopsPlugins -->
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>

<triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>

<script>
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');
        viewer.plugins = [window.TriiiceratopsPlugins.ImageManipulation];
    });
</script>
```

### After (1.0)

```html
<!-- AFTER (1.0): register via the shared namespace, then activate explicitly.
     Script order does not matter — the registry is order-independent. -->
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
<script src="https://unpkg.com/@triiiceratops/plugin-image-manipulation/dist/iife.js"></script>

<triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>

<script>
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');
        // The plugin IIFE registered its factory into the shared registry;
        // activation is a separate, explicit step.
        const plugin = window.Triiiceratops.plugins.get(
            '@triiiceratops/plugin-image-manipulation',
        );
        viewer.plugins = [plugin];
    });
</script>
```

This exact before → after flow (in both script orders) is exercised end-to-end
against the packed tarballs by the `plugin-image-manip-iife` consumer fixture, so
the sample is guaranteed to run.

For bundler / ES-module hosts, activation is simply the imported factory — no
global is involved:

```ts
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

// Svelte:         <TriiiceratopsViewer plugins={[ImageManipulationPlugin]} />
// Web Component:  assign the imported factory directly.
viewer.plugins = [ImageManipulationPlugin];
```

See the [Web Component integration guide](integration-web-component.md) for the
full no-bundler recipe and the [plugin authoring guide](plugin-authoring.md) for
the SDK activation API.

## 3. CSS custom properties → `--tri-*` namespace

Every public design token moved into the `--tri-*` namespace so viewer tokens
cannot collide with a host application's own design system. The typed
`themeConfig` keys (`primary`, `viewerBg`, …) are **unchanged** — only the raw
CSS variable names moved, which affects you only if you set the variables
directly in CSS or via `cssVars`.

Internal variables (`--ui-*` layout plumbing, `--panel-surface`/`--panel-fg`,
component-local `--btn-*`/`--range-*`/etc.) were **not** promoted into the public
namespace and remain unstable implementation details.

Find-and-replace every public token:

| Old CSS variable (RC)         | New CSS variable (1.0)             |
| :---------------------------- | :--------------------------------- |
| `--color-primary`             | `--tri-color-primary`              |
| `--color-primary-content`     | `--tri-color-primary-content`      |
| `--color-primary-text`        | `--tri-color-primary-text`         |
| `--color-neutral`             | `--tri-color-neutral`              |
| `--color-neutral-content`     | `--tri-color-neutral-content`      |
| `--color-success`             | `--tri-color-success`              |
| `--color-success-content`     | `--tri-color-success-content`      |
| `--color-warning`             | `--tri-color-warning`              |
| `--color-warning-content`     | `--tri-color-warning-content`      |
| `--color-error`               | `--tri-color-error`                |
| `--color-error-content`       | `--tri-color-error-content`        |
| `--viewer-bg`                 | `--tri-viewer-bg`                  |
| `--toolbar-bg`                | `--tri-toolbar-bg`                 |
| `--panel-bg`                  | `--tri-panel-bg`                   |
| `--gallery-bg`                | `--tri-gallery-bg`                 |
| `--input-bg`                  | `--tri-input-bg`                   |
| `--surface-border`            | `--tri-surface-border`             |
| `--content`                   | `--tri-content`                    |
| `--panel-content`             | `--tri-panel-content`              |
| `--toolbar-content`           | `--tri-toolbar-content`            |
| `--viewer-content`            | `--tri-viewer-content`             |
| `--gallery-content`           | `--tri-gallery-content`            |
| `--metadata-panel-bg`         | `--tri-metadata-panel-bg`          |
| `--metadata-panel-content`    | `--tri-metadata-panel-content`     |
| `--annotations-panel-bg`      | `--tri-annotations-panel-bg`       |
| `--annotations-panel-content` | `--tri-annotations-panel-content`  |
| `--search-panel-bg`           | `--tri-search-panel-bg`            |
| `--search-panel-content`      | `--tri-search-panel-content`       |
| `--structures-panel-bg`       | `--tri-structures-panel-bg`        |
| `--structures-panel-content`  | `--tri-structures-panel-content`   |
| `--collection-panel-bg`       | `--tri-collection-panel-bg`        |
| `--collection-panel-content`  | `--tri-collection-panel-content`   |
| `--radius-selector`           | `--tri-radius-selector`            |
| `--radius-buttons`            | `--tri-radius-buttons`             |
| `--radius-box`                | `--tri-radius-box`                 |
| `--radius-toolbar`            | `--tri-radius-toolbar`             |
| `--radius-panels`             | `--tri-radius-panels`              |
| `--radius-controls`           | `--tri-radius-controls`            |
| `--radius-controls-buttons`   | `--tri-radius-controls-buttons`    |
| `--size-selector`             | `--tri-size-selector`              |
| `--size-field`                | `--tri-size-field`                 |
| `--border`                    | `--tri-border`                     |
| `--depth`                     | `--tri-depth`                      |

The [theming guide](theming.md#complete-public-token-reference) carries the
authoritative, generated token reference. The `cssVars` escape hatch keys also
drop their leading `--` as before, but now use the `tri-` prefix (e.g.
`'tri-panel-bg'`).

## 4. Theme identifier `Teal` → `teal`

The built-in theme identifier is now lowercase, matching `light`, `dark`, and
`dracula`. There is no `Teal` alias.

```html
<!-- BEFORE: theme="Teal" -->
<triiiceratops-viewer manifest-id="..." theme="teal"></triiiceratops-viewer>
```

Update the `theme` prop/attribute and any `data-theme="Teal"` selectors to
`teal`.

## 5. Removed `triiiceratops/bundle` export

The undocumented `triiiceratops/bundle` export has been removed with no
replacement. If you imported it, switch to the documented entries:
`triiiceratops` (the Svelte component), `triiiceratops/element` (the
self-contained Web Component IIFE), or `triiiceratops/element/register` (the ESM
custom-element registration). See the
[Web Component guide](integration-web-component.md).

## 6. LocalStorage annotations: RC data is disposable

The 1.0 `LocalStorageAdapter` writes under a new, versioned, package-qualified
namespace: `@triiiceratops/plugin-annotation-editor:v1`.

- RC LocalStorage data is **not read and not migrated**.
- Old RC keys are **not deleted or overwritten** — they are simply ignored.

Treat any annotations saved with an RC build as **disposable**. The
LocalStorage adapter is intended for local / single-browser use; production
multi-user deployments should implement a server-backed
[storage adapter](plugins.md#custom-storage-adapters).

## Verification checklist

After migrating, a search of your codebase for any of these RC strings should
return **zero** hits:

```bash
grep -rn "triiiceratops/plugins/" src/
grep -rn "TriiiceratopsPlugins\|__TriiiceratopsSvelteRuntime" src/
grep -rn "triiiceratops/bundle" src/
grep -rn "theme=\"Teal\"\|data-theme=\"Teal\"" src/
# Public CSS tokens should all carry the --tri- prefix:
grep -rnE "var\(--(color-|viewer-|toolbar-|panel-|gallery-|content|radius-|size-|border|depth)" src/
```

Then reinstall so the removed subpaths and globals are actually gone:

```bash
pnpm install
pnpm build
```
