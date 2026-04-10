---
icon: lucide/wrench
---

# Configuration & State Management

Triiiceratops provides a flexible configuration system that works consistently across both the Web Component and Svelte Component implementations.

The web component and the Svelte component share the same UI configuration object. Both can load manifest JSON directly, while `searchProvider` remains a Svelte-only integration prop.

## Configuration Object

!!! tip "Interactive Configuration"
You can experiment with these settings in the [Live Demo](./viewer/){target=\_blank}. Open the settings menu (gear icon), tweak the configuration, and then click **"Copy Config"** to get the JSON for your project.

The viewer accepts a configuration object to customize the UI and behavior. Below is the structure of the configuration object with default values:

```typescript
interface ViewerConfig {
    // Top-level UI Toggles
    showCanvasNav?: boolean; // Default: true
    viewingMode?: 'individuals' | 'paged' | 'continuous'; // Default: 'individuals'
    viewingDirection?:
        | 'left-to-right'
        | 'right-to-left'
        | 'top-to-bottom'
        | 'bottom-to-top';
    pagedViewOffset?: boolean; // Default: true (Offset paged view by one canvas)
    showZoomControls?: boolean; // Default: true
    transparentBackground?: boolean; // Default: false

    // Toolbar Settings
    showToggle?: boolean; // Default: true (Toolbar toggle visible)
    toolbarOpen?: boolean; // Default: false (Toolbar expanded)
    toolbarPosition?: 'left' | 'right' | 'top-left' | 'top-right'; // Default: 'left'

    toolbar?: {
        showSearch?: boolean; // Default: true
        showGallery?: boolean; // Default: true
        showAnnotations?: boolean; // Default: true
        showFullscreen?: boolean; // Default: true
        showInfo?: boolean; // Default: true
        showViewingMode?: boolean; // Default: true
        showStructures?: boolean; // Default: true (only visible when manifest has structures)
        showCollection?: boolean; // Default: true (only visible when a collection is loaded)
    };

    // Plugin UI Settings (keyed by plugin id)
    plugins?: {
        [pluginId: string]: {
            visible?: boolean; // Default: true (Toolbar button visible)
            open?: boolean; // Default: false (Plugin panel open)
        };
    };

    // Thumbnail Gallery Settings
    gallery?: {
        open?: boolean; // Default: false
        draggable?: boolean; // Default: true
        showCloseButton?: boolean; // Default: true
        dockPosition?: 'left' | 'right' | 'top' | 'bottom' | 'none'; // Default: 'bottom'
        fixedHeight?: number; // Default: 120
        width?: number; // Floating window width
        height?: number; // Floating window height
        x?: number; // Floating window X position
        y?: number; // Floating window Y position
    };

    // Search Panel Settings
    search?: {
        open?: boolean; // Default: false
        showCloseButton?: boolean; // Default: true
        position?: 'left' | 'right'; // Default: 'right'
        width?: string; // Default: '320px'
        query?: string; // Programmatically set search query
    };

    // Annotations Settings
    annotations?: {
        open?: boolean; // Default: false (Sidebar panel)
        visible?: boolean; // Default: false (Overlay visibility)
        showCloseButton?: boolean; // Default: true
        position?: 'left' | 'right'; // Default: 'right'
        width?: string; // Default: '320px'
    };

    // Structures / Table of Contents Settings
    structures?: {
        open?: boolean; // Default: false
        width?: string; // Default: '320px'
    };

    // Collection Navigation Settings
    collection?: {
        open?: boolean; // Default: false
        width?: string; // Default: '320px'
    };

    // Network Requests
    requests?: {
        headers?: Record<string, string>; // Extra headers for manifest requests
        withCredentials?: boolean; // Use cookies/credentials
    };

    // OpenSeadragon overrides
    openSeadragonConfig?: Partial<OpenSeadragon.Options>;
}
```

### Plugin UI Control

Plugin UI can be controlled from the same `config` object used for built-in panes. Use each plugin's `id` as the key:

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
        },
    },
};
```

`visible` controls whether the plugin's toolbar button is rendered, and `open` controls whether the plugin panel is expanded.

## Usage

=== "Web Component"

    ### Passing Configuration

    For the Web Component (`<triiiceratops-viewer>`), configuration is passed as a **JSON string** via the `config` attribute.

    ```html
    <triiiceratops-viewer
      manifest-id="https://example.org/iiif/manifest.json"
      config='{"toolbarPosition": "right", "gallery": {"open": true}}'
    ></triiiceratops-viewer>
    ```

    Since attributes are strings, you must `JSON.stringify()` your config object if setting it via JavaScript:

    ```javascript
    const viewer = document.querySelector('triiiceratops-viewer');
    const config = {
      toolbarPosition: 'left',
      gallery: { dockPosition: 'right' }
    };
    viewer.setAttribute('config', JSON.stringify(config));
    ```

    ### Direct Manifest Data

    To load a manifest from in-memory JSON instead of fetching `manifest-id`, set the `manifestJson` property from JavaScript:

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

    `manifestJson` is a property-based API for the web component. It is not intended to be authored as a large inline HTML attribute.

    ### Reacting to State Changes

    The Web Component keeps its internal state in sync with the user's interactions (e.g., opening/closing panels, changing canvas). It dispatches events to notify the host application of these changes.

    #### Events

    *   `statechange`: Fired when UI state changes (panels open/close, docking, etc.).
    *   `canvaschange`: Fired when the active canvas changes.
    *   `manifestchange`: Fired when a new manifest is loaded.

    The event `detail` contains a `ViewerStateSnapshot`:

    ```typescript
    interface ViewerStateSnapshot {
        manifestId: string | null;
        canvasId: string | null;
        currentCanvasIndex: number;
        showAnnotations: boolean;
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
        galleryPosition: { x: number; y: number };
        gallerySize: { width: number; height: number };
    }
    ```

    ```typescript
    viewer.addEventListener('statechange', (e) => {
      const state = e.detail;
      console.log('Gallery is open:', state.showThumbnailGallery);
      console.log('Current dock side:', state.dockSide);
    });
    ```

    You can use these events to sync your application's UI with the viewer, as demonstrated in `src/demo/Demo.svelte`.

=== "Svelte Component"

    ### Passing Configuration

    For the Svelte Component (`<TriiiceratopsViewer>`), configuration is passed directly as a **prop**.

    ```html
    <script>
      import TriiiceratopsViewer from 'triiiceratops/components/TriiiceratopsViewer.svelte';

      let config = {
        toolbarPosition: 'left',
        gallery: { open: true }
      };

      let manifestJson = {
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: []
      };
    </script>

    <TriiiceratopsViewer {config} manifestId="urn:example:manifest" {manifestJson} />
    ```

    ### Direct Manifest Data

    If `manifestJson` is provided alongside `manifestId`, the viewer uses the supplied JSON directly and does not fetch the manifest over HTTP.

    ```typescript
    interface TriiiceratopsViewerProps {
      manifestId?: string;
      manifestJson?: Record<string, any>;
      searchProvider?: SearchProvider | null;
    }
    ```

    This is useful when your app stores or assembles manifests locally.

    ### Two-Way State Binding

    The Svelte component exports a `viewerState` prop that allows for two-way binding. This gives you direct, reactive access to the internal state.

    ```html
    <script>
      import TriiiceratopsViewer from 'triiiceratops/components/TriiiceratopsViewer.svelte';

      // This will strictly mirror the internal state
      let state = $state();
    </script>

    <TriiiceratopsViewer
      manifestId="..."
      bind:viewerState={state}
    />

    <div>
      Gallery is: {state?.showThumbnailGallery ? 'Open' : 'Closed'}
    </div>
    ```

    If you change the bound configuration prop, the viewer will update. If the user interacts with the viewer (e.g., closes the gallery), the `viewerState` binding will update your local variable.

## Programmatic Search

You can trigger a search programmatically by setting the `search.query` property in the configuration. This allows you to integrate external search bars or predefined queries.

For Svelte integrations, you can also provide a `searchProvider` prop when the search source is local application state rather than a manifest-declared IIIF Search service.

=== "Web Component"

    ```html
    <triiiceratops-viewer
      id="my-viewer"
      manifest-id="..."
    ></triiiceratops-viewer>

    <script>
      const viewer = document.getElementById('my-viewer');

      function search(query) {
        // Update config with new query
        const config = {
          search: {
            open: true,
            query: query
          }
        };
        viewer.setAttribute('config', JSON.stringify(config));
      }
    </script>
    ```

    Note that the viewer does **not** write back to the `config` attribute. If the user clears the search in the viewer, your external `config` object will still have the old query unless you reset it.

=== "Svelte Component"

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

## Custom Search Providers

Svelte integrations can pass a `searchProvider` prop to supply search results from host application code.

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

```svelte
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

You can control which canvas is displayed and stay in sync with the viewer's navigation.

=== "Web Component"

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

=== "Svelte Component"

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

=== "Web Component"

    ```html
    <triiiceratops-viewer
      manifest-id="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    ></triiiceratops-viewer>
    ```

=== "Svelte Component"

    ```svelte
    <TriiiceratopsViewer
      manifestId="https://iiif.io/api/cookbook/recipe/0032-collection/collection.json"
    />
    ```

### Collection Configuration

Control the collection panel via config:

```javascript
config = {
    collection: {
        open: true, // Open the collection panel on load
        width: '400px', // Custom panel width
    },
    toolbar: {
        showCollection: false, // Hide the collection toolbar button
    },
};
```

!!! note "Nested Collections"
Sub-collections within a collection are listed but not yet browsable. Only Manifests can be selected and loaded.

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
    structures: {
        open: true, // Open the TOC panel on load
        width: '350px', // Custom panel width
    },
    toolbar: {
        showStructures: false, // Hide the TOC toolbar button
    },
};
```

!!! tip "Single Root Range"
When the manifest has only one top-level range, it is automatically expanded so you immediately see its children.

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

## Multiple Sequences / Alternative Page Sequences

When a manifest contains more than one sequence — either via multiple IIIF v2 `sequences` entries or IIIF v3 ranges with `behavior: sequence` (cookbook 0027 Alternative Page Sequences) — the toolbar shows a **sequence picker** button with a count badge.

Clicking the button opens a popover listing all available sequences by label. Selecting a sequence navigates to its first canvas. The sequence picker is hidden automatically for single-sequence manifests.

No configuration is required. The sequence picker appears automatically when `sequenceCount > 1`.

## Best Practices

1. **Syncing External Controls**: If you build external controls (like the settings menu in the Demo), listen to `statechange` (WC) or bind `viewerState` (Svelte) to keep your controls in sync with the viewer's actual state.
2. **Avoiding Loops**: When syncing state back to configuration, ensure you only update your configuration if the value has actually changed to avoid infinite update loops.
