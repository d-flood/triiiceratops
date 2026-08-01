---
icon: lucide/wrench
---

# Configuration & State Management

Triiiceratops provides a flexible configuration system that works consistently
across every host — React, Vue, Svelte, or plain HTML.

Every host shares the same `ViewerConfig` object, documented once below, and
every host can load manifest JSON directly and supply a `searchProvider`. There
are no host-specific viewer inputs.

The React and Vue tabs on this page use the framework wrappers, which are the
supported integration path for those frameworks — see the [React](react.md) and
[Vue](vue.md) guides. Hosts driving the custom element by hand should read the
[low-level section](integration.md#low-level-driving-the-custom-element-directly)
of the framework page.

## Configuration Object

<!-- Absolute URL, not a relative `./viewer/` link: the demo is published at a
stable, unversioned path (see docs-publish.mjs) because IIIF cookbook recipes
link to it directly. -->
!!! tip "Interactive Configuration"

    You can experiment with these settings in the [Live Demo](https://d-flood.github.io/triiiceratops/viewer/){target=_blank}.
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
        align?: 'start' | 'center' | 'end'; // Default: 'center' (alignment along the edge)
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
            target?: 'panel' | 'flyout'; // Override where the plugin renders
            position?: 'left' | 'right'; // Override docked panel side; ignored when target is 'flyout'
        };
    };

    // Thumbnail Gallery Settings
    gallery?: {
        open?: boolean; // Default: false
        draggable?: boolean; // Default: true
        showCloseButton?: boolean; // Default: true
        dockPosition?: 'left' | 'right' | 'top' | 'bottom' | 'none'; // Default: 'bottom'
        expanded?: boolean; // Default: false (fills the center column as a grid; implies open)
        fixedHeight?: number; // Default: 75 (thumbnail image height, in every view)
        width?: number; // Floating window width
        height?: number; // Floating window height
        x?: number; // Floating window X position
        y?: number; // Floating window Y position
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

    // OpenSeadragon overrides
    openSeadragonConfig?: Partial<OpenSeadragon.Options>;

    // Marker styling for point annotations, shared by the read-only overlay
    // and the annotation editor
    pointStyle?: {
        radius?: number; // Screen pixels; Default: 5
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
    };

    // Drag-and-drop manifest/content-state loading
    enableDragDrop?: boolean; // Default: false

    // Opt-in developer diagnostics. When true, viewer diagnostics are logged
    // through the core logger (prefixed `[triiiceratops]`). Actionable
    // failures always surface through `viewererror`/`pluginerror` regardless
    // of this flag.
    debug?: boolean; // Default: false
}
```

### Sidebar Panel Layout

Side panels are grouped into a left sidebar stack and a right sidebar stack. Each side has one width, controlled by `leftPanelWidth` and `rightPanelWidth`; individual built-in and plugin panels do not have their own width setting.

When multiple panels are open on the same side, they stack vertically. `search`, `annotations`, and `information` can be placed on either side with `position: 'left' | 'right'`. `structures` and `collection` currently render in the right sidebar stack.

### Plugin UI Control

Plugin UI can be controlled from the same `config` object used for built-in panes. Use each plugin's stable id as the key — the SDK `uiId` a `definePlugin` plugin declares (first-party plugins use `pdf-export`, `image-download`, `image-manipulation`, `annotation-editor`):

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
        'annotation-editor': {
            position: 'right',
        },
    },
};
```

`visible` controls whether the plugin's toolbar button is rendered, `open` controls whether the plugin surface is expanded, `target` overrides where the plugin renders (`'panel'` or `'flyout'`), and `position` overrides which side a docked panel opens on (`'left' | 'right'`; ignored while the plugin's effective `target` is `'flyout'`, since a flyout anchors to its toolbar button rather than docking to a side). All four apply reactively after mount, so a host can, for example, switch a plugin to a flyout on narrow viewports. See [controlling plugin UI at runtime](plugins.md#controlling-plugin-ui-at-runtime) for the per-framework code and a responsive example.

## Usage

In React, Vue, and Svelte, `config` is a normal typed **prop** on
`<TriiiceratopsViewer>`. When you drive the custom element directly it is a
**property** on the element (objects can't go through HTML attributes — see
[use with any framework](integration.md)).

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
      import { TriiiceratopsViewer } from 'triiiceratops';
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
    galleryPosition: { x: number; y: number };
    gallerySize: { width: number; height: number };
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
    demonstrated in `src/demo/Demo.svelte`.

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
      import { TriiiceratopsViewer } from 'triiiceratops';
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

```typescript
type SearchProvider = (
    query: string,
    context: {
        manifestId: string;
        manifest: any;
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
        import { TriiiceratopsViewer } from 'triiiceratops';

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

## OpenSeadragon Overrides

You can pass custom [OpenSeadragon options](https://openseadragon.github.io/docs/OpenSeadragon.html#.Options) via `openSeadragonConfig` to fine-tune the underlying viewer. These are merged into the default options at initialization and updated reactively.

```javascript
config = {
    openSeadragonConfig: {
        maxZoomPixelRatio: 4,
        zoomPerScroll: 1.5,
        animationTime: 0.3,
    },
};
```

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

## Content State API

Triiiceratops supports the [IIIF Content State](https://iiif.io/api/content-state/) specification via the `iiif-content` URL parameter. This allows links that open the viewer at a specific manifest, canvas, and optional spatial region.

The `iiif-content` value can be:

- A plain HTTPS URL (used directly as the manifest ID)
- A base64url-encoded JSON object following the Content State specification

```
https://your-site.com/demo?iiif-content=<base64url-encoded-content-state>
```

The viewer extracts the manifest URL, canvas ID, and `xywh` region from the decoded value and opens the viewer at that location. If a `manifest` query parameter is also present, it takes priority over `iiif-content`.

Reading `iiif-content` is **opt-in** and never takes over your routing:
precedence is discrete props/properties (`manifestId`/`canvasId`) win over
`initialCanvasRegion` (Svelte prop, or the custom element's property of the
same name), which wins over the URL parameter.

## Multiple Sequences / Alternative Page Sequences

When a manifest contains more than one sequence — either via multiple IIIF v2 `sequences` entries or IIIF v3 ranges with `behavior: sequence` (cookbook 0027 Alternative Page Sequences) — the toolbar shows a **sequence picker** button with a count badge.

Clicking the button opens a popover listing all available sequences by label. Selecting a sequence navigates to its first canvas. The sequence picker is hidden automatically for single-sequence manifests.

No configuration is required. The sequence picker appears automatically when `sequenceCount > 1`.

## Best Practices

1. **Syncing External Controls**: If you build external controls (like the settings menu in the Demo), read the viewer's own state rather than assuming your inputs are still current — `useViewerSelector()` in [React](react.md) and [Vue](vue.md), `statechange` or the `viewerState` bridge on the custom element, `bind:viewerState` in Svelte.
2. **Avoiding Loops**: When syncing state back to configuration, ensure you only update your configuration if the value has actually changed to avoid infinite update loops.
3. **Keep object inputs stable**: `config`, `manifestJson`, `themeConfig`, `initialCanvasRegion`, and `plugins` are compared with a one-level shallow equality. A nested object rebuilt on every render is re-applied on every render — hoist it, memoize it, or keep it in a `shallowRef`.
