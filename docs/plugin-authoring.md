---
icon: lucide/puzzle
---

# Authoring a plugin (the SDK)

Write plugins with `@triiiceratops/plugin-sdk`. The SDK is framework-neutral and
dependency-light: a plugin mounts into a plain `HTMLElement`, reads and controls
the viewer through the live `ViewerState`, and returns a cleanup function. You can
render with vanilla DOM, Svelte, React, Vue, Lit, or a custom element — anything
that mounts into an element.

```bash
pnpm add @triiiceratops/plugin-sdk
```

This page is the authoring reference. For the packed-consumer test kit, see the
[plugin testing guide](plugin-testing.md).

## The mount contract

Core owns the panel and flyout **container**; your plugin owns what renders
inside it and returns a teardown function:

```ts
import type { PluginContext } from 'triiiceratops';

function mount(container: HTMLElement, context: PluginContext): () => void {
    const label = document.createElement('span');
    label.textContent = 'hello from a plugin';
    container.appendChild(label);

    // Return cleanup — run on deactivation / retry / viewer teardown.
    return () => {
        label.remove();
    };
}
```

## `definePlugin`

`definePlugin` wraps declarative metadata and a view. Registration is
side-effect-free and does not activate anything; compatibility is negotiated
later, at activation, per viewer.

```ts
import { definePlugin, svgIcon } from '@triiiceratops/plugin-sdk';

const icon = svgIcon('<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" /></svg>');

export function createExamplePlugin() {
    return definePlugin({
        name: '@example/my-plugin', // package-qualified, keys the registry
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0', // core versions this plugin supports
        pluginApiRange: '^1.0.0', // plugin API versions supported
        requiredCapabilities: [], // e.g. ['osd@5']
        icon,
        target: 'panel', // or 'flyout'
        catalog: { en: { title: 'Example' } }, // package-owned localization
        view: {
            mount(container, context) {
                const selector = context.selectors.select((s) => s.toolbarOpen);
                const label = document.createElement('span');
                label.textContent = selector.get() ? 'open' : 'closed';
                const stop = selector.subscribe((open) => {
                    label.textContent = open ? 'open' : 'closed';
                });
                container.appendChild(label);
                return () => {
                    stop();
                    label.remove();
                };
            },
        },
    });
}
```

### Toolbar icons

Produce the toolbar icon with `svgIcon(fullSvgString)`. It validates the SVG
synchronously and **throws at the call site** on invalid input — scripts, event
attributes, external resources, and `foreignObject` are rejected. Core owns the
icon's dimensions, focus behavior, color, and accessibility attributes; you
supply only the shape:

```ts
import { svgIcon, SvgIconError } from '@triiiceratops/plugin-sdk';

try {
    const icon = svgIcon('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>');
    void icon;
} catch (err) {
    if (err instanceof SvgIconError) {
        // A developer error — fix the SVG string.
    }
}
```

## Activating a plugin

In module builds you activate a plugin against a live `ViewerState`. Core does
this for you when you pass a plugin to the viewer's `plugins` prop; `activatePlugin`
is the explicit API (and what the test kit uses):

```ts
import {
    ViewerState,
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from 'triiiceratops';
import { activatePlugin } from '@triiiceratops/plugin-sdk';
import { createExamplePlugin } from './my-plugin';

const state = new ViewerState();
const activation = activatePlugin(createExamplePlugin(), {
    container: document.getElementById('host')!,
    viewerState: state,
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
});

// Later:
activation.deactivate();
```

## Reading and controlling state

`context.viewerState` is the actual live viewer state — the sole plugin-facing
state surface. Read properties directly (reads are synchronous and always
current). Change state only through **supported commands** (the parity rule:
anything the viewer's own UI can do, a plugin can do through a command). Direct
property assignment is not a supported mutation API.

```ts
import type { PluginContext } from 'triiiceratops';

function example(context: PluginContext) {
    const { viewerState } = context;

    // Read directly.
    const canvasId: string | null = viewerState.canvasId;
    void canvasId;

    // Mutate through commands.
    viewerState.nextCanvas();
    viewerState.toggleAnnotations();
}
```

### Selectors

`context.selectors.select(fn)` returns a memoized `{ get(), subscribe() }`
selector. It recomputes only when state changes and notifies only when the
selected value fails the equality gate (`Object.is` by default, or a supplied
comparator):

```ts
import type { PluginContext } from 'triiiceratops';

function watchCanvas(context: PluginContext) {
    const canvas = context.selectors.select((s) => s.canvasId);
    const stop = canvas.subscribe((id) => {
        console.log('canvas changed to', id);
    });
    return stop; // unsubscribe
}
```

Notifications are **batched** and carry no payload — a notification means "state
changed, read what you need," not a transition log. Subscribers read the current
value rather than reconstructing intermediate states.

### The raw OpenSeadragon viewer

The raw OSD viewer is a documented pass-through: `viewerState.osdViewer` is
`null` until OSD is ready. Await readiness with the SDK helper instead of
polling:

```ts
import { whenOsdReady } from '@triiiceratops/plugin-sdk';
import type { PluginContext } from 'triiiceratops';

async function fitToViewport(context: PluginContext) {
    const osd = await whenOsdReady(context.viewerState);
    osd.viewport.goHome();
}
```

The bundled OSD major is declared as the `osd@5` capability and changes only with
a core major release.

## Services

The plugin context carries three root-aware services.

### Styles

`context.styles.install(css, id)` installs a global stylesheet under a
package-qualified key. It is deduplicated across viewers sharing a root,
reference-counted, and cleaned up automatically on deactivation. It works in both
light DOM and shadow DOM and is nonce-aware for CSP:

```ts
import type { PluginContext } from 'triiiceratops';

function installStyles(context: PluginContext) {
    const uninstall = context.styles.install(
        '.my-plugin-panel { padding: 1rem; }',
        'panel',
    );
    return uninstall; // release one reference
}
```

### Localization

Plugin localization catalogs are package-owned. `context.locale.t(key, params?)`
resolves against your catalog in the viewer's active locale with English
fallback, and `subscribe` reacts to per-viewer locale changes:

```ts
import type { PluginContext } from 'triiiceratops';

function greeting(context: PluginContext) {
    const text = context.locale.t('title');
    const stop = context.locale.subscribe((locale) => {
        console.log('active locale is now', locale);
    });
    return { text, stop };
}
```

### UI

`context.ui.renderIcon(icon, container)` renders a core-owned icon descriptor so
plugin-authored icons stay visually and semantically consistent with core.

## Failure isolation and retry

Setup, mount, update, command, subscription-listener, and cleanup failures are
isolated: core keeps the viewer and other plugins running. A failed plugin shows
a plugin-local error state whose toolbar button stays visible with an error
indicator and offers **retry** (a manual, full re-activation). Failures are also
delivered through the structured `pluginerror` channel — as a DOM event from the
viewer root and as a host callback — carrying
`{ pluginName, pluginVersion, phase, error, retry() }`.

## Framework adapters

Each adapter is a separate SDK subpath with optional peer dependencies. Only the
latest stable framework majors are supported. All adapters consume the same
`ViewerState` subscription contract — they do not track signals from core's
Svelte runtime.

=== "Svelte"

    `@triiiceratops/plugin-sdk/svelte` exposes a selector as a Svelte readable
    store, read with `$`-auto-subscription:

    ```svelte
    <script lang="ts">
        import { viewerSelector } from '@triiiceratops/plugin-sdk/svelte';
        let { context } = $props();
        const open = viewerSelector(context, (s) => s.toolbarOpen);
    </script>

    <span>{$open ? 'open' : 'closed'}</span>
    ```

=== "React"

    `@triiiceratops/plugin-sdk/react` provides a hook backed by the subscription
    contract:

    ```tsx
    import { useViewerSelector } from '@triiiceratops/plugin-sdk/react';
    import type { PluginContext } from 'triiiceratops';

    export function PluginUI({ context }: { context: PluginContext }) {
        const open = useViewerSelector(context, (s) => s.toolbarOpen);
        return <span>{open ? 'open' : 'closed'}</span>;
    }
    ```

=== "Vue"

    `@triiiceratops/plugin-sdk/vue` provides a composable returning a readonly
    `Ref`:

    ```ts
    import { useViewerSelector } from '@triiiceratops/plugin-sdk/vue';
    import type { PluginContext } from 'triiiceratops';

    export function useToolbarOpen(context: PluginContext) {
        const open = useViewerSelector(context, (s) => s.toolbarOpen);
        return open; // Ref<boolean>; read open.value in a template
    }
    ```

=== "Lit"

    `@triiiceratops/plugin-sdk/lit` provides a `ReactiveController`:

    ```ts
    import { SelectorController } from '@triiiceratops/plugin-sdk/lit';
    import { LitElement, html } from 'lit';
    import type { PluginContext } from 'triiiceratops';

    export class PluginEl extends LitElement {
        toolbar?: SelectorController<boolean>;

        setContext(context: PluginContext) {
            this.toolbar = new SelectorController(
                this,
                context.selectors.select((s) => s.toolbarOpen),
            );
        }

        render() {
            return html`<span>${this.toolbar?.value ? 'open' : 'closed'}</span>`;
        }
    }
    ```

## Verified against the packed packages

Every adapter is exercised in CI by a dedicated packed-consumer fixture
(`plugin-svelte`, `plugin-react`, `plugin-vue`, `plugin-lit`), each installing the
real SDK tarball and mounting a plugin against a live packed `ViewerState`. The
code samples above are additionally compiled against the packed tarballs by the
`docs-examples` fixture.
