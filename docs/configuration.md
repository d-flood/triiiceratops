---
icon: lucide/wrench
---

# Configuration & State Management

Triiiceratops provides a flexible configuration system that works consistently across both the Web Component and Svelte Component implementations.

## Configuration Object

!!! tip "Interactive Configuration"
    You can experiment with these settings in the [Live Demo](./demo/){target=_blank}. Open the settings menu (gear icon), tweak the configuration, and then click **"Copy Config"** to get the JSON for your project.

The viewer accepts a configuration object to customize the UI and behavior. Below is the structure of the configuration object with default values:

```typescript
interface ViewerConfig {
  // Top-level UI Toggles
  showRightMenu?: boolean; // Default: true
  showLeftMenu?: boolean;  // Default: true
  showCanvasNav?: boolean; // Default: true

  // Right Menu Items
  rightMenu?: {
    showSearch?: boolean;      // Default: true
    showGallery?: boolean;     // Default: true
    showAnnotations?: boolean; // Default: true
    showFullscreen?: boolean;  // Default: true
    showInfo?: boolean;        // Default: true
  };

  // Thumbnail Gallery Settings
  gallery?: {
    open?: boolean;            // Default: false
    draggable?: boolean;       // Default: true
    showCloseButton?: boolean; // Default: true
    dockPosition?: 'bottom' | 'top' | 'left' | 'right' | 'none'; // Default: 'bottom'
  };

  // Search Panel Settings
  search?: {
    open?: boolean;            // Default: false
    showCloseButton?: boolean; // Default: true
  };

  // Annotations Settings
  annotations?: {
    open?: boolean;    // Default: false (Sidebar panel)
    visible?: boolean; // Default: true (Overlay visibility)
  };
}
```

## Usage

=== "Web Component"

    ### Passing Configuration

    For the Web Component (`<triiiceratops-viewer>`), configuration is passed as a **JSON string** via the `config` attribute.

    ```html
    <triiiceratops-viewer
      manifest-id="https://example.org/iiif/manifest.json"
      config='{"showLeftMenu": false, "gallery": {"open": true}}'
    ></triiiceratops-viewer>
    ```

    Since attributes are strings, you must `JSON.stringify()` your config object if setting it via JavaScript:

    ```javascript
    const viewer = document.querySelector('triiiceratops-viewer');
    const config = {
      showRightMenu: false,
      gallery: { dockPosition: 'right' }
    };
    viewer.setAttribute('config', JSON.stringify(config));
    ```

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
        showRightMenu: true,
        gallery: { open: true }
      };
    </script>

    <TriiiceratopsViewer {config} manifestId="..." />
    ```

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

## Best Practices

1. **Syncing External Controls**: If you build external controls (like the settings menu in the Demo), listen to `statechange` (WC) or bind `viewerState` (Svelte) to keep your controls in sync with the viewer's actual state.
2. **Avoiding Loops**: When syncing state back to configuration, ensure you only update your configuration if the value has actually changed to avoid infinite update loops.
