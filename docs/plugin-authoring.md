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
        requiredCapabilities: [], // normally empty; see "Capabilities" below
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

### The canvas contract

Every canvas the viewer hands you — `viewerState.canvases`,
`viewerState.getCanvases(manifestId, sequenceIndex)`, and every canvas passed
into a plugin — is **raw IIIF Canvas JSON, IIIF Presentation 2 or 3 exactly as
the manifest authored it**. There is no wrapper object and there are no accessor
methods. The active manifest is likewise raw JSON, at
`viewerState.manifestEntry?.json`.

The two versions spell the same things differently — a v2 canvas uses `@id` and
`images[]`, a v3 canvas uses `id` and `items[]` — and every one of these values
is typed `any`, so TypeScript will not tell you which one you are holding.
Rather than branch on version yourself, read them with core's version-neutral
helpers:

| Helper                                                  | From                          | Reads                                    |
| ------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| `getPaintingAnnotations(canvas)`                        | `triiiceratops`, `triiiceratops/image-export` | the canvas's image-bearing annotations |
| `getCanvasId(canvas)`                                   | `triiiceratops/image-export`  | `id` / `@id`                             |
| `getCanvasLabel(canvas, fallbackIndex?, locale?)`       | `triiiceratops/image-export`  | `label`, in any of its shapes            |
| `getThumbnailSrc(canvas)`                               | `triiiceratops/image-export`  | a thumbnail URL, with fallbacks          |
| `resolveCanvasImage(canvas)` / `resolveAllCanvasImages` | `triiiceratops/image-export`  | resolved image URLs and Choices          |
| `resolveLanguageValue(value, locale?)`                  | `triiiceratops/image-export`  | any IIIF language-mapped value           |

```ts
import { getPaintingAnnotations } from 'triiiceratops';
import { getCanvasId, resolveAllCanvasImages } from 'triiiceratops/image-export';
import type { PluginContext } from 'triiiceratops';

function imagesOnCurrentCanvas(context: PluginContext) {
    const { viewerState } = context;
    const canvas = viewerState.canvases.find(
        (c: any) => getCanvasId(c) === viewerState.canvasId,
    );

    // Annotation-level view: what the manifest says paints this canvas.
    const painting = getPaintingAnnotations(canvas);
    // A v2 annotation carries its image under `resource`, a v3 one under `body`.

    // Or go straight to resolved image URLs, Choices included.
    return resolveAllCanvasImages(canvas);
}
```

`getPaintingAnnotations` is **total**: it never throws and always returns an
array, including for `null`, a non-canvas, or a canvas whose `items`/`images` is
a bare object rather than an array. Do not reimplement it — enumerating a canvas
by hand is the one mistake here that fails silently, as a blank canvas with no
error.

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
            // Start polling, attach an expensive frame handler, resume an
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

### The viewport

**No renderer object is exposed.** The viewer's image surface is reached through
first-party commands and queries on `viewerState`, all of them governed by core's
own semver:

- **Commands** — `zoomIn()`, `zoomOut()`, `zoomTo(scale)`, `panTo(point)`,
  `fitBounds(box)`, `fitCanvas()`, and `setImageAdjustments({ ... })`.
- **Query-only state** — `viewportScale`, `viewportCentre`, `viewportBounds`,
  and `containerSize`. These change every frame and deliberately never notify;
  read them reactively with a `frame`-cadence selector.
- **Coordinate helpers** — `canvasToScreen(point)` and `screenToCanvas(point)`,
  converting between **canvas space** (the IIIF Canvas's own dimensions, which is
  already how annotation geometry is persisted) and **screen space** (the
  surface's CSS pixels). An image's pixel dimensions never enter into it.

Commands are safe to call before a renderer has mounted — they are no-ops, and
the queries answer `0`/`null` — so most plugins need no readiness gate at all.
When you do need one (anything positioning something over the image), await it:

```ts
import { whenRendererReady } from '@triiiceratops/plugin-sdk';
import type { PluginContext } from 'triiiceratops';

async function markCentre(context: PluginContext) {
    await whenRendererReady(context.viewerState);
    // The surface is sized, so this answers in real screen pixels.
    return context.viewerState.canvasToScreen({ x: 100, y: 200 });
}
```

`whenRendererReady` resolves `void`: there is no object to hand over. It means
"the renderer has a sized surface and accepts commands", and it is not the old
readiness helper renamed — that one promised a third-party viewer instance,
which no longer exists.

### Drawing into the image: the paint hook

`viewerState.registerPaintLayer({ id, order, draw })` registers a layer the
renderer calls **each frame, after the tiles are painted**, with the 2D context
and the transform the tiles were drawn with. Lower `order` draws first; layers
sharing an `order` are called in registration order. It returns an idempotent
unregister.

The context arrives already transformed, so a layer draws in the renderer's
**laid-out world** and cannot desync from the image the way an overlay
repositioned on an event can. That world is not canvas space: every canvas of the
manifest has a rect in it, placed beside its neighbours, and layout may have
resized that rect (facing pages are normalized to a shared height). So a layer
holding geometry in canvas space — which is how IIIF annotations are persisted —
converts it first:

- `frame.canvasToWorld(point, canvasId)` and
  `frame.canvasBoxToWorld(box, canvasId)` map canvas space into the space the
  context is in, and answer `null` for a canvas this frame did not lay out.
- `frame.canvases` gives each laid-out canvas's rect directly, for a layer that
  wants to draw a whole page rather than something on one.
- `frame.transform` carries the matrix as numbers for a layer that would rather
  work in device pixels.

```ts
import type { PaintFrame, PluginContext } from 'triiiceratops';

function markRegion(context: PluginContext, canvasId: string) {
    return context.viewerState.registerPaintLayer({
        id: 'my-plugin:region',
        order: 10,
        draw: (ctx: CanvasRenderingContext2D, frame: PaintFrame) => {
            // The region in the Canvas's own coordinates — as an annotation
            // stores it — mapped into the space the context is in.
            const box = frame.canvasBoxToWorld(
                { x: 100, y: 200, width: 300, height: 400 },
                canvasId,
            );
            if (!box) return; // that canvas is not on screen this frame

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 / frame.transform.scale; // 2 device px, any zoom
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        },
    });
}
```

Registering before a renderer mounts is fine: the layer is kept and drawn when
one arrives, and it survives a remount. A layer that throws is reported once and
skipped; it never stops the renderer painting.

**Painted pixels are invisible to assistive technology.** They have no focus, no
accessible name, and no keyboard reach — and an automated scan cannot report a
missing element. Anything a reader must perceive or operate needs a DOM element
beside the picture: the canvas paints pixels, a parallel DOM layer carries the
focusable, labelled targets, both projected from one geometry. Core's own
annotation shape overlay works exactly that way.

### Capabilities

`requiredCapabilities` is normally `[]`. Capability negotiation exists for
genuinely optional runtime features, and core's 1.0 line declares none: a plugin
states which *core* it works with through `coreRange`. A plugin requiring a
capability the host does not declare fails activation — which is what happens to
anything still asking for the retired `osd@5`.

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
