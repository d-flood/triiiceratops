---
icon: lucide/wrench
description: "How Triiiceratops configuration and state management work, with the same model across React, Vue, Svelte and plain-HTML hosts."
---

# Configuration & State Management

Triiiceratops provides a flexible configuration system that works consistently
across every host — React, Vue, Svelte, or plain HTML.

Every host shares the same `ViewerConfig` object, documented once below, and
every host can load manifest JSON directly and supply a `searchProvider`. There
are no host-specific viewer inputs.

Pick your stack's tab in any example below and the choice follows you across the
site. The React, Vue, and Svelte tabs use those frameworks' components, which are
the supported integration path — see the [React](react.md), [Vue](vue.md), and
[Svelte](svelte.md) guides. The HTML tab is the custom element, documented in
[any framework](integration.md).

## Configuration Object

<!-- Absolute URL, not a relative link: the playground is published at a stable,
unversioned path (see docs-publish.mjs), outside the per-version documentation
directory this page is served from. -->
!!! tip "Interactive Configuration"

    You can experiment with these settings in the [Live Demo](https://triiiceratops.org/demo/){target=_blank}.
    Open the settings menu (gear icon), tweak the configuration, then click
    **"Copy Config"** to get the JSON for your project.

The viewer accepts a configuration object to customize the UI and behavior. Below is the structure of the configuration object with default values:

```typescript
interface ViewerConfig {
    // Top-level UI Toggles
    locale?: string; // Preferred locale for IIIF language maps
    showCanvasNav?: boolean; // Default: true
    viewingMode?: 'individuals' | 'paged' | 'continuous'; // Default: 'individuals'
    viewingDirection?:
        | 'left-to-right'
        | 'right-to-left'
        | 'top-to-bottom'
        | 'bottom-to-top';
    pagedViewOffset?: boolean; // Default: true (Offset paged view by one canvas)
    preserveCanvasScale?: boolean; // Default: false (Preserve authored IIIF canvas scale in multi-canvas layouts)
    showZoomControls?: boolean; // Default: true
    transparentBackground?: boolean; // Default: false

    // Chrome layout
    controls?: 'split' | 'unified'; // Default: 'split' (toolbar separate vs embedded in nav)

    nav?: {
        style?: 'docked' | 'floating'; // Default: 'docked' (flush vs inset island)
        edge?: 'top' | 'bottom'; // Default: 'bottom' (which horizontal edge)
        align?: 'start' | 'center' | 'end'; // Default: 'center' (alignment along the edge; inert while a plugin registers transport chrome — see below)
    };

    // Toolbar Settings
    showToggle?: boolean; // Default: true (Toolbar toggle visible)
    toolbarOpen?: boolean; // Default: false (Toolbar expanded)

    toolbar?: {
        side?: 'left' | 'right'; // Default: 'left' (which vertical side, split mode)
        anchor?: 'top' | 'center'; // Default: 'center' (a top anchor claims the top edge)
        showSearch?: boolean; // Default: true
        showGallery?: boolean; // Default: true
        showAnnotations?: boolean; // Default: true
        showFullscreen?: boolean; // Default: true
        showInfo?: boolean; // Default: true
        showViewingMode?: boolean; // Default: true
        showStructures?: boolean; // Default: true (only visible when manifest has structures)
        showCollection?: boolean; // Default: true (only visible when a collection is loaded)
    };

    // Plugin UI Settings (keyed by plugin id — the SDK `uiId`)
    plugins?: {
        [pluginId: string]: {
            visible?: boolean; // Default: true (Toolbar button visible)
            open?: boolean; // Default: false (Plugin panel open)
            showCloseButton?: boolean; // Default: true
            target?: 'panel' | 'flyout'; // Override where the plugin renders
            // Override the docked panel's position; ignored when target is 'flyout'
            position?: 'left' | 'right' | 'bottom' | 'overlay';
        };
    };

    // Thumbnail Gallery Settings
    gallery?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
        dockPosition?: 'left' | 'right' | 'top' | 'bottom'; // Default: 'bottom'
        expanded?: boolean; // Default: false (fills the center column as a grid; implies open)
        size?: number; // Default: 100 (strip height when top/bottom, rail width when left/right)
    };

    // Sidebar Stack Settings
    leftPanelWidth?: string; // Default: '320px'
    rightPanelWidth?: string; // Default: '320px'

    // Search Panel Settings
    search?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
        position?: 'left' | 'right'; // Default: 'right'
        query?: string; // Programmatically set search query
    };

    // Annotations Settings
    annotations?: {
        open?: boolean; // Default: false (Sidebar panel, opening also shows annotations)
        showCloseButton?: boolean; // Default: true
        position?: 'left' | 'right'; // Default: 'right'
    };

    // Information / Metadata Settings
    information?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
        position?: 'left' | 'right'; // Default: 'right'
        showButton?: boolean; // Default: true (canvas info button in the nav bar, shown when the current canvas has metadata)
    };

    // Structures / Table of Contents Settings
    structures?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
    };

    // Collection Navigation Settings
    collection?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
    };

    // Network Requests
    requests?: {
        headers?: Record<string, string>; // Extra headers for manifest requests
        withCredentials?: boolean; // Use cookies/credentials
    };

    // Renderer tuning — a small, closed set (see "Renderer tuning" below)
    renderer?: {
        animationTimeConstant?: number;
        zoomPerClick?: number;
        zoomPerWheelNotch?: number;
        minPixelRatio?: number;
        byteBudget?: number;
        residencyMargin?: number;
        pyramidThreshold?: number;
        boxThreshold?: number;
    };

    // Marker styling for point annotations in the read-only overlay
    pointStyle?: {
        radius?: number; // Screen pixels; Default: 5
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
    };

    // Opt-in developer diagnostics. When true, viewer diagnostics are logged
    // through the core logger (prefixed `[triiiceratops]`). Actionable
    // failures always surface through `viewererror`/`pluginerror` regardless
    // of this flag.
    debug?: boolean; // Default: false
}
```

### Nav Alignment and Playback Controls

`nav.align` is **inert while a plugin has registered transport chrome** — the seam a
claimant of timed media uses to put playback controls in the control bar, which is
how [the AV plugin](plugin-av.md) gets its transport. The bar then spans its full
available width, because the seek bar's width is the precision a reader can aim
with, and a full-width bar has nowhere to align.

The setting is not deprecated and nothing is warned about: it resumes meaning the moment
the chrome deregisters. `nav.style`, `nav.edge`, the nav inset, and `controls` all go on
meaning exactly what they meant.

### Sidebar Panel Layout

Side panels are grouped into a left sidebar stack and a right sidebar stack. Each side has one width, controlled by `leftPanelWidth` and `rightPanelWidth`; individual built-in and plugin panels do not have their own width setting.

When multiple panels are open on the same side, they stack vertically. `search`, `annotations`, and `information` can be placed on either side with `position: 'left' | 'right'`. `structures` and `collection` currently render in the right sidebar stack.

### Plugin UI Control

Plugin UI can be controlled from the same `config` object used for built-in panes. Use each plugin's stable id as the key — the SDK `uiId` a `definePlugin` plugin declares (first-party plugins use `av`, `pdf-export`, `image-download`, `image-manipulation`):

```typescript
const config = {
    plugins: {
        'pdf-export': {
            visible: true,
            open: false,
        },
        'image-manipulation': {
            visible: false,
            open: false,
            target: 'flyout',
        },
        av: {
            position: 'right',
        },
    },
};
```

`visible` controls whether the plugin's toolbar button is rendered, `open` controls whether the plugin surface is expanded, `target` overrides where the plugin renders (`'panel'` or `'flyout'`), and `position` overrides where a docked panel opens (`'left' | 'right'` in that sidebar stack, `'bottom'` as a full-width band below the image, `'overlay'` floated over the image; ignored while the plugin's effective `target` is `'flyout'`, since a flyout anchors to its toolbar button rather than docking). All four apply reactively after mount, so a host can, for example, switch a plugin to a flyout on narrow viewports. See [controlling plugin UI at runtime](plugins.md#controlling-plugin-ui-at-runtime) for the per-framework code and a responsive example.

## Usage

In React, Vue, and Svelte, `config` is a normal typed **prop** on
`<TriiiceratopsViewer>`. When you drive the custom element directly it is a
**property** on the element (objects can't go through HTML attributes — see
[any framework](integration.md)).

Whichever host you use, treat `config` as immutable: **assign a new object** to
change it. Mutating nested keys on the existing object does not notify the
viewer, and in React and Vue the wrapper compares what you pass with one
uniform, one-level shallow equality, so an in-place mutation looks like no
change at all.

### Passing Configuration

=== "HTML"

    Inline HTML uses a **JSON string** in the `config` attribute:

    ```html
    <triiiceratops-viewer
      manifest-id="https://example.org/iiif/manifest.json"
      config='{"toolbar": {"side": "right"}, "gallery": {"open": true}}'
    ></triiiceratops-viewer>
    ```

    From JavaScript, prefer assigning a plain object to the `config` property:

    ```javascript
    const viewer = document.querySelector('triiiceratops-viewer');
    viewer.config = {
      toolbar: { side: 'left' },
      gallery: { dockPosition: 'right' }
    };
    ```

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';
    import type { ViewerConfig } from 'triiiceratops/react';

    // Hoisted (or `useMemo`d) so a parent re-render does not re-apply it.
    const config: ViewerConfig = {
        toolbar: { side: 'left' },
        gallery: { dockPosition: 'right' },
    };

    export function Reader() {
        return (
            <TriiiceratopsViewer
                manifestId="https://example.org/iiif/manifest.json"
                config={config}
                style={{ display: 'block', height: '600px' }}
            />
        );
    }
    ```

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { shallowRef } from 'vue';
    import { TriiiceratopsViewer, type ViewerConfig } from 'triiiceratops/vue';

    // shallowRef, not ref: the wrapper receives this exact object.
    const config = shallowRef<ViewerConfig>({
        toolbar: { side: 'left' },
        gallery: { dockPosition: 'right' },
    });
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="https://example.org/iiif/manifest.json"
            :config="config"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops/svelte';
      import 'triiiceratops/style.css';

      let config = $state({
        toolbar: { side: 'left' },
        gallery: { open: true }
      });
    </script>

    <TriiiceratopsViewer {config} manifestId="https://example.org/iiif/manifest.json" />
    ```

Driving the element directly: if you use `setAttribute('config', …)`, stringify
the object yourself, and assign a new `config` object for updates.

### Direct Manifest Data

To load a manifest from in-memory JSON instead of fetching by id, set
`manifestJson` alongside `manifestId` — the viewer uses the supplied JSON
directly and never fetches over HTTP.

=== "HTML"

    `manifestJson` is a property-based API — set it after the element
    upgrades, not as an inline attribute:

    ```javascript
    const viewer = document.querySelector('triiiceratops-viewer');
    viewer.manifestId = 'urn:example:manifest';
    viewer.manifestJson = {
      id: 'urn:example:manifest',
      type: 'Manifest',
      label: { none: ['Local manifest'] },
      items: []
    };
    ```

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';

    export function Reader({ manifestJson }: { manifestJson: object }) {
        return (
            <TriiiceratopsViewer
                manifestId="urn:example:manifest"
                manifestJson={manifestJson as Record<string, unknown>}
                style={{ display: 'block', height: '600px' }}
            />
        );
    }
    ```

    Keep the object's identity stable — a manifest rebuilt on every render is
    re-applied on every render.

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { shallowRef } from 'vue';
    import { TriiiceratopsViewer } from 'triiiceratops/vue';

    // shallowRef, not ref: a deep ref would hand the wrapper a reactive proxy.
    const manifestJson = shallowRef<Record<string, unknown>>({
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: [],
    });
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="urn:example:manifest"
            :manifest-json="manifestJson"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <TriiiceratopsViewer manifestId="urn:example:manifest" {manifestJson} />
    ```

    ```typescript
    // Only the props relevant to direct-manifest loading — the component
    // accepts more (config, plugins, theme, viewerState, and others),
    // documented in their own sections on this page.
    interface TriiiceratopsViewerProps {
      manifestId?: string;
      manifestJson?: Record<string, any>;
      searchProvider?: SearchProvider | null;
    }
    ```

This is useful when your app stores or assembles manifests locally.

### Reacting to State Changes

The viewer keeps its internal state in sync with the user's interactions (e.g.,
opening/closing panels, changing canvas). How you observe that depends on the
host:

- **React and Vue** — typed callbacks and emits for the notification channels,
  and `useViewerSelector()` for reactive reads of the live viewer state. The
  selector is usually what you want for rendering; the callbacks are for
  side effects outside your framework's state (a URL, analytics).
- **Custom element** — DOM events carrying a `ViewerStateSnapshot`, plus the
  element's getter-only `viewerState` bridge for direct reads and subscriptions.
- **Svelte** — a two-way bound `viewerState` prop.

#### Events (custom element)

- `statechange`: Fired when UI state changes (panels open/close, docking, etc.).
- `canvaschange`: Fired when the active canvas changes.
- `manifestchange`: Fired when a new manifest is loaded.

The event `detail` contains a `ViewerStateSnapshot`:

```typescript
interface ViewerStateSnapshot {
    manifestId: string | null;
    canvasId: string | null;
    currentCanvasIndex: number;
    showAnnotations: boolean;
    showInformationPanel: boolean;
    showThumbnailGallery: boolean;
    showSearchPanel: boolean;
    showStructuresPanel: boolean;
    toolbarOpen: boolean;
    searchQuery: string;
    isFullScreen: boolean;
    dockSide: string;
    viewingMode: 'individuals' | 'paged' | 'continuous';
    viewingDirection: 'left-to-right' | 'right-to-left'
        | 'top-to-bottom' | 'bottom-to-top';
    preserveCanvasScale: boolean;
    galleryExpanded: boolean;
}
```

=== "HTML"

    ```typescript
    viewer.addEventListener('statechange', (e) => {
      const state = e.detail;
      console.log('Gallery is open:', state.showThumbnailGallery);
      console.log('Current dock side:', state.dockSide);
    });
    ```

    You can use these events to sync your application's UI with the viewer, as
    demonstrated in `apps/demo/src/Demo.svelte`.

=== "React"

    Render from a selector; use the callback props for side effects.

    ```tsx
    import {
        TriiiceratopsViewer,
        useViewerHandle,
        useViewerSelector,
    } from 'triiiceratops/react';

    export function Reader() {
        const handle = useViewerHandle();
        const galleryOpen = useViewerSelector(
            handle,
            (state) => state.showThumbnailGallery,
        );

        return (
            <>
                <p>Gallery is {galleryOpen ? 'open' : 'closed'}</p>
                <TriiiceratopsViewer
                    handle={handle}
                    manifestId="https://example.org/manifest.json"
                    onStateChange={(snapshot) =>
                        console.log('Dock side:', snapshot.dockSide)
                    }
                    style={{ display: 'block', height: '600px' }}
                />
            </>
        );
    }
    ```

=== "Vue"

    Render from a selector; use the emits for side effects.

    ```vue
    <script setup lang="ts">
    import { useTemplateRef } from 'vue';
    import {
        TriiiceratopsViewer,
        useViewerSelector,
        type TriiiceratopsViewerInstance,
        type ViewerStateSnapshot,
    } from 'triiiceratops/vue';

    const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
    const galleryOpen = useViewerSelector(
        viewer,
        (state) => state.showThumbnailGallery,
    );

    const log = (snapshot: ViewerStateSnapshot): void =>
        console.log('Dock side:', snapshot.dockSide);
    </script>

    <template>
        <p>Gallery is {{ galleryOpen ? 'open' : 'closed' }}</p>
        <TriiiceratopsViewer
            ref="viewer"
            manifest-id="https://example.org/manifest.json"
            style="display: block; height: 600px"
            @state-change="log"
        />
    </template>
    ```

=== "Svelte"

    The Svelte component exports a `viewerState` prop for **two-way binding** —
    direct, reactive access to the internal state, no events needed:

    ```html
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops/svelte';
      import 'triiiceratops/style.css';

      // This will strictly mirror the internal state
      let state = $state();
    </script>

    <TriiiceratopsViewer manifestId="..." bind:viewerState={state} />

    <div>
      Gallery is: {state?.showThumbnailGallery ? 'Open' : 'Closed'}
    </div>
    ```

    If you change the bound configuration prop, the viewer updates. If the
    user interacts with the viewer (e.g., closes the gallery), the
    `viewerState` binding updates your local variable — a nice bonus of the
    native integration.

#### Selector cadence

A **selector cadence** is which notification wakes a projection. It applies
wherever the selector runtime does — `useViewerSelector()` in React and Vue, and
`triiiceratops/selectors` (`createSelectorRuntime`) for the custom element, the
plugin SDK, and any other host.

| Cadence | Woken by | Use it for |
| :-- | :-- | :-- |
| `state` (default) | the batched, payload-free viewer-state notification | everything in the [state inventory](#what-notifies) — canvas, manifest, panels, gallery, plugin UI |
| `frame` | the renderer's own animation events, **and** state notifications | the query-only viewport values: `viewportScale`, `viewportCentre`, `viewportBounds`, `containerSize` |

Those viewport values are read from the renderer on demand and are deliberately
**not** mirrored into viewer state: mirroring them would make the batched watcher
fire at animation framerate for every subscriber on the page, so one component's
zoom readout would tax every plugin. Cadence solves that with one option instead
([ADR 0011](adr/0011-selectors-choose-a-notification-cadence.md)).

`frame` is the *finer* cadence, never a coarser one: a frame-cadence projection
also wakes on state notifications, so it never serves a stale inventoried member
between animations. The frame ticker attaches lazily when a renderer surface
appears and detaches on teardown or replacement — there is no
`requestAnimationFrame` loop, and an idle viewer with no frame-cadence selector
costs nothing.

For the per-framework call, see the [React](react.md#selector-cadence) and
[Vue](vue.md#selector-cadence) guides; Svelte reads reactive members directly and
needs no selector at all.

#### What notifies

A `state`-cadence projection must read **inventoried** members — command state
and observable state. The checked-in
[state inventory](https://github.com/d-flood/triiiceratops/blob/main/packages/core/src/lib/state/state-inventory.ts)
is the authority on which members those are; every mutable member is classified
there, and an unclassified member fails CI.

Reading a **query-only** member at `state` cadence is the one selector mistake
that fails silently — the projection simply appears frozen, because the
viewport's scale, centre, and bounds change every frame and deliberately never
wake the batched watcher. With `config: { debug: true }` the runtime warns once,
names the member, and names the fix (`cadence: 'frame'`). Reading
`state.rendererReady` at `state` cadence is correct: that one is an inventoried
observable member, and it is how you wait for the viewport to be answerable at
all.

### Debug diagnostics

`debug` turns on developer diagnostics that are otherwise silent, because their
failure modes produce no error — just a viewer that quietly does the wrong thing:

- a property-tier prop re-assigned an implausible number of times (an unmemoized
  object prop in React or Vue);
- a handle or ref created and never passed to a viewer, so reads stay empty
  forever;
- a `state`-cadence projection that reads a query-only viewport value (above).

These are gated on `ViewerConfig.debug`, **not** on `NODE_ENV` — a production
build with `config: { debug: true }` logs them, and a development build without it
does not. Debug mode is **page-level**: passing `config: { debug: true }` to any
one viewer turns the warnings on for every viewer and wrapper on the page, and
the most recently applied `debug` value wins. A `config` that omits `debug`
entirely states no opinion, so a second viewer configured for something else
never silences the first. Pass `config: { debug: false }` to turn them back off.

Actionable failures always surface through `viewererror` / `pluginerror`
regardless of this flag.

## Building your own chrome

The viewer's chrome is **not composable**: you cannot supply your own components
for its toolbar, panels, or navigation, the component takes no children or slot
content, and there is no framework-agnostic chrome slot contract. This holds in
every host, wrappers included.

The supported answers, in order of how much you need:

1. **Configure the built-in chrome.** The `config` object above turns panels,
   buttons, the gallery, the toolbar side, and plugin surfaces on and off, and
   applies reactively after mount.
2. **Build your own controls outside the viewer**, driven by commands and
   selectors. This is a first-class path and the answer for a custom toolbar:
   hide the built-in chrome you are replacing, then drive the viewer yourself.
   Anything the viewer's own UI can do, a command can do — that is the parity
   rule, and the [state inventory](#what-notifies) records which command backs
   each member.
3. **Write a plugin.** UI that must render *inside* the viewer's chrome — in a
   docked panel or an anchored flyout — is what the
   [plugin SDK](plugin-authoring.md) is for. A plugin mounts into a plain
   `HTMLElement`, so you can render it with any framework and it stays
   framework-neutral.

A custom toolbar, replacing the built-in canvas navigation:

=== "HTML"

    ```ts
    import 'triiiceratops/element/register';
    import type { TriiiceratopsViewerElement } from 'triiiceratops';

    const el = document.querySelector<TriiiceratopsViewerElement>(
        'triiiceratops-viewer',
    )!;
    // Hide the built-in chrome you are replacing.
    (el as { config?: unknown }).config = {
        showCanvasNav: false,
        showToggle: false,
    };

    const previous = document.querySelector('button#previous')!;
    const next = document.querySelector('button#next')!;

    function bind(state: NonNullable<TriiiceratopsViewerElement['viewerState']>) {
        previous.addEventListener('click', () => state.previousCanvas());
        next.addEventListener('click', () => state.nextCanvas());
        // Batched, payload-free: "state changed — read what you need".
        return state.subscribe(() => {
            (previous as HTMLButtonElement).disabled = !state.hasPrevious;
            (next as HTMLButtonElement).disabled = !state.hasNext;
        });
    }

    el.addEventListener('viewerstateavailable', (event) => {
        bind((event as CustomEvent).detail);
    });
    if (el.viewerState) bind(el.viewerState);
    ```

=== "React"

    ```tsx
    import {
        TriiiceratopsViewer,
        useViewer,
        useViewerHandle,
        useViewerSelector,
        ViewerProvider,
    } from 'triiiceratops/react';

    // Hoisted, so the wrapper never re-applies it.
    const CONFIG = { showCanvasNav: false, showToggle: false };

    function MyToolbar() {
        const viewer = useViewer();
        const hasPrevious = useViewerSelector((state) => state.hasPrevious);
        const hasNext = useViewerSelector((state) => state.hasNext);
        const position = useViewerSelector(
            (state) => `${state.currentCanvasIndex + 1} / ${state.canvases.length}`,
        );

        return (
            <nav className="my-toolbar">
                <button
                    type="button"
                    disabled={!hasPrevious}
                    onClick={() => viewer?.previousCanvas()}
                >
                    Previous
                </button>
                <span>{position}</span>
                <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => viewer?.nextCanvas()}
                >
                    Next
                </button>
                <button type="button" onClick={() => viewer?.zoomIn()}>
                    Zoom in
                </button>
            </nav>
        );
    }

    export function Reader() {
        const handle = useViewerHandle();
        return (
            <ViewerProvider value={handle}>
                <MyToolbar />
                <TriiiceratopsViewer
                    handle={handle}
                    manifestId="https://example.org/manifest.json"
                    config={CONFIG}
                    style={{ display: 'block', height: '600px' }}
                />
            </ViewerProvider>
        );
    }
    ```

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { useTemplateRef } from 'vue';
    import {
        TriiiceratopsViewer,
        useViewer,
        useViewerSelector,
        type TriiiceratopsViewerInstance,
    } from 'triiiceratops/vue';

    const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
    const state = useViewer(viewer);
    const hasPrevious = useViewerSelector(viewer, (s) => s.hasPrevious);
    const hasNext = useViewerSelector(viewer, (s) => s.hasNext);
    const position = useViewerSelector(
        viewer,
        (s) => `${s.currentCanvasIndex + 1} / ${s.canvases.length}`,
    );

    // Hide the built-in chrome you are replacing.
    const config = { showCanvasNav: false, showToggle: false };
    </script>

    <template>
        <nav class="my-toolbar">
            <button
                type="button"
                :disabled="!hasPrevious"
                @click="state?.previousCanvas()"
            >
                Previous
            </button>
            <span>{{ position }}</span>
            <button type="button" :disabled="!hasNext" @click="state?.nextCanvas()">
                Next
            </button>
            <button type="button" @click="state?.zoomIn()">Zoom in</button>
        </nav>
        <TriiiceratopsViewer
            ref="viewer"
            manifest-id="https://example.org/manifest.json"
            :config="config"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer, type ViewerState } from 'triiiceratops/svelte';
        import 'triiiceratops/style.css';

        let viewerState = $state<ViewerState | undefined>();

        // Hide the built-in chrome you are replacing.
        const config = { showCanvasNav: false, showToggle: false };
    </script>

    <nav class="my-toolbar">
        <button
            type="button"
            disabled={!viewerState?.hasPrevious}
            onclick={() => viewerState?.previousCanvas()}
        >
            Previous
        </button>
        <span>{(viewerState?.currentCanvasIndex ?? 0) + 1}</span>
        <button
            type="button"
            disabled={!viewerState?.hasNext}
            onclick={() => viewerState?.nextCanvas()}
        >
            Next
        </button>
    </nav>

    <div style="height: 600px;">
        <TriiiceratopsViewer
            bind:viewerState
            {config}
            manifestId="https://example.org/manifest.json"
        />
    </div>
    ```

## Programmatic Search

You can trigger a search programmatically by setting the `search.query` property in the configuration. This allows you to integrate external search bars or predefined queries.

Hosts that hold the live viewer state can instead call the `search(query)`
command directly — React and Vue reach it through `useViewer()`, the custom
element through its `viewerState` bridge, Svelte through `bind:viewerState`.

Any host can also provide a `searchProvider` when the search source is local
application state rather than a manifest-declared IIIF Search service.

=== "HTML"

    ```html
    <triiiceratops-viewer
      id="my-viewer"
      manifest-id="..."
    ></triiiceratops-viewer>

    <script>
      const viewer = document.getElementById('my-viewer');

      function search(query) {
        // Assign a new config object with the new query
        viewer.config = {
          search: {
            open: true,
            query: query
          }
        };
      }
    </script>
    ```

=== "React"

    Call the command through the handle — no config round trip needed:

    ```tsx
    import {
        TriiiceratopsViewer,
        useViewer,
        useViewerHandle,
    } from 'triiiceratops/react';

    export function Reader() {
        const handle = useViewerHandle();
        const viewer = useViewer(handle);
        return (
            <>
                <button type="button" onClick={() => void viewer?.search('lorem')}>
                    Search
                </button>
                <TriiiceratopsViewer
                    handle={handle}
                    manifestId="https://example.org/manifest.json"
                    style={{ display: 'block', height: '600px' }}
                />
            </>
        );
    }
    ```

=== "Vue"

    Call the command through the template ref:

    ```vue
    <script setup lang="ts">
    import { useTemplateRef } from 'vue';
    import {
        TriiiceratopsViewer,
        type TriiiceratopsViewerInstance,
    } from 'triiiceratops/vue';

    const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
    const search = (query: string): void => void viewer.value?.state?.search(query);
    </script>

    <template>
        <button type="button" @click="search('lorem')">Search</button>
        <TriiiceratopsViewer
            ref="viewer"
            manifest-id="https://example.org/manifest.json"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script>
      let config = $state({
        search: {
          open: false,
          query: ''
        }
      });

      function handleSearch(term) {
        config.search.open = true;
        config.search.query = term;
      }
    </script>

    <TriiiceratopsViewer {config} ... />
    ```

The viewer does **not** write user interactions back to your external `config`
object, in any host. If the user clears the search in the viewer, your `config`
still has the old query unless you reset it — read the viewer's own state (a
selector, the `viewerState` bridge, or `bind:viewerState`) when you need to know
where it actually is.

## Custom Search Providers

`searchProvider` supplies search results from host application code. It is
available in **every** host — the React wrapper's `searchProvider` prop, the Vue
wrapper's `search-provider` prop, the custom element's `searchProvider` property,
and the Svelte component's `searchProvider` prop.

`searchProvider` is a callback-based alternate search source. It is not a way to declare a IIIF Search service URI, inject a missing service into a manifest, or override the manifest's service metadata. Use normal manifest `service` declarations for traditional IIIF Content Search endpoints.

The context hands you the manifest and its canvases as **raw IIIF JSON**, v2 or v3 as authored — see [the canvas contract](plugin-authoring.md#the-canvas-contract) for the version-neutral helpers that read them.

```typescript
type SearchProvider = (
    query: string,
    context: {
        manifestId: string;
        /** Raw IIIF Manifest JSON — v2 or v3 as authored. */
        manifestJson: any;
        /** The active sequence's canvases, as raw IIIF Canvas JSON. */
        canvases: any[];
        canvasId: string | null;
    },
) => Promise<
    Array<{
        canvasIndex: number;
        canvasLabel: string;
        hits: Array<{
            type: 'hit' | 'resource';
            before?: string;
            match: string;
            after?: string;
            bounds?: number[] | null;
            allBounds?: number[][];
        }>;
    }>
>;
```

`before`, `match` and `after` are **plain text**. The search panel renders them
as text nodes, so any markup you return is displayed as visible characters
rather than interpreted — a search service cannot inject elements or script into
the host page.

The one thing the viewer does interpret is the highlight delimiter. Wrap the
matched term in `<mark>…</mark>`, literally or entity-encoded as
`&lt;mark&gt;…&lt;/mark&gt;`, and the panel renders a real `<mark>` element
around that run.

Only the **bare, lowercase** tag is a delimiter. `<mark class="hit">`, `<MARK>`
and any other variation are excerpt text, and now render as visible characters —
so emit the tag exactly as spelled above.

Because a service that escapes its excerpt escapes the surrounding text too, the
five basic entities (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`) are decoded in each
run before display, so `AT&amp;T` reads as `AT&T` rather than showing the entity.
Exactly one level comes off, so `&amp;lt;mark&amp;gt;` displays as the literal
text `&lt;mark&gt;` and highlights nothing.

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';
    import type { SearchProvider } from 'triiiceratops/react';

    const searchProvider: SearchProvider = async (query) => [
        {
            canvasIndex: 0,
            canvasLabel: 'Page 1',
            hits: [{ type: 'hit', before: '', match: query, after: '' }],
        },
    ];

    export function Reader() {
        return (
            <TriiiceratopsViewer
                manifestId="urn:example:manifest"
                searchProvider={searchProvider}
                style={{ display: 'block', height: '600px' }}
            />
        );
    }
    ```

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { TriiiceratopsViewer, type SearchProvider } from 'triiiceratops/vue';

    const searchProvider: SearchProvider = async (query) => [
        {
            canvasIndex: 0,
            canvasLabel: 'Page 1',
            hits: [{ type: 'hit', before: '', match: query, after: '' }],
        },
    ];
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="urn:example:manifest"
            :search-provider="searchProvider"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "HTML"

    A property, never an attribute — assign it on the element:

    ```ts
    import 'triiiceratops/element/register';
    import type { SearchProvider, TriiiceratopsViewerElement } from 'triiiceratops';

    const el = document.querySelector<TriiiceratopsViewerElement>(
        'triiiceratops-viewer',
    )!;

    const searchProvider: SearchProvider = async (query) => [
        {
            canvasIndex: 0,
            canvasLabel: 'Page 1',
            hits: [{ type: 'hit', before: '', match: query, after: '' }],
        },
    ];

    el.searchProvider = searchProvider;
    ```

=== "Svelte"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';

        const searchProvider = async (query, context) => {
            return [
                {
                    canvasIndex: 0,
                    canvasLabel: 'Page 1',
                    hits: [{ type: 'hit', before: '', match: query, after: '' }],
                },
            ];
        };
    </script>

    <TriiiceratopsViewer
        manifestId="urn:example:manifest"
        {manifestJson}
        {searchProvider}
    />
    ```

If no `searchProvider` is supplied, the viewer falls back to its normal IIIF Content Search service discovery.

If `searchProvider` is supplied, the viewer uses that callback instead of fetching a manifest-declared IIIF Search service for that search action.

## Controlling Active Canvas

You can tell the viewer which canvas to show, and stay in sync with the user's
own navigation.

!!! important "`canvasId` is an uncontrolled input"

    `canvasId` (and `manifestId`) is **one-way**: an instruction to the viewer,
    not a continuously enforced binding. Think `defaultValue` + `onChange`,
    never `value` + `onChange`. Re-asserting a value the wrapper has already
    applied writes nothing, so a parent re-render never undoes the user's
    navigation. There is no controlled mode and no `v-model` for it.

    To know where the viewer actually is, **observe** it: a selector over
    `state.canvasId`, or the canvas-change channel.

=== "HTML"

    To set the canvas, use the `canvas-id` attribute. To listen for changes, handle the `canvaschange` event.

    ```html
    <!-- Set initial canvas -->
    <triiiceratops-viewer
      id="viewer"
      canvas-id="https://example.org/initial-canvas"
      manifest-id="..."
    ></triiiceratops-viewer>

    <script>
      const viewer = document.getElementById('viewer');

      // Listen for internal navigation (Next/Prev buttons, Gallery clicks)
      viewer.addEventListener('canvaschange', (e) => {
        console.log('New Canvas ID:', e.detail.canvasId);
      });

      // Programmatically change canvas
      function goToCanvas(id) {
        viewer.setAttribute('canvas-id', id);
      }
    </script>
    ```

=== "React"

    Pass `canvasId` to navigate; read a selector to follow the viewer. The
    selector is the authoritative value — it updates for internal navigation
    (Next/Prev, gallery clicks) as well as for your own instructions.

    ```tsx
    import { useState } from 'react';
    import {
        TriiiceratopsViewer,
        useViewerHandle,
        useViewerSelector,
    } from 'triiiceratops/react';

    export function Reader({ startCanvasId }: { startCanvasId: string }) {
        const handle = useViewerHandle();
        // Where the viewer actually is.
        const canvasId = useViewerSelector(handle, (state) => state.canvasId);
        // What we last told it to show.
        const [requestedCanvasId, setRequestedCanvasId] = useState(startCanvasId);

        return (
            <>
                <p>Showing {canvasId ?? '…'}</p>
                <button
                    type="button"
                    onClick={() =>
                        setRequestedCanvasId('https://example.org/canvas/7')
                    }
                >
                    Jump to canvas 7
                </button>
                <TriiiceratopsViewer
                    handle={handle}
                    manifestId="https://example.org/manifest.json"
                    canvasId={requestedCanvasId}
                    onCanvasChange={(snapshot) =>
                        console.log('New Canvas ID:', snapshot.canvasId)
                    }
                    style={{ display: 'block', height: '600px' }}
                />
            </>
        );
    }
    ```

=== "Vue"

    Bind `:canvas-id` to navigate; read a selector to follow the viewer. The
    selector is the authoritative value — it updates for internal navigation
    (Next/Prev, gallery clicks) as well as for your own instructions.

    ```vue
    <script setup lang="ts">
    import { ref, useTemplateRef } from 'vue';
    import {
        TriiiceratopsViewer,
        useViewerSelector,
        type TriiiceratopsViewerInstance,
        type ViewerStateSnapshot,
    } from 'triiiceratops/vue';

    const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
    // Where the viewer actually is.
    const canvasId = useViewerSelector(viewer, (state) => state.canvasId);
    // What we last told it to show.
    const requestedCanvasId = ref('https://example.org/canvas/1');

    const log = (snapshot: ViewerStateSnapshot): void =>
        console.log('New Canvas ID:', snapshot.canvasId);
    </script>

    <template>
        <p>Showing {{ canvasId ?? '…' }}</p>
        <button
            type="button"
            @click="requestedCanvasId = 'https://example.org/canvas/7'"
        >
            Jump to canvas 7
        </button>
        <TriiiceratopsViewer
            ref="viewer"
            manifest-id="https://example.org/manifest.json"
            :canvas-id="requestedCanvasId"
            style="display: block; height: 600px"
            @canvas-change="log"
        />
    </template>
    ```

=== "Svelte"

    The `canvasId` prop is **one-way** (Owner -> Viewer). To keep your local state in sync with the viewer, you should bind to `viewerState` (two-way) to read the authoritative state.

    ```html
    <script>
      let canvasId = $state(initialId);
      let viewerState = $state();

      // Optional: Sync internal changes back to your local canvasId if you need stricter control
      $effect(() => {
        if (viewerState?.canvasId && viewerState.canvasId !== canvasId) {
          canvasId = viewerState.canvasId;
        }
      });
    </script>

    <TriiiceratopsViewer
      {canvasId}
      bind:viewerState
      ...
    />
    ```

## Renderer Tuning

`config.renderer` is a **small, closed, typed set** of knobs on the image
renderer. Every member is optional; omitting one takes the default.

```javascript
config = {
    renderer: {
        animationTimeConstant: 0.15, // seconds; smaller settles faster
        zoomPerClick: 1.5, // one press of the zoom buttons
        zoomPerWheelNotch: 1.15, // one notch of the wheel (and trackpad)
        minPixelRatio: 0.5, // sharpness vs. bytes
        byteBudget: 64 * 1024 * 1024, // decoded-tile cache ceiling
        residencyMargin: 1.5, // how far past the viewport stays resident
        pyramidThreshold: 512, // px at which a canvas gets full tiles
        boxThreshold: 32, // px below which a canvas draws as a plain box
    },
};
```

There is deliberately **no escape hatch into renderer internals**. An open
options object would make the renderer's own surface part of what consumers
depend on, and changing an undocumented internal would then be a breaking
change. If a knob you need is missing, that is a request for core to add it.

The defaults are provisional and are tuned as the renderer is measured, so do
not assert against a shipped number.

The decisions behind these knobs are recorded as ADRs, which is the place to
look before asking for a different default:
`byteBudget`, `residencyMargin`, `pyramidThreshold`, and `boxThreshold` are the
tuning surface of the residency model
([ADR 0014](adr/0014-residency-is-tiered-by-projected-size-and-budgeted-in-bytes.md)),
while `animationTimeConstant`, `zoomPerClick`, and `zoomPerWheelNotch` govern
only the *discrete and programmatic* input that is animated — direct
manipulation is deliberately never smoothed
([ADR 0015](adr/0015-direct-manipulation-is-never-animated.md)).

### Wheel and trackpad zoom speed

`zoomPerWheelNotch` is the multiplicative zoom applied by one **wheel notch** —
the detent of a classic mouse wheel, which the browser reports as about 100
pixels of `deltaY`. The default of `1.15` takes roughly five notches to double
the zoom; raise it for a faster wheel, lower it for a slower one. Scrolling the
other way applies the reciprocal, so a notch out undoes a notch in exactly.

This one value governs the **trackpad as well**, and there is deliberately no
separate knob for one. A trackpad never emits a notch — it emits a stream of
much smaller deltas — but because the rate underneath is per pixel, it covers
the same 100 pixels over several events and gets the same zoom for the same
scroll distance. Nothing in the viewer detects which device is in use; the usual
heuristics are unreliable and that branch is a permanent source of
hardware-specific bugs. If the trackpad feels different from the mouse, this
single value moves both.

## IIIF Collections

Triiiceratops supports [IIIF Collections](https://iiif.io/api/presentation/3.0/#51-collection). When you pass a Collection URL as the `manifest-id` (or `manifestId`), the viewer automatically:

1. Detects that the resource is a Collection (not a Manifest)
2. Parses the collection's list of Manifests
3. Loads the first Manifest automatically
4. Shows a **Collection** button in the toolbar to browse and switch between Manifests

Both IIIF Presentation API v2 (`sc:Collection`) and v3 (`Collection`) formats are supported.

=== "HTML"

    ```html
    <triiiceratops-viewer
      manifest-id="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    ></triiiceratops-viewer>
    ```

=== "React"

    ```jsx
    <triiiceratops-viewer
      ref={ref}
      manifest-id="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    />
    ```

=== "Vue"

    ```vue
    <triiiceratops-viewer
      ref="viewer"
      manifest-id="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    />
    ```

=== "Svelte"

    ```html
    <TriiiceratopsViewer
      manifestId="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    />
    ```

### Collection Configuration

Control the collection panel via config:

```javascript
config = {
    rightPanelWidth: '400px',
    collection: {
        open: true, // Open the collection panel on load
    },
    toolbar: {
        showCollection: false, // Hide the collection toolbar button
    },
};
```

!!! note "Nested Collections"

    Sub-collections within a collection are listed but not yet browsable. Only
    Manifests can be selected and loaded.

## Structures / Table of Contents

Triiiceratops supports the IIIF [Structures](https://iiif.io/api/presentation/3.0/#54-range) property (also known as Ranges). When a manifest includes a `structures` array, the viewer:

1. Parses the hierarchical range tree
2. Shows a **Table of Contents** button in the toolbar
3. Renders a collapsible tree panel for navigating between sections/chapters

Clicking a range entry navigates to its first canvas. The currently active range is highlighted based on the displayed canvas.

Both IIIF Presentation API v2 (`sc:Range`) and v3 (`Range`) structures are supported, including nested ranges.

### Structures Configuration

Control the structures panel via config:

```javascript
config = {
    rightPanelWidth: '350px',
    structures: {
        open: true, // Open the TOC panel on load
    },
    toolbar: {
        showStructures: false, // Hide the TOC toolbar button
    },
};
```

!!! tip "Single Root Range"

    When the manifest has only one top-level range, it is automatically expanded
    so you immediately see its children.

## Start Canvas

Triiiceratops supports the IIIF [`start`](https://iiif.io/api/presentation/3.0/#start) property. When a manifest specifies a `start` canvas, the viewer opens to that canvas instead of the first canvas in the sequence.

This is automatic — no configuration is needed. The `start` property is read from both v2 and v3 manifests. If a `canvasId` prop is explicitly provided, it takes priority over the manifest's `start` property.

## Opening at a canvas, a region, or a media time

Where the viewer opens is set by its inputs, and the viewer forms no opinion about
your URLs. Three inputs place it:

| Input | Effect |
| :-- | :-- |
| `manifestId` (or `manifestJson`) | which manifest to open |
| `canvasId` | which canvas to show, overriding the manifest's own `start` |
| `initialCanvasRegion` | a `CanvasRegion` — `{ x, y, width, height }` in canvas coordinates — to frame |

`canvasId` and `manifestId` are **uncontrolled** — one-way instructions, not
enforced bindings — so re-asserting the current value after the reader has
navigated writes nothing. `initialCanvasRegion` applies to the canvas the viewer
opens at; a `canvasId` explicitly supplied takes priority over the manifest's
`start` property.

### IIIF Content State

A [content state](content-state.md) is a portable IIIF description of a view. The
viewer takes one as an explicit input, and reads the `iiif-content` URL parameter
only when the host opts in
([ADR 0006](adr/0006-content-state-is-an-explicit-component-input.md)):

| Input | Attribute | Default |
| :-- | :-- | :-- |
| `contentState` | `content-state` | none |
| `readContentStateFromUrl` | `read-content-state-from-url` | off |

With the flag off — the default — the viewer never touches `window.location`, so a
component embedded in your application cannot consume an `iiif-content` parameter
meant for the page around it. Turning it on delegates that one channel to the
viewer; every other delivery channel (paste, drop, `FileReader`, a `data-*`
attribute) stays the host's.

The discrete inputs above win over `contentState`, which wins over the URL
parameter. A content state's region is honoured when the canvas it names opens, so
supply it with the content state rather than assigning `initialCanvasRegion` to a
viewer that is already showing something.

Hosts that want a view target without handing the viewer a content state can call
`parseContentState`, which is public API and resolves every form
[the conformance table lists](content-state.md#supported-forms).

The [bare viewer](https://triiiceratops.org/viewer/){target=_blank} sets
`read-content-state-from-url`, which is why IIIF Cookbook recipes can link
straight into it.

### Media time

A `#t=` fragment is the temporal peer of `#xywh=`, and it is not a region: it is
carried as a **temporal offset** on the navigation rather than applied to the
image. Pass it as the second argument to `setCanvas`:

```ts
viewer.viewerState?.setCanvas(canvasId, { seconds: 157 });
```

Core parses and carries the offset — `viewerState.temporalOffset` holds the last
one, replaced whole by each navigation — but never acts on it. Only a plugin that
has claimed that canvas interprets it, always as a **seek** and never as autoplay;
with [the AV plugin](plugin-av.md) active, that positions the playhead. A range's
end (`#t=157,203`) is carried and deliberately not enforced: nothing in core stops
playback at it.

The same offset is produced by the manifest's own `start` property and by a
structure item whose target carries `#t=`, so a table-of-contents entry pointing
into the middle of a recording works with no host code at all.

## Multiple Sequences / Alternative Page Sequences

When a manifest contains more than one sequence — either via multiple IIIF v2 `sequences` entries or IIIF v3 ranges with `behavior: sequence` (cookbook 0027 Alternative Page Sequences) — the toolbar shows a **sequence picker** button with a count badge.

Clicking the button opens a popover listing all available sequences by label. Selecting a sequence navigates to its first canvas. The sequence picker is hidden automatically for single-sequence manifests.

No configuration is required. The sequence picker appears automatically when `sequenceCount > 1`.

## Best Practices

1. **Syncing External Controls**: If you build external controls (like the settings menu in the Demo), read the viewer's own state rather than assuming your inputs are still current — `useViewerSelector()` in [React](react.md) and [Vue](vue.md), `statechange` or the `viewerState` bridge on the custom element, `bind:viewerState` in Svelte.
2. **Avoiding Loops**: When syncing state back to configuration, ensure you only update your configuration if the value has actually changed to avoid infinite update loops.
3. **Keep object inputs stable**: `config`, `manifestJson`, `themeConfig`, `initialCanvasRegion`, and `plugins` are compared with a one-level shallow equality. A nested object rebuilt on every render is re-applied on every render — hoist it, memoize it, or keep it in a `shallowRef`.
