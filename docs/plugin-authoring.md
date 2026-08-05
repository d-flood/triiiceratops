---
icon: lucide/puzzle
description: "Write Triiiceratops plugins with @triiiceratops/plugin-sdk: framework-neutral, dependency-light, and mounted into a plain HTMLElement."
---

# Authoring a plugin (the SDK)

Write plugins with `@triiiceratops/plugin-sdk`. The SDK is framework-neutral and
dependency-light: a plugin mounts into a plain `HTMLElement`, reads and controls
the viewer through the live `ViewerState`, and returns a cleanup function. Render
it with vanilla JavaScript, React, Vue, Svelte, Lit, or any other framework that
mounts into an element — see [Rendering UI in your
framework](#rendering-ui-in-your-framework) below.

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-sdk
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-sdk
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-sdk
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

## Rendering UI in your framework

`mount()` receives a plain `HTMLElement` — render into it with whatever you
already use. Each framework has an optional adapter subpath
(`@triiiceratops/plugin-sdk/{react,vue,svelte,lit}`) that turns a selector into
that framework's native reactive primitive (a hook, a composable, a store, a
reactive controller) so state reads stay idiomatic. Here is the same "show
whether the toolbar is open" plugin, mounted five ways:

=== "Vanilla JavaScript"

    No adapter needed — read `context.selectors.select(fn)` directly (see
    [Selectors](#selectors) below for the memoization/equality details):

    ```ts
    import type { PluginContext } from 'triiiceratops';

    function mount(container: HTMLElement, context: PluginContext): () => void {
        const label = document.createElement('span');
        const open = context.selectors.select((s) => s.toolbarOpen);
        label.textContent = open.get() ? 'open' : 'closed';
        const stop = open.subscribe((value) => {
            label.textContent = value ? 'open' : 'closed';
        });
        container.appendChild(label);
        return () => {
            stop();
            label.remove();
        };
    }
    ```

=== "React"

    `@triiiceratops/plugin-sdk/react` provides `useViewerSelector`, backed by
    `useSyncExternalStore`:

    ```tsx
    import { createRoot } from 'react-dom/client';
    import { useViewerSelector } from '@triiiceratops/plugin-sdk/react';
    import type { PluginContext } from 'triiiceratops';

    function PluginUI({ context }: { context: PluginContext }) {
        const open = useViewerSelector(context, (s) => s.toolbarOpen);
        return <span>{open ? 'open' : 'closed'}</span>;
    }

    function mount(container: HTMLElement, context: PluginContext): () => void {
        const root = createRoot(container);
        root.render(<PluginUI context={context} />);
        return () => root.unmount();
    }
    ```

=== "Vue"

    `@triiiceratops/plugin-sdk/vue` provides a composable returning a readonly
    `Ref`:

    ```ts
    import { createApp, defineComponent, h, type PropType } from 'vue';
    import { useViewerSelector } from '@triiiceratops/plugin-sdk/vue';
    import type { PluginContext } from 'triiiceratops';

    const PluginUI = defineComponent({
        props: {
            context: { type: Object as PropType<PluginContext>, required: true },
        },
        setup(props) {
            const open = useViewerSelector(props.context, (s) => s.toolbarOpen);
            return () => h('span', open.value ? 'open' : 'closed');
        },
    });

    function mount(container: HTMLElement, context: PluginContext): () => void {
        const app = createApp(PluginUI, { context });
        app.mount(container);
        return () => app.unmount();
    }
    ```

=== "Svelte"

    `@triiiceratops/plugin-sdk/svelte` exposes a selector as a Svelte readable
    store:

    ```html
    <!-- PluginUI.svelte -->
    <script lang="ts">
        import { viewerSelector } from '@triiiceratops/plugin-sdk/svelte';
        let { context } = $props();
        const open = viewerSelector(context, (s) => s.toolbarOpen);
    </script>

    <span>{$open ? 'open' : 'closed'}</span>
    ```

    ```ts
    import { mount as mountComponent, unmount } from 'svelte';
    import PluginUI from './PluginUI.svelte';
    import type { PluginContext } from 'triiiceratops';

    function mount(container: HTMLElement, context: PluginContext): () => void {
        const app = mountComponent(PluginUI, {
            target: container,
            props: { context },
        });
        return () => unmount(app);
    }
    ```

    !!! note "Svelte hosts use the same SDK path"

        There is no Svelte-only shortcut. The Svelte-component plugin path
        (`PluginDef`, `createPanelPlugin`, `createFlyoutPlugin`) was removed in
        1.0, because it put Svelte component types into every consumer's type
        graph. Mount your Svelte component from `mount()` exactly as above; set a
        stable `uiId` if you plan to control the plugin through `config.plugins`.

=== "Lit"

    `@triiiceratops/plugin-sdk/lit` provides a `ReactiveController`:

    ```ts
    import { SelectorController } from '@triiiceratops/plugin-sdk/lit';
    import { LitElement, html } from 'lit';
    import type { PluginContext } from 'triiiceratops';

    class PluginUI extends LitElement {
        createRenderRoot() {
            return this; // light DOM
        }
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
    customElements.define('plugin-ui', PluginUI);

    function mount(container: HTMLElement, context: PluginContext): () => void {
        const el = document.createElement('plugin-ui') as PluginUI;
        el.setContext(context);
        container.appendChild(el);
        return () => el.remove();
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
        title: 'example_title', // chrome label (tooltip + panel header):
        // resolved against `catalog` in the viewer's active locale, English
        // fallback, then rendered verbatim if no key matches — so a literal
        // like 'Example' works too. Omit it and the toolbar shows `name`.
        uiId: 'my-plugin', // stable, DOM-safe key for config.plugins[uiId]
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0', // core versions this plugin supports
        pluginApiRange: '^1.0.0', // plugin API versions supported
        requiredCapabilities: [], // e.g. ['osd@5']
        icon,
        target: 'panel', // default target; or 'flyout'. Host can override at
        // runtime via config.plugins[uiId].target / setPluginTarget.
        // There is no `position` field here — a panel's dock side is chosen
        // by the consuming app, not the plugin. See "Panel position" below.
        dismiss: 'light', // flyout dismiss: 'light' (default) or 'explicit'; ignored for panels
        catalog: { en: { example_title: 'Example' } }, // package-owned localization
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

### Panel position

A `definePlugin` plugin has no authoring-time way to pick where its panel
docks — that choice belongs to the consuming app, since it's the app that
knows its own layout. A host sets it per plugin, keyed by the same `uiId`
used for `visible`/`open`/`target`:

```ts
// <TriiiceratopsViewer manifestId="..." config={{
//     plugins: { 'my-plugin': { position: 'right' } },
// }} />
```

`position` accepts `'left' | 'right'` (default `'left'`), applies reactively
after mount like `target`, and has an imperative
sibling, `ViewerState.setPluginPosition(uiId, position)`. It's ignored while
the plugin's effective target is `'flyout'` — a flyout is anchored to its
toolbar button, not docked to a side.

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

The common path: pass your plugin straight to the viewer's `plugins` prop and
core activates it for you. The `createExamplePlugin()` from the sections above
slots in exactly where a pre-built plugin like `ImageManipulationPlugin` would
go — see [using plugins](plugins.md#adding-a-plugin-to-your-viewer) for the same
example wired up in each supported framework:

```html
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import { createExamplePlugin } from './my-plugin';
</script>

<TriiiceratopsViewer manifestId="..." plugins={[createExamplePlugin()]} />
```

In module builds you can also activate a plugin explicitly against a live
`ViewerState`, without going through the viewer component — this is what the
[test kit](plugin-testing.md) uses, and what you'd reach for to activate a
plugin outside of `TriiiceratopsViewer` (a custom host, a manual test, a
one-off script):

The constructible `ViewerState` class comes from `triiiceratops/svelte` and needs
the `svelte` peer installed — it is the same class the viewer component itself
uses. For **tests**, prefer `createHeadlessViewerState()` from the
[test kit](plugin-testing.md), which needs no Svelte.

```ts
import { CORE_VERSION, pluginApiVersion, capabilities } from 'triiiceratops';
import { ViewerState } from 'triiiceratops/svelte';
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

### Shipping as a script tag (IIFE)

To distribute your plugin as a `<script>` tag for no-build-step, Web Component
hosts (see [how the plugin system works](plugins.md#how-the-plugin-system-works)
for the delivery-format overview), register it into the page-level
`window.Triiiceratops` registry with `@triiiceratops/plugin-sdk/register`
instead of exporting it from a module:

```ts
// iife.ts — your plugin's IIFE entry point, bundled standalone
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';
import { createExamplePlugin } from './my-plugin';

registerBrowserPlugin(createExamplePlugin());
```

```html
<script src="https://unpkg.com/@example/my-plugin/dist/iife.js"></script>
```

`registerBrowserPlugin` only imports a type from `triiiceratops` (erased at
build), so bundling it pulls no runtime and no Svelte into your plugin's
script. Registration follows the same rule as `definePlugin` itself — it is
side-effect-free and does not activate anything; the host's core build
discovers and activates registered plugins by name. If two scripts register
the same plugin name with different versions, the first registration wins and
the second logs a console warning.

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

### Knowing whether your panel or flyout is open

Core mounts your plugin **once per viewer**, into a content element it moves in
and out of the open panel/flyout. `mount` is *not* re-run when the user opens or
closes your surface, and your cleanup is *not* run on close — that's deliberate,
so state survives a close→reopen round trip. It also means you can't use mount
and cleanup as open/close hooks.

`context.surface` is your plugin's own chrome. Use it to pause work that only
matters while the user can actually see your UI:

```ts
import type { PluginContext } from 'triiiceratops';

function surfaceAware(context: PluginContext) {
    const { surface } = context;

    // `isOpen` and `target` are live getters — never snapshot them.
    const open = context.selectors.select(() => surface.isOpen);

    const render = (isOpen: boolean) => {
        if (isOpen) {
            // Start polling, attach an expensive OSD handler, resume an
            // animation — whatever is wasted while nobody can see it.
        } else {
            // Pause it. Keep your state: the plugin is still activated.
        }
    };

    render(open.get()); // may already be open (config.plugins[uiId].open)
    return open.subscribe(render);
}
```

`isOpen` reflects **every** way a surface opens or closes: the plugin's toolbar
button, a flyout light-dismiss (outside click or Escape), the consumer's
`config.plugins[uiId].open`, and `ViewerState.setPluginOpen`. Read it as a plain
getter for a one-off check, or project it through a selector (as above) to react.
Like all viewer notifications, changes land on the batched flush, not
synchronously inside the click.

The surface also lets your content close itself — a "Done" or "Apply" button
inside a flyout — and tells you which chrome you're rendering in, so a compact
flyout can lay out differently from a docked panel:

```ts
import type { PluginContext } from 'triiiceratops';

function surfaceControls(context: PluginContext) {
    const { surface } = context;

    void surface.id; // your chrome id — the `config.plugins` key
    void surface.target; // 'panel' | 'flyout', follows a runtime override

    const done = document.createElement('button');
    done.textContent = 'Done';
    done.onclick = () => surface.close(); // also: open(), toggle()
    return done;
}
```

When a plugin is activated with no chrome at all — a bare `runActivation` into a
container you placed yourself — `surface.isOpen` is `true` and the movers are
no-ops: there is nothing that could be hiding your UI, so surface-gated work
runs.

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
light DOM and shadow DOM and is nonce-aware for CSP (see the
[Content Security Policy guide](csp.md)):

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

Shape your CSS and its install id with `definePluginStyles(css, id)` — a small,
dependency-free helper that first-party plugins use to export a named `STYLES` /
`STYLE_ID` pair instead of an inline string literal, so the CSS lives in its own
module (conventionally `styles.ts`) and the id stays a stable, reusable
constant. `context.styles.install` takes the pair exactly where it took the
literal string and id above:

```ts
import { definePluginStyles } from '@triiiceratops/plugin-sdk';

// Conventionally in its own styles.ts, imported by name wherever installed.
export const { STYLES, STYLE_ID } = definePluginStyles(
    '.my-plugin-panel { padding: 1rem; }',
    'panel',
);
```

### Localization

Plugin localization catalogs are package-owned. `context.locale.t(key, params?)`
resolves against your catalog in the viewer's active locale with English
fallback, and `subscribe` reacts to per-viewer locale changes:

```ts
import type { PluginContext } from 'triiiceratops';

function greeting(context: PluginContext) {
    const text = context.locale.t('example_title');
    const stop = context.locale.subscribe((locale) => {
        console.log('active locale is now', locale);
    });
    return { text, stop };
}
```

Your plugin's core-owned chrome is localized from the same catalog: core
resolves `definePlugin`'s `title` through it, so the toolbar tooltip and the
docked-panel header follow the viewer's active locale exactly like the strings
you resolve yourself. `name` is identity, never copy — a plugin that omits
`title` gets its package name in the toolbar.

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

## Verified against the packed packages

Every adapter is exercised in CI by a dedicated packed-consumer fixture
(`plugin-svelte`, `plugin-react`, `plugin-vue`, `plugin-lit`), each installing the
real SDK tarball and mounting a plugin against a live packed `ViewerState`. The
code samples above are additionally compiled against the packed tarballs by the
`docs-examples` fixture.
