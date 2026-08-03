---
icon: lucide/palette
---

# Theming and Styling

Triiiceratops ships a small set of vanilla-CSS design tokens. There are three ways to
style the viewer, from easiest to most granular:

1. Pick a **built-in theme** (`theme` prop).
2. Override tokens with the **`themeConfig` prop** (typed, friendly names).
3. Set the underlying **CSS variables** directly on the host element.

These aren't exclusive tiers you have to climb in order — you can override
just one piece of a built-in theme (e.g. tweak `primary` via `themeConfig`
while keeping `dark`'s other tokens as-is), or skip built-in themes entirely
and build a fully custom theme from scratch by setting the CSS variables
yourself.

These three are the **whole** styling surface. The viewer's shadow-DOM internals
are not reachable from the outside: there is no `::part()` surface, no way to
inject a consumer stylesheet into the shadow root, and no light-DOM styling hook
for internal elements. Everything about the **host** element — layout, size,
borders, and any CSS that treats it as a box in your page — is yours as usual.

Every host takes the same two inputs, `theme` and `themeConfig` — as props in
[React](react.md), [Vue](vue.md), and [Svelte](svelte.md), and as an attribute
plus a property on the [custom element](integration.md). Pick your stack's tab in
the examples below.

All three compose, but they do not have equal precedence. From lowest to highest:
OS-aware default tokens, CSS variables inherited from the host/page, an explicit
built-in `theme`, then `themeConfig` inline styles. If you set `theme`, that
selected theme wins over CSS variables set outside the viewer; use `themeConfig`
for overrides that must win over an explicit built-in theme.

## 1. Built-in Themes

Four themes ship with the viewer: two light (`light`, `teal`) and two dark
(`dark`, `dracula`). Theme names are case-sensitive. When no theme is set, the
viewer follows the OS `prefers-color-scheme` defaults and can inherit CSS
variables from the host/page.

=== "HTML"

    ```html
    <triiiceratops-viewer manifest-id="..." theme="dark"></triiiceratops-viewer>
    ```

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';

    export function Reader() {
        return <TriiiceratopsViewer manifestId="..." theme="dracula" />;
    }
    ```

=== "Vue"

    ```vue
    <template>
        <TriiiceratopsViewer manifest-id="..." theme="dracula" />
    </template>
    ```

=== "Svelte"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';
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
| `primary`        | Primary brand color (buttons, active states) | `--tri-color-primary`         |
| `primaryContent` | Text color on a primary background           | `--tri-color-primary-content` |
| `neutral`        | Neutral color (tooltips, active menu items)  | `--tri-color-neutral`         |
| `neutralContent` | Text color on a neutral background           | `--tri-color-neutral-content` |
| `success`        | Success state                                | `--tri-color-success`         |
| `successContent` | Text color on a success background           | `--tri-color-success-content` |
| `warning`        | Warning state                                | `--tri-color-warning`         |
| `warningContent` | Text color on a warning background           | `--tri-color-warning-content` |
| `error`          | Error state                                  | `--tri-color-error`           |
| `errorContent`   | Text color on an error background            | `--tri-color-error-content`   |

### Surfaces

Surfaces are named by the region they paint. `panelBg` is the default for **every**
panel (including plugin panels); `galleryBg` and `inputBg` follow `viewerBg` by
default.

| Keyword         | Description                              | CSS Variable       |
| :-------------- | :--------------------------------------- | :----------------- |
| `viewerBg`      | Main viewer/canvas background            | `--tri-viewer-bg`      |
| `toolbarBg`     | Toolbar + canvas-nav controls background | `--tri-toolbar-bg`     |
| `panelBg`       | Default background for all side panels   | `--tri-panel-bg`       |
| `galleryBg`     | Thumbnail gallery background             | `--tri-gallery-bg`     |
| `inputBg`       | Form input/control surface               | `--tri-input-bg`       |
| `surfaceBorder` | Borders and dividers                     | `--tri-surface-border` |

### Content (foreground)

`content` is the global text/icon color. The per-region tokens below inherit from it
and let you retint text in one region without touching the rest.

| Keyword          | Description                        | CSS Variable        |
| :--------------- | :--------------------------------- | :------------------ |
| `content`        | Global default text/icon color     | `--tri-content`         |
| `panelContent`   | Text color inside panels           | `--tri-panel-content`   |
| `toolbarContent` | Text color inside the toolbar      | `--tri-toolbar-content` |
| `viewerContent`  | Text color over the viewer surface | `--tri-viewer-content`  |
| `galleryContent` | Text color inside the gallery      | `--tri-gallery-content` |

### Per-panel overrides

Each panel's background and text default to `panelBg` / `panelContent`. Override one
panel without affecting the others. Setting `panelBg: 'green'` tints every panel;
additionally setting `metadataPanelBg: 'white'` overrides just the metadata panel.

| Keyword (`…Bg` / `…Content`) | Panel                        | CSS Variable (`…-bg` / `…-content`) |
| :--------------------------- | :--------------------------- | :---------------------------------- |
| `metadataPanel…`             | Information / metadata panel | `--tri-metadata-panel-…`            |
| `annotationsPanel…`          | Annotations panel            | `--tri-annotations-panel-…`         |
| `searchPanel…`               | Search panel                 | `--tri-search-panel-…`              |
| `structuresPanel…`           | Table-of-contents panel      | `--tri-structures-panel-…`          |
| `collectionPanel…`           | Collection panel             | `--tri-collection-panel-…`          |

Plugin panels follow `panelBg` too, and can be overridden via [`cssVars`](#raw-css-variables)
or raw CSS variables: `--tri-pdf-export-panel-bg` and `--tri-annotation-editor-panel-bg` (and
their `-content` counterparts).

### Border radius

The top-level trio sets the defaults; the per-region overrides inherit from them, so
you can keep everything consistent or fine-tune one region.

| Keyword                 | Description                                | Inherits        | CSS Variable                |
| :---------------------- | :----------------------------------------- | :-------------- | :-------------------------- |
| `radiusBox`             | Large containers (cards, panels, popovers) | —               | `--tri-radius-box`              |
| `radiusButtons`         | Buttons, inputs, and button groups         | —               | `--tri-radius-buttons`          |
| `radiusSelector`        | Small selectors (checkboxes, badges)       | —               | `--tri-radius-selector`         |
| `radiusToolbar`         | Toolbar corners                            | `radiusButtons` | `--tri-radius-toolbar`          |
| `radiusPanels`          | Panel corners                              | `radiusBox`     | `--tri-radius-panels`           |
| `radiusControls`        | Canvas-nav controls pill                   | `radiusButtons` | `--tri-radius-controls`         |
| `radiusControlsButtons` | The buttons inside the canvas-nav pill     | `radiusButtons` | `--tri-radius-controls-buttons` |

> **Want the classic pill?** The canvas-nav controls now inherit the button radius by
> default. To restore the fully-rounded capsule and circular buttons, set
> `radiusControls: '9999px'` and `radiusControlsButtons: '9999px'`.

### Sizing & effects

| Keyword        | Description                        | CSS Variable      | Example   |
| :------------- | :--------------------------------- | :---------------- | :-------- |
| `sizeField`    | Base padding/size for inputs       | `--tri-size-field`    | `0.25rem` |
| `sizeSelector` | Base padding/size for selectors    | `--tri-size-selector` | `0.25rem` |
| `border`       | Border width                       | `--tri-border`        | `1px`     |
| `depth`        | Drop shadows (`1` = on, `0` = off) | `--tri-depth`         | `1`       |
| `colorScheme`  | Browser UI hint (`light`/`dark`)   | `color-scheme`    | `light`   |

### Complete public token reference

Every token below is part of the **semver-governed public customization surface**.
Variables outside the `--tri-*` namespace (for example `--ui-*` layout plumbing or
component-local `--btn-*` / `--range-*` variables) are internal implementation
details with no stability guarantee. Set a token either by its `themeConfig` key
or by writing the raw CSS variable; tokens marked `— (raw only)` have no typed key
and must be set through [`cssVars`](#raw-css-variables) or plain CSS.

!!! note "This table is generated"

    The table below is generated from `packages/core/src/lib/theme/publicTokens.ts`
    — the single source of truth also consumed by the public-token API snapshot.
    A test (`themingDocsTable.test.ts`) fails if it drifts, so it is never
    hand-edited.

<!-- BEGIN GENERATED PUBLIC TOKEN TABLE (source: packages/core/src/lib/theme/publicTokens.ts) -->

#### Palette

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-color-primary` | `primary` |
| `--tri-color-primary-content` | `primaryContent` |
| `--tri-color-primary-text` | — (raw only) |
| `--tri-color-neutral` | `neutral` |
| `--tri-color-neutral-content` | `neutralContent` |
| `--tri-color-success` | `success` |
| `--tri-color-success-content` | `successContent` |
| `--tri-color-warning` | `warning` |
| `--tri-color-warning-content` | `warningContent` |
| `--tri-color-error` | `error` |
| `--tri-color-error-content` | `errorContent` |

#### Surfaces

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-viewer-bg` | `viewerBg` |
| `--tri-toolbar-bg` | `toolbarBg` |
| `--tri-panel-bg` | `panelBg` |
| `--tri-gallery-bg` | `galleryBg` |
| `--tri-input-bg` | `inputBg` |
| `--tri-surface-border` | `surfaceBorder` |

#### Content / foreground

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-content` | `content` |
| `--tri-panel-content` | `panelContent` |
| `--tri-toolbar-content` | `toolbarContent` |
| `--tri-viewer-content` | `viewerContent` |
| `--tri-gallery-content` | `galleryContent` |

#### Per-panel overrides

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-metadata-panel-bg` | `metadataPanelBg` |
| `--tri-metadata-panel-content` | `metadataPanelContent` |
| `--tri-annotations-panel-bg` | `annotationsPanelBg` |
| `--tri-annotations-panel-content` | `annotationsPanelContent` |
| `--tri-search-panel-bg` | `searchPanelBg` |
| `--tri-search-panel-content` | `searchPanelContent` |
| `--tri-structures-panel-bg` | `structuresPanelBg` |
| `--tri-structures-panel-content` | `structuresPanelContent` |
| `--tri-collection-panel-bg` | `collectionPanelBg` |
| `--tri-collection-panel-content` | `collectionPanelContent` |

#### Border radius

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-radius-selector` | `radiusSelector` |
| `--tri-radius-buttons` | `radiusButtons` |
| `--tri-radius-box` | `radiusBox` |
| `--tri-radius-toolbar` | `radiusToolbar` |
| `--tri-radius-panels` | `radiusPanels` |
| `--tri-radius-controls` | `radiusControls` |
| `--tri-radius-controls-buttons` | `radiusControlsButtons` |

#### Sizing

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-size-selector` | `sizeSelector` |
| `--tri-size-field` | `sizeField` |

#### Border / effects

| CSS variable | `themeConfig` key |
| :----------- | :---------------- |
| `--tri-border` | `border` |
| `--tri-depth` | `depth` |

<!-- END GENERATED PUBLIC TOKEN TABLE -->

### Example Usage

=== "HTML"

    As an attribute, JSON-encoded:

    ```html
    <triiiceratops-viewer
        manifest-id="..."
        theme="light"
        theme-config='{"primary":"#ff0000","panelBg":"#fafafa","radiusBox":"0px"}'
    ></triiiceratops-viewer>
    ```

    Or as a property, from JavaScript:

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

    Assign a new `themeConfig` object when updating from JavaScript. Mutating a
    nested property on the existing object does not notify the custom element.

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';
    import type { ThemeConfig } from 'triiiceratops';

    // Defined outside the component (or memoized) so the wrapper's shallow
    // equality check sees a stable value and never re-applies it.
    const customTheme: ThemeConfig = {
        primary: '#0ea5e9',
        panelBg: '#0f172a',
        radiusBox: '1rem',
    };

    export function Reader() {
        return (
            <TriiiceratopsViewer
                manifestId="..."
                theme="light"
                themeConfig={customTheme}
            />
        );
    }
    ```

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { shallowRef } from 'vue';
    import { TriiiceratopsViewer } from 'triiiceratops/vue';
    import type { ThemeConfig } from 'triiiceratops';

    const customTheme = shallowRef<ThemeConfig>({
        primary: '#0ea5e9',
        panelBg: '#0f172a',
        radiusBox: '1rem',
    });
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="..."
            theme="light"
            :theme-config="customTheme"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';
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
        'tri-image-manipulation-panel-bg': '#11182f',
        'tri-pdf-export-panel-bg': '#0b1020',
    },
};
```

---

## 3. Styling with CSS Variables

Because the tokens are plain custom properties that inherit through the shadow
boundary, you can theme the viewer from your own CSS by targeting the host element.
This is equivalent to `themeConfig` only when no explicit `theme` is set; if a
built-in `theme` is selected, the theme's token values win over host CSS variables.

```css
triiiceratops-viewer {
    --tri-color-primary: oklch(65% 0.25 260);
    --tri-panel-bg: #1e1e2e;
    --tri-metadata-panel-bg: #181825; /* override one panel */
    --tri-radius-box: 0;
    --tri-radius-controls: 9999px; /* keep the controls pill rounded */
}
```

A selected built-in `theme` wins over CSS variables you set this way;
`themeConfig` (inline styles) wins over everything. In Svelte/light-DOM usage, you
can also switch among built-in themes by setting `data-theme` on an ancestor when
you leave the viewer's `theme` prop unset:

```html
<div data-theme="dracula">
    <TriiiceratopsViewer manifestId="..." />
</div>
```

For the web component, prefer the `theme` attribute/property for built-in themes:

```html
<triiiceratops-viewer manifest-id="..." theme="dracula"></triiiceratops-viewer>
```
