---
icon: lucide/wrench
---

# Configuration & State Management

Triiiceratops provides a flexible configuration system that works consistently across both the Web Component and Svelte Component implementations.

The web component and the Svelte component share the same UI configuration object. Both can load manifest JSON directly, while `searchProvider` remains a Svelte-only integration prop.

## Configuration Object

!!! tip "Interactive Configuration"
You can experiment with these settings in the [Live Demo](./demo/){target=\_blank}. Open the settings menu (gear icon), tweak the configuration, and then click **"Copy Config"** to get the JSON for your project.

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

    // Network Requests
    requests?: {
        headers?: Record<string, string>; // Extra headers for manifest requests
        withCredentials?: boolean; // Use cookies/credentials
    };

    // OpenSeadragon overrides
    openSeadragonConfig?: Partial<OpenSeadragon.Options>;
}
```

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
  }
) => Promise<Array<{
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
}>>;
```

```svelte
<script>
  import { TriiiceratopsViewer } from 'triiiceratops';

  const searchProvider = async (query, context) => {
    return [
      {
        canvasIndex: 0,
        canvasLabel: 'Page 1',
        hits: [{ type: 'hit', before: '', match: query, after: '' }]
      }
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
    }
};
```

## Best Practices

1. **Syncing External Controls**: If you build external controls (like the settings menu in the Demo), listen to `statechange` (WC) or bind `viewerState` (Svelte) to keep your controls in sync with the viewer's actual state.
2. **Avoiding Loops**: When syncing state back to configuration, ensure you only update your configuration if the value has actually changed to avoid infinite update loops.
