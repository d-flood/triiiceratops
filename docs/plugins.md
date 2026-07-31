---
icon: lucide/plug-2
---

# Plugin System

Triiiceratops has a component-based plugin system for extending the viewer. A
plugin renders its UI either as a **panel** docked to the left or right sidebar
or as a compact **flyout** popover anchored to its toolbar button.

## How the Plugin System Works

Each first-party plugin is its own independently versioned npm package under the
`@triiiceratops` scope, and ships in two delivery formats.

| Format          | Use case                                  | Plugins delivered via                              |
| --------------- | ------------------------------------------ | -------------------------------------------------- |
| **IIFE**        | Static HTML pages, no build step          | Script tags + the `window.Triiiceratops` registry  |
| **ES Modules**  | Front-end framework projects (any bundler) | `import` statements                                |

- **ES Modules** — for bundler projects (React, Vue, Svelte, Lit, or any other
  framework — Vite, webpack, Rollup, …), import the plugin's factory from its
  scoped package and pass it to the viewer. Plugins run in the page's realm
  and receive the live `ViewerState` directly — they do **not** share core's
  Svelte runtime.
- **IIFE** — each plugin's IIFE (`@triiiceratops/plugin-*/dist/iife.js`)
  registers a factory into the shared, order-independent
  `window.Triiiceratops.plugins` registry. Loading a script does **not** activate
  the plugin; activation is explicit and per-viewer. Scripts may load in any
  order.

The RC's `window.TriiiceratopsPlugins` globals and the
`window.__TriiiceratopsSvelteRuntime` runtime-sharing bridge have been removed.

---

## Adding a plugin to your viewer

A plugin is handed to the viewer through its **`plugins` list**. How you set
that list depends on how the viewer is embedded:

- **Svelte** — the `plugins` prop of `<TriiiceratopsViewer>`.
- **Everything else** (React, Vue, vanilla JS, plain HTML) — the `.plugins`
  **property** of the `<triiiceratops-viewer>` web component.

Plugins are plain objects, so they cannot go through an HTML attribute; the web
component always receives them as a JavaScript property after the element is
defined. Registering a plugin package does not activate it — activation is
per-viewer and happens when the list is assigned.

Every example below adds `@triiiceratops/plugin-image-manipulation`; each plugin
is added the same way.

=== "HTML"

    With a bundler, import the registration entry once to define the element,
    then set `.plugins` on it:

    ```ts
    import 'triiiceratops/element/register';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    // `viewer` is your <triiiceratops-viewer> element.
    viewer.plugins = [ImageManipulationPlugin];
    ```

    With no bundler at all, plugin IIFEs register a factory into the shared,
    order-independent `window.Triiiceratops.plugins` registry; the scripts may
    load in any order:

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
    <script src="https://unpkg.com/@triiiceratops/plugin-image-manipulation/dist/iife.js"></script>

    <triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>

    <script>
        customElements.whenDefined('triiiceratops-viewer').then(() => {
            const viewer = document.querySelector('triiiceratops-viewer');
            viewer.plugins = [
                window.Triiiceratops.plugins.get(
                    '@triiiceratops/plugin-image-manipulation',
                ),
            ];
        });
    </script>
    ```

=== "React"

    React drives the web component. Set `.plugins` through a ref once the
    element has mounted.

    ```jsx
    import { useEffect, useRef } from 'react';
    import 'triiiceratops/element/register';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    export function Viewer() {
        const ref = useRef(null);
        useEffect(() => {
            if (ref.current) ref.current.plugins = [ImageManipulationPlugin];
        }, []);
        return (
            <triiiceratops-viewer
                ref={ref}
                manifest-id="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        );
    }
    ```

    TypeScript hosts: declare the tag in `JSX.IntrinsicElements` (or set
    `.plugins` through a typed ref) to satisfy the compiler.

=== "Vue"

    Tell Vue the tag is a custom element so it does not try to resolve it as a
    component (Vite: `vue({ template: { compilerOptions: { isCustomElement: (t) => t === 'triiiceratops-viewer' } } })`).

    ```vue
    <script setup>
    import { onMounted, ref } from 'vue';
    import 'triiiceratops/element/register';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    const viewer = ref(null);
    onMounted(() => {
        viewer.value.plugins = [ImageManipulationPlugin];
    });
    </script>

    <template>
        <triiiceratops-viewer
            ref="viewer"
            manifest-id="https://example.org/manifest.json"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        import 'triiiceratops/style.css';
        import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
    </script>

    <TriiiceratopsViewer
        manifestId="https://example.org/manifest.json"
        plugins={[ImageManipulationPlugin]}
    />
    ```

## Multiple and configured plugins

`plugins` is a list — add as many as you like. Plugins that expose a `create*`
factory (PDF export, annotation editor) are configured by calling the factory;
see the [available plugins reference](#available-plugins).

```ts
import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

viewer.plugins = [ImageDownloadPlugin, createPdfExportPlugin()];
```

## Panels and flyouts

A **panel** docks into the left or right sidebar stack. Panels on the same
side stack vertically; each side's width is set once by `leftPanelWidth` /
`rightPanelWidth` — there is no per-plugin width.

A **flyout** is a compact popover anchored to the plugin's toolbar button. It opens
on click (click-outside / `Esc` to dismiss) and grows toward the canvas so it never
opens off-screen. It stays mounted while closed, so background work keeps running.
Use a flyout for a few compact controls; use a panel when the UI needs more room.

Panels behave the same way: a plugin is mounted once per viewer and stays mounted
while its surface is closed. A plugin that *wants* to pause while it is not
visible reads `context.surface.isOpen` — see [knowing whether your panel or
flyout is open](plugin-authoring.md#knowing-whether-your-panel-or-flyout-is-open).

The authored `target` is only a **default**. Every plugin registers both a panel and
a flyout entry, so the effective target is switchable at runtime — like
`visible`/`open` — via `config.plugins[id].target` or
`viewerState.setPluginTarget(id, target)`. A panel's dock side works the same way:
`config.plugins[id].position` or `viewerState.setPluginPosition(id, position)` sets
it for any plugin as a consumer-only decision; `definePlugin` itself has no
`position` field, so a plugin author cannot fix one. This lets one plugin render as a panel on desktop and
a flyout on a narrow viewport; see [controlling plugin UI at
runtime](#controlling-plugin-ui-at-runtime) below for the per-framework code.
Switching remounts the plugin UI in the new container, so a plugin that must
survive the switch keeps its state in viewer state or its own store, not in local
component state.

## Controlling Plugin UI Through Config

Plugin toolbar button visibility and plugin panel open/closed state can be controlled through the same `config` object used for built-in panes.

Configuration shape:

```ts
type ViewerConfig = {
    plugins?: Record<
        string,
        {
            visible?: boolean; // show/hide the plugin toolbar button
            open?: boolean; // open/close the plugin panel
            target?: 'panel' | 'flyout'; // override where the plugin renders
            position?: 'left' | 'right'; // override the panel's dock side
        }
    >;
};
```

The record key is the plugin's stable id — its `uiId`. First-party plugins set
short, documented ids (`pdf-export`, `image-download`, `image-manipulation`,
`annotation-editor`). If a plugin omits `uiId`, core derives a stable id from its
package name by replacing every run of unsafe characters with `-` (e.g.
`@scope/plugin-foo` → `scope-plugin-foo`).

Every field is a sparse override applied on top of the plugin's authored
defaults; omitting a field leaves the current live value untouched:

- `visible: false` hides only the plugin's toolbar button.
- `open: true` opens the plugin's surface if it is registered.
- `target: 'flyout' | 'panel'` moves the plugin between its docked panel and its
  anchored flyout; the switch remounts the plugin UI.
- `position: 'left' | 'right'` docks the panel on a different side — a
  consuming app's own choice, independent of whatever the plugin was authored
  with. Ignored while the effective `target` is `'flyout'`.

Update `config` and the change applies reactively.

### Controlling plugin UI at runtime

A common use is switching a plugin to a flyout on narrow viewports, or docking
it to whichever side fits your layout:

=== "HTML"

    Assign a new `config` object on the element:

    ```ts
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => {
        viewer.config = {
            plugins: {
                'image-manipulation': { target: mq.matches ? 'flyout' : 'panel' },
            },
        };
    };
    sync();
    mq.addEventListener('change', sync);
    ```

    The web component does not expose `viewerState` — use `config` here.

=== "React"

    Assign a new `config` object through the same ref:

    ```ts
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => {
        ref.current.config = {
            plugins: {
                'image-manipulation': { target: mq.matches ? 'flyout' : 'panel' },
            },
        };
    };
    sync();
    mq.addEventListener('change', sync);
    ```

=== "Vue"

    Assign a new `config` object through the same ref:

    ```ts
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => {
        viewer.value.config = {
            plugins: {
                'image-manipulation': { target: mq.matches ? 'flyout' : 'panel' },
            },
        };
    };
    sync();
    mq.addEventListener('change', sync);
    ```

=== "Svelte"

    Reassign the reactive `config` prop:

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

        let narrow = $state(false);
        $effect(() => {
            const mq = window.matchMedia('(max-width: 640px)');
            const sync = () => (narrow = mq.matches);
            sync();
            mq.addEventListener('change', sync);
            return () => mq.removeEventListener('change', sync);
        });

        let config = $derived({
            plugins: {
                'image-manipulation': { target: narrow ? 'flyout' : 'panel' },
            },
        });
    </script>

    <TriiiceratopsViewer manifestId="…" plugins={[ImageManipulationPlugin]} {config} />
    ```

    Svelte hosts that capture `viewerState` (via `bind:viewerState`) can also call
    `viewerState.setPluginTarget(id, target)`, `setPluginPosition(id, position)`,
    and `setPluginOpen(id, open)` imperatively.

---

## Defining a plugin

Plugins are **framework-agnostic**. Author new plugins with the framework-neutral
SDK (`@triiiceratops/plugin-sdk`) and `definePlugin`: a plugin mounts into a plain
`HTMLElement`, so you can render it with vanilla JavaScript, React, Vue, Svelte,
Lit, or a custom element, and it behaves the same in every host. `definePlugin`
gives you a mount contract; the live `ViewerState` for reads and supported
commands; root-aware style, locale, and UI services; failure isolation; and a
conformance test kit.

See the [plugin authoring guide](plugin-authoring.md) and the
[plugin testing guide](plugin-testing.md) for the full API and examples.

`definePlugin` is the only plugin path. The Svelte-only shortcut (`PluginDef`,
`createPanelPlugin`/`createFlyoutPlugin`) was removed in 1.0; a Svelte host
mounts its component from the SDK's `mount()` instead — see the Svelte tab in
[rendering UI in your
framework](plugin-authoring.md#rendering-ui-in-your-framework).

---

## Available Plugins

| Plugin | What it does | Renders as |
| :----- | :------------ | :--------- |
| [Image Manipulation](plugin-image-manipulation.md) | Brightness, contrast, saturation, invert, and grayscale controls for the displayed image | Flyout |
| [Image Download](plugin-image-export.md) | Downloads the current canvas (composite, single image, or current view) as a raster image | Panel |
| [PDF Export](plugin-pdf-export.md) | Exports a range of canvases as a browser-generated PDF, with optional OCR text and a cover sheet | Panel |
| [Annotation Editor](plugin-annotation-editor.md) | Rectangle/polygon/point annotation authoring with pluggable persistence and host extension hooks | Panel or flyout |

Each page above has its own install command, setup snippet, and configuration
reference.

---

## Package Exports Reference

| Export path                                          | Description                              |
| ---------------------------------------------------- | ---------------------------------------- |
| `triiiceratops`                                      | Core Svelte component and utilities      |
| `triiiceratops/style.css`                            | Core stylesheet (Svelte usage)           |
| `triiiceratops/element`                              | Web Component self-contained IIFE        |
| `triiiceratops/element/register`                     | Web Component ESM registration           |
| `@triiiceratops/plugin-sdk`                          | Plugin SDK (base)                        |
| `@triiiceratops/plugin-sdk/register`                 | Browser/IIFE registration (`registerBrowserPlugin`) |
| `@triiiceratops/plugin-sdk/{svelte,react,vue,lit}`   | SDK framework adapters                   |
| `@triiiceratops/plugin-sdk/testing`                  | SDK plugin test kit                      |
| `@triiiceratops/plugin-image-manipulation`           | Image manipulation plugin (ES module)    |
| `@triiiceratops/plugin-image-manipulation/iife`      | Image manipulation plugin (IIFE)         |
| `@triiiceratops/plugin-image-export`               | Image download plugin (ES module)        |
| `@triiiceratops/plugin-image-export/iife`          | Image download plugin (IIFE)             |
| `@triiiceratops/plugin-pdf-export`                   | PDF export plugin (ES module)            |
| `@triiiceratops/plugin-pdf-export/iife`              | PDF export plugin (IIFE)                 |
| `@triiiceratops/plugin-annotation-editor`            | Annotation editor plugin (ES module)     |
| `@triiiceratops/plugin-annotation-editor/iife`       | Annotation editor plugin (IIFE)          |
| `@triiiceratops/plugin-annotation-editor/testing`    | Adapter conformance suite                |
