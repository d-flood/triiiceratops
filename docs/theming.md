---
icon: lucide/palette
---

# Theming and Styling

Triiiceratops ships a small set of vanilla-CSS design tokens. There are three ways to
style the viewer, from easiest to most granular:

1. Pick a **built-in theme** (`theme` prop).
2. Override tokens with the **`themeConfig` prop** (typed, friendly names).
3. Set the underlying **CSS variables** directly on the host element.

All three compose. Built-in themes set the base values, `themeConfig` (applied as
inline styles) wins over external CSS, and CSS variables you set from outside the
component override the built-in defaults.

## 1. Built-in Themes

Four themes ship with the viewer: two light (`light`, `cupcake`) and two dark
(`dark`, `dracula`). When no theme is set, the viewer follows the OS
`prefers-color-scheme`.

=== "Web Component"

    ```html
    <triiiceratops-viewer manifest-id="..." theme="dark"></triiiceratops-viewer>
    ```

=== "Svelte Component"

    ```svelte
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        // Import the library styles once in your app:
        import 'triiiceratops/style.css';
    </script>

    <TriiiceratopsViewer manifestId="..." theme="dracula" />
    ```

---

## 2. Custom Theme Configuration

Override individual tokens with `themeConfig` — no CSS required. Colors accept
**Hex** (`#3b82f6`), **RGB** (`rgb(59, 130, 246)`), or **OKLCH**
(`oklch(60% 0.25 250)`); they are normalized to OKLCH internally.

### Palette

| Keyword          | Description                                  | CSS Variable              |
| :--------------- | :------------------------------------------- | :------------------------ |
| `primary`        | Primary brand color (buttons, active states) | `--color-primary`         |
| `primaryContent` | Text color on a primary background           | `--color-primary-content` |
| `neutral`        | Neutral color (tooltips, active menu items)  | `--color-neutral`         |
| `neutralContent` | Text color on a neutral background           | `--color-neutral-content` |
| `success`        | Success state                                | `--color-success`         |
| `successContent` | Text color on a success background           | `--color-success-content` |
| `warning`        | Warning state                                | `--color-warning`         |
| `warningContent` | Text color on a warning background           | `--color-warning-content` |
| `error`          | Error state                                  | `--color-error`           |
| `errorContent`   | Text color on an error background            | `--color-error-content`   |

### Surfaces

Surfaces are named by the region they paint. `panelBg` is the default for **every**
panel (including plugin panels); `galleryBg` and `inputBg` follow `viewerBg` by
default.

| Keyword         | Description                              | CSS Variable       |
| :-------------- | :--------------------------------------- | :----------------- |
| `viewerBg`      | Main viewer/canvas background            | `--viewer-bg`      |
| `toolbarBg`     | Toolbar + canvas-nav controls background | `--toolbar-bg`     |
| `panelBg`       | Default background for all side panels   | `--panel-bg`       |
| `galleryBg`     | Thumbnail gallery background             | `--gallery-bg`     |
| `inputBg`       | Form input/control surface               | `--input-bg`       |
| `surfaceBorder` | Borders and dividers                     | `--surface-border` |

### Content (foreground)

`content` is the global text/icon color. The per-region tokens below inherit from it
and let you retint text in one region without touching the rest.

| Keyword          | Description                        | CSS Variable        |
| :--------------- | :--------------------------------- | :------------------ |
| `content`        | Global default text/icon color     | `--content`         |
| `panelContent`   | Text color inside panels           | `--panel-content`   |
| `toolbarContent` | Text color inside the toolbar      | `--toolbar-content` |
| `viewerContent`  | Text color over the viewer surface | `--viewer-content`  |
| `galleryContent` | Text color inside the gallery      | `--gallery-content` |

### Per-panel overrides

Each panel's background and text default to `panelBg` / `panelContent`. Override one
panel without affecting the others. Setting `panelBg: 'green'` tints every panel;
additionally setting `metadataPanelBg: 'white'` overrides just the metadata panel.

| Keyword (`…Bg` / `…Content`) | Panel                        | CSS Variable (`…-bg` / `…-content`) |
| :--------------------------- | :--------------------------- | :---------------------------------- |
| `metadataPanel…`             | Information / metadata panel | `--metadata-panel-…`                |
| `annotationsPanel…`          | Annotations panel            | `--annotations-panel-…`             |
| `searchPanel…`               | Search panel                 | `--search-panel-…`                  |
| `structuresPanel…`           | Table-of-contents panel      | `--structures-panel-…`              |
| `collectionPanel…`           | Collection panel             | `--collection-panel-…`              |

Plugin panels follow `panelBg` too, and can be overridden via [`cssVars`](#raw-css-variables)
or raw CSS variables: `--image-manipulation-panel-bg`, `--pdf-export-panel-bg`,
`--annotation-editor-panel-bg` (and their `-content` counterparts).

### Border radius

The top-level trio sets the defaults; the per-region overrides inherit from them, so
you can keep everything consistent or fine-tune one region.

| Keyword                 | Description                                | Inherits      | CSS Variable                |
| :---------------------- | :----------------------------------------- | :------------ | :-------------------------- |
| `radiusBox`             | Large containers (cards, panels, popovers) | —             | `--radius-box`              |
| `radiusField`           | Inputs and buttons                         | —             | `--radius-field`            |
| `radiusSelector`        | Small selectors (checkboxes, badges)       | —             | `--radius-selector`         |
| `radiusToolbar`         | Toolbar corners                            | `radiusBox`   | `--radius-toolbar`          |
| `radiusPanels`          | Panel corners                              | `radiusBox`   | `--radius-panels`           |
| `radiusControls`        | Canvas-nav controls pill                   | `radiusBox`   | `--radius-controls`         |
| `radiusControlsButtons` | The buttons inside the canvas-nav pill     | `radiusField` | `--radius-controls-buttons` |

> **Want the classic pill?** The canvas-nav controls now inherit the box radius by
> default. To restore the fully-rounded capsule and circular buttons, set
> `radiusControls: '9999px'` and `radiusControlsButtons: '9999px'`.

### Sizing & effects

| Keyword        | Description                        | CSS Variable      | Example   |
| :------------- | :--------------------------------- | :---------------- | :-------- |
| `sizeField`    | Base padding/size for inputs       | `--size-field`    | `0.25rem` |
| `sizeSelector` | Base padding/size for selectors    | `--size-selector` | `0.25rem` |
| `border`       | Border width                       | `--border`        | `1px`     |
| `depth`        | Drop shadows (`1` = on, `0` = off) | `--depth`         | `1`       |
| `colorScheme`  | Browser UI hint (`light`/`dark`)   | `color-scheme`    | `light`   |

### Example Usage

=== "Web Component (HTML Attribute)"

    ```html
    <triiiceratops-viewer
        manifest-id="..."
        theme="light"
        theme-config='{"primary":"#ff0000","panelBg":"#fafafa","radiusBox":"0px"}'
    ></triiiceratops-viewer>
    ```

=== "Web Component (JavaScript)"

    ```html
    <triiiceratops-viewer manifest-id="..."></triiiceratops-viewer>

    <script>
        const viewer = document.querySelector('triiiceratops-viewer');
        viewer.theme = 'light';
        viewer.themeConfig = {
            primary: '#3b82f6',
            toolbarBg: '#1f2937',
            panelBg: '#f3f4f6',
            metadataPanelBg: '#ffffff',
            content: '#1f2937',
            radiusBox: '0.75rem',
            border: '2px',
        };
    </script>
    ```

=== "Svelte Component"

    ```svelte
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops';
        import 'triiiceratops/style.css';
        import type { ThemeConfig } from 'triiiceratops';

        const customTheme: ThemeConfig = {
            primary: '#0ea5e9',
            panelBg: '#0f172a',
            radiusBox: '1rem',
        };
    </script>

    <TriiiceratopsViewer manifestId="..." theme="light" themeConfig={customTheme} />
    ```

#### Raw CSS variables

For tokens without a typed key (e.g. plugin-panel overrides), use the `cssVars`
escape hatch. Keys are CSS variable names **without** the leading `--`, and values are
applied verbatim (no color normalization):

```js
viewer.themeConfig = {
    panelBg: 'oklch(20% 0.02 277)',
    cssVars: {
        'image-manipulation-panel-bg': '#11182f',
        'pdf-export-panel-bg': '#0b1020',
    },
};
```

---

## 3. Styling with CSS Variables

Because the tokens are plain custom properties that inherit through the shadow
boundary, you can theme the viewer entirely from your own CSS by targeting the host
element. This is equivalent to `themeConfig`, just authored as CSS:

```css
triiiceratops-viewer {
    --color-primary: oklch(65% 0.25 260);
    --panel-bg: #1e1e2e;
    --metadata-panel-bg: #181825; /* override one panel */
    --radius-box: 0;
    --radius-controls: 9999px; /* keep the controls pill rounded */
}
```

A selected built-in `theme` (which sets `data-theme`) wins over CSS variables you set
this way; `themeConfig` (inline styles) wins over everything. To switch among the
built-in themes by CSS alone, set the `data-theme` attribute on a parent or the host:

```html
<div data-theme="dracula">
    <triiiceratops-viewer manifest-id="..."></triiiceratops-viewer>
</div>
```
