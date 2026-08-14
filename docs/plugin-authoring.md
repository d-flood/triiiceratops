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

**Bundle your own Svelte runtime** (or whichever framework you build the UI in).
Core does publish a curated set of `svelte/internal/client` helpers on
`window.Triiiceratops`, and the first-party `@triiiceratops/plugin-av` consumes
them instead of shipping a second copy — but `svelte/internal` is private,
unversioned API, and that plugin can only rely on it because it is built and
released from core's own repository at core's own Svelte version, and pins
`coreRange` to an exact core version to say so. A plugin released on its own
schedule has no such guarantee and would break on the first skew, so bundling is
the right answer for everybody outside this repository. Your IIFE then loads in
any order relative to core's.

What makes the arrangement safe on the inside is a build gate, and it is worth
knowing why it has to exist. The list core publishes is **curated** — 31
`svelte/internal/client` helpers under `svelteInternal`, alongside `mount`,
`unmount` and `getContext`, for 34 names in all — never `export *`, because
re-exporting the namespace wholesale defeats tree-shaking and was measured at
+8,837 gzip on core. A plugin that compiles to a
helper outside that list does not fail to build and does not fail its unit tests
(those mount against the real `svelte/internal`); it throws at mount in a real
browser. One bare text child of a component — `<Button>CC</Button>`, which
compiles to `next()` — did exactly that once, and killed a whole transport while
every gate stayed green. So `check-shared-runtime.mjs` now reads the helpers the
*built* bundle references back out of the minified output and fails the build if
any of them is unpublished.

Know its limits before you lean on it. It is a **regex scan over minified
text**, not a parse, and that cuts both ways. It reported a clean pass on every
helper it was ever given until a fix to how it escapes minified locals: a local
the minifier had spelled with a `$` matched nothing, and a gate that resolves no
locals resolves no helpers — which has exactly the shape of a pass. In the other
direction it cannot tell code from data, so a literal `.svelteInternal.<name>`
inside a string will be reported as a reference that is not one. If you are
considering the same trick in your own monorepo: the gate is not optional
decoration, and it is what makes a private-API dependency reviewable at all —
but it is a heuristic backed by a real browser mount, not a proof, and it is
worth mounting the thing before you believe it.

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

### Publishing state for hosts to command you through

Selectors let *you* read the viewer. **Published state** is the other direction:
one object your activation exposes so the host application, a framework wrapper,
or another plugin can command your plugin — the parity rule, one level down. A
plugin that renders a panel and nothing else needs none of this. A plugin whose
behavior a host would reasonably want to drive from its own chrome does: the
first-party `@triiiceratops/plugin-av` publishes playback (`play`, `pause`,
`seek`, the playhead) so an application's own transport can control the viewer's
media.

`context.publishState(state)` publishes it. An activation publishes **at most
one** object — publishing again supersedes the previous one — and the publication
lives exactly as long as the activation: core retires it on deactivation, on a
failure, and while a retry is in flight, so a host asking during any of those
gets `null` rather than a stale object. Do not export the state from your package
for a host to import; the viewer is the only way in.

```ts
import type { PluginContext, PublishedState } from 'triiiceratops';

interface CounterState extends PublishedState {
    increment(): void;
    readonly count: number;
}

function publish(context: PluginContext) {
    let count = 0;
    const listeners = new Set<() => void>();

    const state: CounterState = {
        // Commands maintain the invariants; nothing outside writes `count`.
        increment() {
            count += 1;
            for (const listener of listeners) listener();
        },
        get count() {
            return count;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Every member above, classified. The seam's own members are not.
        stateInventory: { increment: 'command', count: 'observable' },
    };

    context.publishState(state);
}
```

**Every member is classified**, in a `stateInventory` table keyed by member name,
using the same taxonomy the viewer's own state follows:

- `command` — a method that maintains your invariants. Anything a host can
  change is a command; there is no writable property on a published state.
- `observable` — a value that notifies through `subscribe`. Notifications are
  **batched and payload-free**, exactly as the viewer's are: a notification means
  "something changed, read what you need."
- `queryOnly` — a high-frequency value that deliberately does *not* notify,
  because notifying per change would be a storm. A playhead is the archetype: it
  moves sixty times a second, and a host reads it on the finer
  `subscribeFrame` cadence or on its own schedule.

`subscribe`, the optional `subscribeFrame`, and `stateInventory` itself are the
seam, not state, so they are not classified. Any *other* member missing from the
table fails conformance — including inherited accessors and methods, if your
state is a class instance.

A published state is a `SelectorSource`. The selector runtime's only
requirements on its source are `subscribe`, an optional finer-cadence
`subscribeFrame`, and synchronous reads — so the **same** runtime that backs
viewer-state selectors works over a published state unchanged, and a host can
build one with `createSelectorRuntime(published)` from the
`triiiceratops/selectors` entry point. There is no second reactivity system to
learn, and a `frame`-cadence projection over a `queryOnly` member is served from
`subscribeFrame` when you supply one.

What is generalized is the runtime, not the ready-made bindings: `context.selectors`
is typed `ViewerSelectors` and projects viewer state only, and React's and Vue's
`useViewerSelector` take a viewer handle with no published-state overload.
(Svelte needs no selector API at all — see [the Svelte guide](svelte.md).) So a
host selecting over a published state instantiates the runtime itself rather
than reaching for a wrapper hook.

Hosts reach it with `viewerState.getPluginState(pluginId)`, which returns
`unknown` — core cannot know your type — so ship a small typed accessor beside
your plugin that narrows it, and export only the *type* of the state:

```ts
import type { PublishedState } from 'triiiceratops';

interface CounterState extends PublishedState {
    increment(): void;
    readonly count: number;
}

export function getCounterState(viewerState: {
    getPluginState(pluginId: string): unknown;
}): CounterState | null {
    const published = viewerState.getPluginState('counter');
    // Structural, not `instanceof`: the object crossed a package boundary.
    return published !== null &&
        typeof published === 'object' &&
        typeof (published as CounterState).increment === 'function'
        ? (published as CounterState)
        : null;
}
```

Declare `published-state` in `requiredCapabilities` if you call `publishState`.
`runPluginConformance` then verifies that whatever your plugin publishes declares
a `stateInventory`, that the table classifies every member and names only real
ones, and — as a spot check — that *some* subscriber is woken when an observable
member's value changes across a flush. Read that last one narrowly: it proves
only that a notification arrived, not which member it was for, and the kit does
not check that you declared the capability at all, since its own harness
activates with `requiredCapabilities: []`. A plugin that publishes nothing passes
these checks vacuously. Hosts that want to render controls only
while a plugin is live can watch the set of published states, which is itself a
notifying member of the viewer's inventory.

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
  `fitBounds(box)`, `fitCanvas()`, `setImageAdjustments({ ... })`, and
  `setViewportInset({ ... })`.
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

#### Reserving space for your own UI: the viewport inset

If your plugin floats UI over the image — a filmstrip along the bottom, an
inspector down one side — a fit will happily centre the folio *behind* it.
`viewerState.setViewportInset({ bottom: 200 })` reserves edges of the surface, in
screen pixels, so fits frame into what is left; `resetViewportInset()` returns
every edge to zero, and `viewportInset` reads the current set back. Edges you
leave out keep their value, exactly as with `setImageAdjustments`.

```ts
import type { PluginContext } from 'triiiceratops';

function filmstrip(context: PluginContext, height: number) {
    const { viewerState } = context;

    viewerState.setViewportInset({ bottom: height });
    // Setting it does not move the image. Ask for the re-frame yourself, if you
    // want one — most of the time you do not, because the reader may have zoomed
    // in deliberately and being yanked back to the whole page is a surprise.
    viewerState.fitCanvas();

    return () => {
        viewerState.resetViewportInset();
        viewerState.fitCanvas();
    };
}
```

Four things to know about it:

- **Only fits are affected** — `fitCanvas`, `fitBounds`, and canvas navigation.
  Pan, zoom, `canvasToScreen`/`screenToCanvas`, and the viewport queries are all
  about the whole surface and stay that way. That is deliberate: your overlay
  layer spans the full surface, so an inset that shifted the coordinate mapping
  would misplace every marker on it, yours included.
- **The zoom range is not affected either.** How far in and out a reader may zoom
  is measured against the whole surface, so reserving space never lowers the zoom
  ceiling under the reader's fingers and never snaps a reader who was already at
  it back out.
- **Setting an inset does not move the current view.** The *next* fit uses it.
  Issue a fit yourself when you want the image re-framed, as above.
- **One inset per viewer.** A second plugin calling `setViewportInset` replaces
  yours; there is no per-plugin reservation and no maximum-per-edge merge. In
  practice one plugin owns the viewer's chrome, so this is a constraint to know
  rather than one to work around.

**Do not reserve more than half of an axis.** Up to half the surface's width or
height per axis, a fit lands exactly centred in what is left. Past that the
viewer's own guarantees take over and the inset is honoured in direction but not
in full: the reader's zoom floor — half the scale at which a whole canvas fits —
stops the fit from shrinking any further, and the pan constraint stops the framed
box from being lifted past the edge of the world, which in continuous mode shows
up on the first and last folio of the strip. Both of those outrank a plugin's
request for space on purpose, because the alternative is a plugin that can
collapse the viewer's zoom range. If your UI genuinely needs more than half the
surface, it wants to be a panel in the viewer's chrome rather than an overlay with
an inset.

A negative or non-finite edge is refused whole and logged — it is an author error
at any window size. An edge given as `undefined` is treated as omitted, so
`setViewportInset({ bottom: open ? 200 : undefined })` leaves the bottom edge
alone rather than being refused. An inset too large for the *current* window is
neither: the axis with no room left silently falls back to the full surface, so a
reader can always zoom out far enough to see a whole canvas.

`panTo` deliberately aims at the middle of the **surface**, not of the inset, so
that it stays the exact inverse of `viewportCentre`. Aim it yourself in one line
when you need to — half the inset's asymmetry, converted to canvas space with
`viewportScale`:

```ts
import type { PluginContext, ViewportPoint } from 'triiiceratops';

function panToVisibleCentre(context: PluginContext, target: ViewportPoint) {
    const { viewportInset: inset, viewportScale: scale } = context.viewerState;
    if (!scale) return; // no sized surface yet

    context.viewerState.panTo({
        x: target.x - (inset.left - inset.right) / 2 / scale,
        y: target.y - (inset.top - inset.bottom) / 2 / scale,
    });
}
```

### A tap on the image

A **single tap** is the one gesture the viewport does not consume — it never
zooms — and `viewerState.subscribeSurfaceTap(listener)` is how a plugin hears it,
with the point in screen space. It arrives already filtered by the renderer's
single arbitration point: never for a drag, never for a pinch, and never for a
gesture some other consumer had claimed. Deciding *what* was tapped is yours,
from geometry you already hold, projected with `canvasToScreen` — which is
exactly what core's own annotation overlay does to select an annotation.

```ts
import type { PluginContext } from 'triiiceratops';

function watchTaps(context: PluginContext, onCanvasPoint: (point: { x: number; y: number }) => void) {
    // Returns an idempotent unsubscribe; a listener survives a renderer remount.
    return context.viewerState.subscribeSurfaceTap((point) => {
        const canvasPoint = context.viewerState.screenToCanvas(point);
        if (canvasPoint) onCanvasPoint(canvasPoint);
    });
}
```

### Which canvases are on screen

`viewerState.visibleCanvasIds` is the canvases the reader is actually looking at,
in layout order — one canvas in `individuals`, the **whole spread** in `paged`,
and the folios the viewport meets in `continuous`. It is observable state that
core writes and republishes when the set *changes*, not per frame, so it is safe
to subscribe to. Read `annotatableCanvasIds` for the same list with a fallback to
the current canvas before a renderer has answered, and with every canvas under a
**canvas claim** removed — the claimant owns what is rendered there, so core has
no painting of its own for a comment to be anchored against. Its array identity
is stable while the ids are unchanged, so it is safe to hand straight to a React
`getSnapshot`.

Prefer it to `canvasId` for anything drawn over the image. `canvasId` is the
canvas last **navigated** to, which in continuous mode is not what is on screen
after a scroll — core's own annotation surfaces read the visible set for exactly
that reason, and geometry then goes through `canvasToScreen(point, canvasId)` per
canvas, because two pages of a spread sit at different offsets.

The annotation core selects this way is `viewerState.activeAnnotationId`
(`setActiveAnnotationId(id | null)`, which clears when handed the id already
selected). It is the **selection**, notifying like any command state, and it is
distinct from `hoveredAnnotationId`: a selection persists after the pointer has
moved on, which is why the panel keeps its row marked and the connector line
stays drawn. Neither of them changes what is visible — that is
`visibleAnnotationIds`.

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

### Putting DOM on the image: overlay layers

An **overlay layer** is where that parallel DOM lives.
`viewerState.registerOverlayLayer({ id, mount })` asks core for a container over
the image; core creates it, places it in the viewer's stage beside the renderer,
and calls your `mount` with it — the same `(container) => cleanup` thunk your
panels already use. It returns an idempotent dispose, so releasing it from your
mount cleanup and from a teardown path is safe.

**Id your layer `` `${context.surface.id}:<name>` ``** — the same convention your
chrome ids follow. It is required, not advisory: an id whose prefix names no plugin
the viewer knows is refused and registers nothing, as is a duplicate id. Naming
your plugin is what makes ids collision-free between plugins, and it lets the
viewer release your layers if your plugin is deactivated without them having been
disposed. Do not rely on that: release the layer from your `view.mount` cleanup,
alongside your styles. Doing both is safe, because the dispose is idempotent.

**Derive the prefix from `context.surface.id`; do not hardcode it.** The id the
viewer knows you by is not your package name: it is your declared `uiId` if you
have one, and otherwise your package name with every run of characters that is not
`[A-Za-z0-9_-]` collapsed to a single `-` (`@scope/plugin-notes` →
`scope-plugin-notes`). `context.surface.id` is that value, verbatim, and it is the
only string the check accepts — a literal `'my-plugin:markers'` is refused unless
`my-plugin` happens to be your `uiId`.

A refusal is not silent, but it is not a thrown error either: it arrives on the
host's structured `viewererror` channel with `scope: 'plugin'` and
`code: 'overlay-layer-refused'`, and in the console when the viewer runs with
`debug: true`. Your `mount` is simply never called, so the symptom you will see
first is a layer that renders nothing.

**The container's origin is `canvasToScreen`'s origin.** That is a published
contract, not a coincidence: a projected point is already the container's own
coordinates, so no rect correction, no `getBoundingClientRect`, no offset
arithmetic.

**The container itself is `display: contents`, so it has no box of its own**: its
`clientWidth`/`clientHeight` and its `getBoundingClientRect()` are all zero, and
it is the wrapper core puts it in that is the positioning box your absolutely
positioned children resolve against. Position children against
`canvasToScreen` output as above; if you need the visible extent (to clip a
backing store, say), walk up from the container to the first ancestor that has a
box rather than measuring the container.

```ts
import type { PluginContext } from 'triiiceratops';

function markPoint(context: PluginContext, canvasId: string) {
    const at = { x: 600, y: 450 }; // canvas space, as an annotation stores it

    return context.viewerState.registerOverlayLayer({
        // The prefix is the id the viewer knows this plugin by — never a literal.
        id: `${context.surface.id}:markers`,
        mount: (container: HTMLElement) => {
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.textContent = 'Analysis point 1';
            // The layer is transparent to pointer events; this child opts in.
            pin.style.cssText =
                'position:absolute;pointer-events:auto;transform:translate(-50%,-50%)';
            container.append(pin);

            const place = () => {
                const point = context.viewerState.canvasToScreen(at, canvasId);
                // `null` means that canvas is not laid out — one honest branch.
                pin.hidden = point === null;
                if (point) {
                    pin.style.left = `${point.x}px`;
                    pin.style.top = `${point.y}px`;
                }
            };

            place();
            // The `frame` cadence: the image moved. This write lands in the same
            // frame the tiles are painted in, so the pin does not trail them.
            const stop = context.viewerState.subscribeFrame(place);

            return () => {
                stop();
                pin.remove();
            };
        },
    });
}
```

**`subscribeFrame` means "the image moved" — nothing else.** When *your own*
state changes (a marker added, a selection moved, your data reloaded), re-place on
your own `requestAnimationFrame`: the viewer has no reason to produce a frame for
something that happened on your side, so waiting for one can wait forever.

**Pointer events pass through by default.** The container is
`pointer-events: none` so that adding a layer cannot cost the reader panning and
pinching; each element you want operable opts in with `pointer-events: auto`, as
the pin above does. The trap to know about: if you draw a **full-surface SVG** —
connector lines between a panel row and your markers, for instance — that SVG
covers the whole image, so leave it `pointer-events: none` and opt in only the
individual shapes inside it. Otherwise it silently swallows every gesture on the
image. Events on your layer never contend with the renderer: it binds its pointer
handling inside its own root, and your layer is a sibling of that root.

**The container is created once and removed once.** It is not remounted when the
renderer remounts, so a manifest change leaves your DOM and your state intact —
which also means clearing content that was scoped to the old manifest is yours to
do, since core cannot know which of your DOM that is. Registering before any
renderer has mounted is fine; the container exists regardless, and
`canvasToScreen` answers `null` until there is a layout.

Layers stack in **registration order**, and all of them below the viewer's own
annotation shapes — those are focusable targets carrying the viewer's accessible
names, and covering them would break that silently. If you want primacy, hide the
viewer's shapes through the annotation visibility API and draw your own. There is
no ordering field: two plugins cannot coordinate one, and within your own plugin
one container with `z-index` on its children is less work than two layers.

**Choosing between an overlay layer and the paint hook is the accessibility
rule**, not a performance judgement: anything a reader must perceive or operate is
DOM in an overlay layer, because painted pixels have no focus, no accessible name,
and no keyboard reach. Reach for the paint hook for decoration, or for a second
rendering of geometry your DOM already carries — a heat map under your pins, a
thousand tick marks no one clicks. Both hooks exist because the substrates differ,
not because one is on its way out ([ADR
0016](adr/0016-overlay-layers-are-dom-and-the-paint-hook-stays.md)).

**"Decoration" does not always mean "the paint hook", though.** The paint hook
draws into the *renderer's* canvas, and every overlay layer stacks above it — so
if your decoration belongs on top of opaque DOM you put there yourself, painting
it through the hook draws it correctly and leaves it invisible behind your own
box. `@triiiceratops/plugin-av`'s waveform is that case: it sits over an opaque
media stage, so it is a `<canvas>` nested inside the overlay layer's timeline
lane rather than a paint layer. ADR 0016's rule is about the DOM/pixels split,
not about which API the pixels come from; the operable geometry is still DOM
(a real slider and the lane's own tap handling), and the pixels are still
decoration over it.

### Taking over a canvas: the canvas claim

Some canvases describe content core cannot display — a film, a sound recording, a
3D model. Core is honest about them: it paints no pixels, asks for nothing over
the network, and shows a labelled "this viewer cannot display this" box over the
canvas's rect, with a glyph rather than a broken picture in the thumbnail strip.
That is the **unsupported presentation**.

`viewerState.claimCanvas(canvasId, pluginId)` takes that canvas's non-image
content over. It returns an idempotent release, and its effect is to suppress the
unsupported presentation and its strip glyph for that canvas, leaving a clean box
for you to render into through an overlay layer, the paint hook, or both. It
carries no payload: no render callback, no options. Core goes on painting the
canvas's *image* bodies through the tile pipeline (which is what makes a
composite image+video canvas compose), and layout, navigation, residency, and
`canvasToScreen` never learn a claim exists.

The one thing beyond the placard that a claim moves is the annotation scope: a
claimed canvas leaves `annotatableCanvasIds`, because core is no longer painting
anything there for a comment to be anchored against. Every annotation surface
reads that list — the panel, the overlays, and the annotation editor's drawing
layer — so the reader is not offered a rectangle tool over your video.

**Pass `context.surface.id` as `pluginId` — never a literal, and never your
package name.** It is the id the viewer knows you by, the same value your overlay
layer ids are prefixed with, and it is checked: a claim naming an id no plugin of
this viewer answers to is **refused**, on the `viewererror` channel with
`scope: 'plugin'` and `code: 'canvas-claim-refused'`. The check is there because
that id is what releases your claim if your plugin goes away without releasing it
itself; a claim under a name nothing will ever unregister would outlive your
activation silently, leaving a canvas with no placard and nothing rendering over
it for the rest of the session.

**One claimant per canvas.** A second claim on a canvas somebody already holds is
refused through the same channel and the first claimant keeps it — claiming is
not last-writer-wins, so a plugin cannot take a canvas another one is already
rendering into. A refused call still hands back a dispose, so you never have to
branch on whether your claim was accepted; it is simply a no-op.

**Release from your own `view.mount` cleanup.** Core releases whatever you left
behind when your plugin is deactivated, retried, or fails to mount — the same
backstop your overlay layers get — and doing both is safe.

A claim against a canvas id the current manifest does not carry is **inert and
kept**, and applies if that id appears later: you claim from inside your mount,
which may well run before the manifest you care about is loaded.

To decide *which* canvases are yours, ask core's own classifier rather than
typing bodies yourself — `isUnsupportedCanvas(canvas)` is exactly the question
core answers when it decides to show the placard, so the two cannot drift apart.
`isImageBody` and `paintingBodyAlternatives` are exported beside it for when you
need the individual bodies (which medium, which Choice alternative).

```ts
import { isUnsupportedCanvas, type PluginContext } from 'triiiceratops';

function claimMine(context: PluginContext) {
    const releases = context.viewerState.canvases
        .filter((canvas) => isUnsupportedCanvas(canvas))
        .map((canvas) =>
            context.viewerState.claimCanvas(
                canvas.id ?? canvas['@id'],
                // The id the viewer knows this plugin by — never a literal.
                context.surface.id,
            ),
        );

    return () => releases.forEach((release) => release());
}
```

Declare `canvas-claim` in `requiredCapabilities` if you call this, so your plugin
fails closed on a core that predates the seam instead of activating and rendering
over a placard it cannot suppress.

### Capabilities

`requiredCapabilities` is normally `[]`. Capability negotiation exists for
genuinely optional runtime features, not for versions: a plugin states which
*core* it works with through `coreRange`. Core declares three capabilities today:

- `canvas-claim` — `ViewerState.claimCanvas`, the seam a plugin owning a
  canvas's non-image content builds on.
- `published-state` — `PluginContext.publishState`, which a host reads back
  through `viewerState.getPluginState(pluginId)`.
- `shared-svelte-runtime` — the curated Svelte helpers core publishes on
  `window.Triiiceratops`. A third-party plugin bundles its own runtime and must
  not declare this.

Declare one only if your plugin calls that seam, so it fails closed on a viewer
that predates it instead of silently doing nothing. A plugin requiring a
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
