# Plugin System

Triiiceratops features a flexible, component-based plugin system that allows you to extend the viewer's functionality by adding custom panels to the left or right sidebars.

## Quick Start

=== "Web Component"

    Load the viewer and plugin bundles via script tags, then assign plugins to the viewer:

    ```html
    <!DOCTYPE html>
    <html>
    <head>
      <!-- Load the viewer (self-contained, includes all dependencies) -->
      <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

      <!-- Load plugins -->
      <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>
    </head>
    <body>
      <triiiceratops-viewer manifest-id="https://example.com/manifest.json"></triiiceratops-viewer>

      <script>
        customElements.whenDefined('triiiceratops-viewer').then(() => {
          const viewer = document.querySelector('triiiceratops-viewer');
          viewer.plugins = [window.TriiiceratopsPlugins.ImageManipulation];
        });
      </script>
    </body>
    </html>
    ```

=== "Svelte Component"

    Import the viewer and plugin components, then pass plugins via the `plugins` prop:

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import {
        ImageManipulationController,
        SlidersIcon
      } from 'triiiceratops/plugins/image-manipulation';

      const plugins = [
        {
          name: 'Image Adjustments',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'left'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer
        manifestId="https://example.com/manifest.json"
        {plugins}
      />
    </div>
    ```

---

## How the Plugin System Works

### Build System Overview

Triiiceratops provides two distribution formats to support different use cases:

| Format           | Use Case                           | Plugins Loaded Via                          |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| **IIFE Bundles** | Static HTML pages, no build step   | Script tags + `window.TriiiceratopsPlugins` |
| **ES Modules**   | Vite/Svelte projects with bundlers | `import` statements                         |

### IIFE Bundles (Script Tags)

The IIFE (Immediately Invoked Function Expression) bundles are self-contained JavaScript files that work in any browser without a build system.

**How it works:**

1. **`triiiceratops-element.iife.js`** (~700KB) bundles:
    - The `<triiiceratops-viewer>` custom element
    - Svelte runtime
    - OpenSeadragon image viewer
    - All core dependencies
    - Exposes a shared Svelte runtime for plugins

2. **Plugin IIFE bundles** (e.g., `triiiceratops-plugin-image-manipulation.iife.js`):
    - Bundle the plugin's Svelte components and icons
    - Use the shared Svelte runtime from the main element bundle
    - Register themselves on `window.TriiiceratopsPlugins`

!!! info "Svelte Runtime Sharing"
The viewer exposes its Svelte runtime on `window.__TriiiceratopsSvelteRuntime`, which plugins use to ensure `getContext()` and other Svelte features work correctly across bundle boundaries.

### ES Module Exports

For projects using Vite, SvelteKit, or other bundlers, Triiiceratops exports ES modules that enable tree-shaking and integration with your existing build pipeline:

```javascript
// Main Svelte component
import { TriiiceratopsViewer } from 'triiiceratops';

// Plugin components for manual assembly
import {
    ImageManipulationController,
    SlidersIcon,
} from 'triiiceratops/plugins/image-manipulation';
```

---

## Plugin Definition

A plugin is defined by a `PluginDef` object:

```typescript
import type { Component } from 'svelte';

interface PluginDef {
    id?: string; // Unique identifier (auto-generated if not provided)
    name: string; // Title shown in tooltips/headers
    icon: Component; // Icon component (e.g., from phosphor-svelte)
    panel: Component; // The Svelte component to render in the sidebar
    position?: 'left' | 'right' | 'bottom' | 'overlay'; // Panel position (default: 'left')
    props?: Record<string, unknown>; // Optional props to pass to the panel
}
```

---

## Adding Plugins

=== "Web Component"

    When using the `<triiiceratops-viewer>` custom element, you cannot pass complex objects via HTML attributes. Instead, set the `plugins` property using JavaScript after the element is defined.

    **Script Tags (No Build Required):**

    ```html
    <!-- Load the viewer -->
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

    <!-- Load plugins -->
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>

    <triiiceratops-viewer
      manifest-id="https://iiif.wellcomecollection.org/presentation/v3/b18035723"
    ></triiiceratops-viewer>

    <script>
      customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');

        // Plugins are pre-configured objects on window.TriiiceratopsPlugins
        viewer.plugins = [
          window.TriiiceratopsPlugins.ImageManipulation
        ];
      });
    </script>
    ```

    **With a Build System:**

    If you're using the web component in a project with a bundler (Vite, Webpack, etc.):

    ```javascript
    import {
      ImageManipulationController,
      SlidersIcon
    } from 'triiiceratops/plugins/image-manipulation';

    customElements.whenDefined('triiiceratops-viewer').then(() => {
      const viewer = document.querySelector('triiiceratops-viewer');

      viewer.plugins = [
        {
          name: 'Image Adjustments',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'left'
        }
      ];
    });
    ```

=== "Svelte Component"

    When using the `TriiiceratopsViewer` Svelte component directly, pass plugins via the `plugins` prop.

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import {
        ImageManipulationController,
        SlidersIcon
      } from 'triiiceratops/plugins/image-manipulation';

      // Define your plugins array
      const plugins = [
        {
          name: 'Image Adjustments',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'left'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer
        manifestId="https://example.com/manifest.json"
        {plugins}
      />
    </div>
    ```

    **Multiple Plugins:**

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationController, SlidersIcon } from 'triiiceratops/plugins/image-manipulation';
      import MyCustomPlugin from './MyCustomPlugin.svelte';
      import CustomIcon from './CustomIcon.svelte';

      const plugins = [
        {
          name: 'Image Adjustments',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'left'
        },
        {
          name: 'My Custom Feature',
          icon: CustomIcon,
          panel: MyCustomPlugin,
          position: 'right'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

---

## Available Plugins

### Image Manipulation

Provides brightness, contrast, saturation, invert, and grayscale controls for the displayed image.

=== "Web Component"

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>

    <script>
      viewer.plugins = [window.TriiiceratopsPlugins.ImageManipulation];
    </script>
    ```

=== "Svelte Component"

    ```svelte
    <script>
      import {
        ImageManipulationController,
        SlidersIcon
      } from 'triiiceratops/plugins/image-manipulation';

      const plugins = [
        {
          name: 'Image Adjustments',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'left'
        }
      ];
    </script>
    ```

---

## Creating Custom Plugins

Custom plugins are Svelte components that receive props from the plugin system and can access the viewer's state via Svelte context.

### Plugin Component Props

Your plugin component receives these props:

| Prop     | Type         | Description                                |
| -------- | ------------ | ------------------------------------------ |
| `isOpen` | `boolean`    | Whether the plugin panel is currently open |
| `close`  | `() => void` | Function to close the plugin panel         |

### Accessing Viewer State

Use Svelte's `getContext` to access the viewer's reactive state:

```svelte
<script>
    import { getContext } from 'svelte';

    // Props from the plugin system
    let { isOpen, close } = $props();

    // Access the viewer's reactive state
    const viewerState = getContext('triiiceratops:viewerState');

    function handleZoomIn() {
        viewerState.osdViewer?.viewport.zoomBy(1.5);
    }

    function handleNextCanvas() {
        viewerState.nextCanvas();
    }
</script>

<div class="p-4">
    <h3>My Custom Plugin</h3>

    <p>Current canvas: {viewerState.canvasId}</p>

    <div class="flex gap-2">
        <button onclick={handleZoomIn}>Zoom In</button>
        <button onclick={handleNextCanvas}>Next Canvas</button>
        <button onclick={close}>Close</button>
    </div>
</div>
```

### ViewerState Properties

The `viewerState` context provides access to:

| Property               | Type                           | Description                              |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| `manifestId`           | `string \| null`               | Current manifest URL                     |
| `canvasId`             | `string \| null`               | Current canvas ID                        |
| `currentCanvasIndex`   | `number`                       | Index of current canvas (-1 if none)     |
| `canvases`             | `any[]`                        | Array of canvas objects from manifest    |
| `osdViewer`            | `OpenSeadragon.Viewer \| null` | OpenSeadragon instance                   |
| `showAnnotations`      | `boolean`                      | Whether annotations are visible          |
| `showThumbnailGallery` | `boolean`                      | Whether the thumbnail gallery is open    |
| `showSearchPanel`      | `boolean`                      | Whether the search panel is open         |
| `searchQuery`          | `string`                       | Current search query                     |
| `searchResults`        | `any[]`                        | Array of search results                  |
| `isSearching`          | `boolean`                      | Whether a search is in progress          |
| `isFullScreen`         | `boolean`                      | Whether the viewer is in fullscreen mode |
| `dockSide`             | `string`                       | Current dock side for gallery            |
| `hasNext`              | `boolean`                      | Whether there is a next canvas           |
| `hasPrevious`          | `boolean`                      | Whether there is a previous canvas       |

And methods:

| Method                  | Description                         |
| ----------------------- | ----------------------------------- |
| `nextCanvas()`          | Navigate to the next canvas         |
| `previousCanvas()`      | Navigate to the previous canvas     |
| `setCanvas(id)`         | Navigate to a specific canvas by ID |
| `setManifest(id)`       | Load a new manifest                 |
| `toggleFullScreen()`    | Toggle fullscreen mode              |
| `toggleAnnotations()`   | Toggle annotation visibility        |
| `toggleThumbnailGallery()` | Toggle thumbnail gallery         |
| `toggleSearchPanel()`   | Toggle search panel                 |
| `search(query)`         | Perform a search (async)            |

### Registering Your Custom Plugin

=== "Web Component"

    Custom plugins for script-tag usage require building your own IIFE bundle that:

    1. Uses Svelte from `window.__TriiiceratopsSvelteRuntime`
    2. Registers on `window.TriiiceratopsPlugins`

    See `vite.config.plugins-iife.ts` in the Triiiceratops source for an example build configuration.

=== "Svelte Component"

    Simply import your custom component and add it to the plugins array:

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import MyCustomPanel from './MyCustomPanel.svelte';
      import MyIcon from 'phosphor-svelte/lib/Star'; // or your own icon

      const plugins = [
        {
          name: 'My Custom Plugin',
          icon: MyIcon,
          panel: MyCustomPanel,
          position: 'right'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

---

## Package Exports Reference

| Export Path                                     | Description                             |
| ----------------------------------------------- | --------------------------------------- |
| `triiiceratops`                                 | Main Svelte component and utilities     |
| `triiiceratops/element`                         | Web component IIFE bundle               |
| `triiiceratops/plugins/image-manipulation`      | Image manipulation plugin (ES module)   |
| `triiiceratops/plugins/image-manipulation.iife` | Image manipulation plugin (IIFE bundle) |
| `triiiceratops/style.css`                       | Stylesheet (for Svelte component usage) |
