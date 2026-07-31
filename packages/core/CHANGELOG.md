# triiiceratops

## 1.0.0-rc.31

### Patch Changes

- 2f811cc: honor the start canvas in IIIF Presentation 2.x manifests (`sequences[].startCanvas`), not just the v3 `start` property

## 1.0.0-rc.30

### Patch Changes

- 7ff8c4b: improve performance of annotation overlays and tooltip positioning

## 1.0.0-rc.29

### Patch Changes

- 4eca8dc: Fix theme tokens not reaching the canvas in the Svelte (light-DOM) build. `OSDViewer`'s wrapper used the same `viewer-root` class as the real viewer root, and the published `triiiceratops/style.css` re-declares every base `--tri-*` / `--ui-*` token on that class — so the nested copy shadowed the root's `theme` prop and `themeConfig`, painting the canvas surface with the stock light `--tri-viewer-bg` (white) in every theme. The wrapper is now `osd-root`, so only the actual viewer root carries `viewer-root`.

    The bug only affected the packaged Svelte distribution; the custom-element (shadow DOM) build, dev, and source were never affected. `osd-root`/`viewer-root` are internal markup details, not documented styling hooks, but the class change is observable in the DOM — if you were selecting the inner `.viewer-root` element, target `.osd-root` instead.

- b6bc43f: Fix SDK plugin chrome being labelled with the raw package name. A plugin's toolbar tooltip/aria-label and its docked-panel header rendered `@triiiceratops/plugin-pdf-export` instead of "PDF Export": core passed `SdkPluginMeta.name` — the package-qualified identity — straight through as display copy, and then resolved it against CORE's message catalog, where a plugin's own title key never lives.

    `definePlugin` gains an optional `title`. Core resolves it through the plugin's OWN `catalog` in the viewer's active locale (English fallback), so plugin titles stay translated and follow a `config.locale` change; a `title` with no matching catalog key renders verbatim, so a monolingual plugin can just write `title: 'My Plugin'`. All four first-party plugins now declare their existing catalog title keys, restoring their localized names (`PDF Export` / `PDF-Export`, `Download Image` / `Bild herunterladen`, `Image Adjustments` / `Bildanpassungen`, `Annotation Editor` / `Anmerkungs-Editor`). The image-manipulation flyout's toggle and dialog `aria-label` now also agree with the label announced inside it.

    Backwards compatible: a plugin with no `title` renders exactly what it rendered before — its `name` looked up in core's catalog, else `name` verbatim — and the legacy `PluginDef` path, where `name` IS documented display copy, is unchanged. Do not work around this by overriding `name`: it keys the plugin registry, namespaces the plugin's injected styles, and sets `data-plugin-name`.

## 1.0.0-rc.28

### Minor Changes

- 809d6a6: Add an expandable thumbnail gallery — a full-column grid of every canvas, in the spirit of Mirador's gallery view. A small caret centered on the gallery's canvas-facing edge expands the docked strip/rail to fill the viewer's center column (a floating gallery gets a maximize button instead), animating open as a drawer sliding out of its dock edge — a bottom-docked strip grows upward. The caret keeps its edge across the transition, so it never jumps out from under the cursor; only its glyph flips to point the way the gallery will travel next. Side panels and the docked toolbar rail stay visible and usable, and OpenSeadragon keeps its size underneath, so collapsing never re-fits the image. Clicking a thumbnail selects that canvas and collapses back to it; `Escape` collapses without closing the gallery.

    The expanded view is the floating window's grid at viewer size — the same `gallery.fixedHeight` cell floor, padding, and gap — rather than a third layout with its own density, so the two cannot drift apart.

    New state on `ViewerState`: `galleryExpanded` (command state, via `setGalleryExpanded()` / `toggleGalleryExpanded()`, and reported in `ViewerStateSnapshot`); expanding implies opening the gallery, and closing the gallery clears it. Expanding leaves `dockSide` untouched, so collapsing restores the strip, rail, or floating window exactly where it was. New config: `gallery.expanded` to boot straight into the grid.

- 63fe1bb: Fix a plugin SDK regression: an SDK plugin could not tell whether its own panel or flyout was open. A legacy `PluginDef` learned this from its Svelte component's mount/destroy lifecycle, but core mounts an SDK plugin once and re-parents its content element in and out of the open surface (so Activation state survives close→reopen), and nothing replaced the lost signal. Three things blocked it: `ViewerState` had no public reader for plugin open state, the `pluginUiState` member was classified `internal` in the state inventory and therefore excluded from the framework-neutral subscription watcher, and `togglePluginOpen` — the toolbar-button path, i.e. how users actually open and close a plugin — notified nobody.

    New `PluginContext.surface` (`PluginSurface`) is the plugin's own chrome: `isOpen` and `target` are live getters over viewer state, so they compose with `context.selectors` like any other viewer state, and `open()`/`close()`/`toggle()` drive the same commands the toolbar does. It closes over the plugin's chrome id (also exposed as `surface.id`, the `config.plugins` key), so a plugin never re-derives it. `surface.close()` also restores the self-close affordance the legacy `close` prop provided. Open-state changes now notify from every write source alike: the toolbar button, flyout light-dismiss, `config.plugins[uiId].open`, and `ViewerState.setPluginOpen`.

    Supporting public API: `ViewerState.isPluginOpen(id)` (the read half of `setPluginOpen`), `ViewerState.togglePluginOpen(id)`, `ViewerState.ensurePluginUiState(id, target?, position?)` (host-facing chrome seeding), and `createPluginSurface`, exported from both `triiiceratops` and `triiiceratops/testing`. `setPluginOpen` now no-ops without notifying when the plugin is already in the requested state, matching `setPluginTarget`/`setPluginPosition`.

    The SDK test kit's `createTestViewerContext` exposes the REAL surface over the real state (new `uiId`, `target`, and `open` options; `surface.isOpen` defaults to `true` so a surface-gated plugin is exercised in its active state). A chrome-less host — a bare `runActivation` into a container the caller placed — gets an always-open stub with no-op movers, since nothing could be hiding the plugin's UI.

## 1.0.0-rc.27

### Patch Changes

- dfd84ab: Bundle the framework-neutral `triiiceratops/image-export` entry so Node ESM consumers can load it without extensionless relative imports, and inline the annotation editor's Annotorious stylesheet instead of emitting a Vite-only `?inline` package import.

## 1.0.0-rc.26

### Minor Changes

- 064bf1f: Add a core-owned-chrome activation path for SDK plugins, then complete the migration onto it as the only path. Core now renders a plugin's toolbar button from `meta.icon`/`target`, places the anchored flyout / docked panel container, and hands `view.mount` a content-only element; core owns open/close, anchoring, and dismiss (`SdkPluginMeta.dismiss`: `'light' | 'explicit'`, default `'light'`). A failed activation degrades silently (ADR 0010): logged, emitted on `pluginerror`, no toolbar button. The legacy SDK self-render path (the `tri-sdk-plugin-host` bare host) and the transitional `__coreChrome` routing marker are removed — every SDK plugin is chrome-managed unconditionally, one rendering path. Also fixes a latent a11y defect: the toolbar group separator is now an `<li role="separator">` rather than a bare `<div>` inside the actions `<ul>`.

    Let a consuming app decide where a plugin's docked panel opens, at runtime, for any plugin (SDK or legacy `PluginDef`): `config.plugins[id].position` (`'left' | 'right' | 'bottom' | 'overlay'`) reactively overrides the panel's dock side, mirroring the existing `target` override. New `ViewerState.getPluginPosition`/`setPluginPosition` mirror `getPluginTarget`/`setPluginTarget`. `PluginPanel.position` (the old static field baked on at registration) is removed — the effective position now lives only in reactive per-plugin UI state.

    Extend the `triiiceratops/image-export` seam with canvas ↔ image coordinate-space helpers (`canvasPointToImagePoint`, `imagePointToCanvasPoint`, `transformAnnotationToCanvasSpace`, `transformAnnotationToImageSpace`, `CanvasImageSpaceDimensions`) plus `resolveCanvasImage`/`getCanvasId`, so plugins can consume shared coordinate-space logic instead of carrying copies of core modules.

    Make the published TypeScript declarations resolve `OpenSeadragon` types for consumers without a manual `@types/openseadragon` install: `@types/openseadragon` is now a runtime dependency, and the public declarations naming OSD types (`viewerState.osdViewer`, `ViewerConfig.openSeadragonConfig`) reference the `openseadragon` module rather than an ambient global, so a strict-TypeScript consumer compiles under `skipLibCheck: false`. Also adds checked-in, machine-reviewable API snapshots (per-package declaration reports and `exports` maps, the custom-element property/event surface, the browser runtime shape and capabilities, the plugin API version and capability vocabulary, the public CSS token list, and the state inventory) and enables strict TypeScript with no `any` in public declarations across every package.

## 1.0.0-rc.25

### Minor Changes

- 35b071a: Annotation editor overhaul: the plugin now owns display sync (storage adapters are pure `load`/`hydrate`/`create`/`update`/`delete`), surfaces adapter failures via `onPersistenceError` with rollback and retry, adds a custom body editor API (Svelte or DOM `render` hook), adds persistence-aware undo/redo, adds UI configuration knobs and flyout rendering, and treats points as first-class IIIF `PointSelector` annotations with a shared `pointStyle` config for consistent read-only/edit rendering. The public types are generic over the annotation body (`AnnotationEditorConfig<TBody, THostContext>`, generic `W3CAnnotation`) and the `AnnotationStorageAdapter` contract is fully typed. Also fixes a data-loss bug (body save on a fresh annotation could trigger a spurious delete), a stale-cache race in `AnnotationStore.resolve()`, and de-duplicates the vendored Annotorious stylesheet in favor of a single imported source. Ships a vitest adapter conformance suite (`triiiceratops/plugins/annotation-editor/testing`) and expanded docs, including v1 adapter migration notes.

### Patch Changes

- 518c3e0: fix summary/description parsing for v2 manifests

## 1.0.0-rc.24

### Patch Changes

- Deprecated the annotation editor's global `triiiceratops:annotation-editor:request-edit` and `triiiceratops:annotation-editor:active-edit-id` window-event wiring. Events are still dispatched for one release, but in-viewer edit coordination now uses a per-viewer channel.

- b80c118: Fix race condition when passing both canvas id and manifest id as props; was resulting in defaulting to first canvas

## 1.0.0-rc.23

### Patch Changes

- 084a204: enable controlling visibility of the canvas info button

## 1.0.0-rc.22

### Patch Changes

- 0382794: add utility for automatically adjusting primary color for text to ensure sufficient contrast

## 1.0.0-rc.21

### Patch Changes

- 3e89ac7: Fix image adjustment plugin's slider styling

## 1.0.0-rc.20

### Patch Changes

- ec0f40c: remove collection count badge

## 1.0.0-rc.19

### Minor Changes

- 4595c5a: Add an `image-download` plugin for downloading the current canvas (or current multi-canvas view) as a raster image, with modes for composite canvases, a single image, and the current OSD view, plus IIIF `level0`-aware resolution options. Also fix `pdf-export` silently dropping every image after the first on a composite canvas (a canvas painted with more than one image) — it now composites all of them onto the PDF page.

    `pdf-export`'s toolbar/panel icon changed from `DownloadSimple` to `FilePdf` so it's visually distinct from the new `image-download` plugin's icon; the `DownloadSimple` named export from `triiiceratops/plugins/pdf-export` is replaced by `FilePdf`.

### Patch Changes

- ce3114d: Add image download plugin and custom select component

## 1.0.0-rc.18

### Minor Changes

- ee6d025: Remove Tailwind CSS and DaisyUI as dependencies. Styling is now plain vanilla CSS with CSS-variable theme tokens, so consumers no longer need any Tailwind/DaisyUI setup.

    **Breaking:** the `DaisyUITheme` type and `DAISYUI_THEMES` constant have been removed. Use `BuiltInTheme` and `BUILTIN_THEMES` instead — they expose the same values (`'light' | 'dark' | 'Teal' | 'dracula'`).

## 1.0.0-rc.17

### Patch Changes

- 4e76a88: make canvas info panel appear above gallery if they intersect, also center canvas panel over button

## 1.0.0-rc.16

### Patch Changes

- 7fdad1d: FINALLY removed the focus outline from OSD

## 1.0.0-rc.15

### Patch Changes

- b17c64c: Position all 4 toolbar positions fully in the corner of the viewer rather than having a small space. It looks less like a "tab" now but better when there are no border radii

## 1.0.0-rc.14

### Patch Changes

- 2152e37: remove `.select-none` from the search result container to allow text selection

## 1.0.0-rc.13

### Patch Changes

- 11093eb: Clean up five outstanding bugs: 1. Show collection label (#47); 2. Fix loading first manifest in a collection with wrong viewing direction (#46); 3. Only show canvas metadata button when there is additional info and also make it stand out a little more (#45); 4. Normalized image sizes for paged and continuous behaviors (#44); 5. Fix line from annotation label to annoation on canvas so it always attaches to the "inside" side of the label (#43).

## 1.0.0-rc.12

### Patch Changes

- 10ec26d: support multiple targets in v2 search responses

## 1.0.0-rc.11

### Patch Changes

- 97b1873: Don't use hover tooltip for search annotations

## 1.0.0-rc.10

### Patch Changes

- 8d1d9f5: Add IIFE plugins to build and publish workflow; they were missing from NPM

## 1.0.0-rc.9

### Patch Changes

- 0011af1: Expose start and end canvas selections from pdf export plugin to consuming app

## 1.0.0-rc.8

### Patch Changes

- 0c7b897: Add a getFilename callback optional prop for the PDF Export plugin

## 1.0.0-rc.7

### Patch Changes

- b9797c4: restore close buttons on panels and on config

## 1.0.0-rc.6

### Patch Changes

- 89e6da5: Update the tool panels to stack vertically instead of horizontally. Update PDF Export plugin to take a custom filename. This also includes a significant internal refactor that did not touch the public API.

## 1.0.0-rc.5

### Patch Changes

- cc7606c: Handle translations in v2 manifests

## 1.0.0-rc.4

### Patch Changes

- 6931472: Fully support provider with nested `seeAlso` and rename `MetadataDialog` to `MetadataPanel` internally

## 1.0.0-rc.3

### Patch Changes

- 5bbc06f: fix annotations and demo url state

## 1.0.0-rc.2

### Patch Changes

- 7574929: santize and style html from iiif resources, render all items of a label array, fix start canvas, better handling of canvas and image differing

## 1.0.0-rc.1

### Patch Changes

- f70ebe0: fallback to first canvas thumbnail if manifest level thumbnail not present and use for collections pane

## 1.0.0-rc.0

### Major Changes

- First 1.0 release candidate. Lots of small to medium changes made to support more of the IIIF spec. Triiiceratops is now roughly at parity with other popular viewers for images. We still don't support audio or video (or 3D) yet.

## 0.20.3

### Patch Changes

- 674d5c6: more accurate OCR text on PDF positioning

## 0.20.2

### Patch Changes

- 287db30: extend pdf export plugin

## 0.20.1

### Patch Changes

- c67ca74: Add hook for consuming application to add OCR text to canvases during PDF Export plugin export

## 0.20.0

### Minor Changes

- 2953dca: Change plugin configuration so that their visibility and state can be controlled through the config like core toolbar tools

## 0.19.5

### Patch Changes

- 1b20277: fix pdf export cover page data parsing

## 0.19.4

### Patch Changes

- c217cf6: add logging to pdf export

## 0.19.3

### Patch Changes

- f7b86b6: fix: improve canvas index handling in PDF export panel

## 0.19.2

### Patch Changes

- 0b103ab: harden pdf export plugin coversheet data shape

## 0.19.1

### Patch Changes

- 5c0a47f: Use inline styles for gallery thumbnails because Tailwind v4 is using @property which isn't working for the web component (presumeably because of shadow dom weirdness)

## 0.19.0

### Minor Changes

- 8f8f5d0: Add PDF Export plugin and a few small updates to core to support it

## 0.18.0

### Minor Changes

- 118dc37: Fix canvas choice objects for second canvas when in viewing mode; fix packaging for svelte component library to ensure it never incluces its own runtime

## 0.17.0

### Minor Changes

- 23e09d6: Enable adding a custom searchService callback prop and manifest json directly

## 0.16.11

### Patch Changes

- bdfccc2: fix falsely reported peer dependencies

## 0.16.10

### Patch Changes

- 3c4235d: refactor special level 0 source handling

## 0.16.9

### Patch Changes

- fbf59ca: more mobile regressions; cover with tests this time

## 0.16.8

### Patch Changes

- 315f7fb: complete mobile regression fix

## 0.16.7

### Patch Changes

- aaf6c5f: fix mobile rendering regression

## 0.16.6

### Patch Changes

- 182e5cf: change strategy for removing image on canvas change

## 0.16.5

### Patch Changes

- 05c2252: wip: level 0

## 0.16.4

### Patch Changes

- 4127fa3: check for 401 in background instead of blocking and continue working on continuous viewing stability

## 0.16.3

### Patch Changes

- 75e513a: fix level 0 regression

## 0.16.2

### Patch Changes

- 27d59a4: speed up and fix bugs in continuous mode

## 0.16.1

### Patch Changes

- 446096c: friendly 401 error message for info.json

## 0.16.0

### Minor Changes

- 0ee1fc4: Pass through OSD config; zoom to active canvas by default when viewing mode is continuous

## 0.15.6

### Patch Changes

- 4df4515: increase gallery height when docked top or bottom so active thumbnail ring is visible

## 0.15.5

### Patch Changes

- 05e136a: Display both canvas labels in paged viewing mode

## 0.15.4

### Patch Changes

- b4af2ea: disable default canvas selection if canvas_id is provided as prop

## 0.15.3

### Patch Changes

- 25edc3d: second attempt at fixing active canvas when behavior is paged

## 0.15.2

### Patch Changes

- 339a03b: Fix setting active canvas in 'paged' mode

## 0.15.1

### Patch Changes

- 3fa188f: fix active canvas on load

## 0.15.0

### Minor Changes

- 2eb3cfd: Display total results number; concatenate all exerpts per page with separator; add two-way sync between active search result and active canvas; rename toolbar position "top" to "top-right" and add new "top-left" position.

## 0.14.1

### Patch Changes

- 01f4b47: enable config to override manifest behavior setting

## 0.14.0

### Minor Changes

- d6408a8: Implement IIIF choice spec

## 0.13.0

### Minor Changes

- a65b845: Fully implment behavior (paged, individual, continuous) and viewing direction

## 0.12.8

### Patch Changes

- ed29800: Convert annotations component from a floating panel to a docked side panel (either side optional)

## 0.12.7

### Patch Changes

- 9a2546e: Improve toolbar button padding/spacing

## 0.12.6

### Patch Changes

- f2035ba: add pagedViewOffset to the config, demo, and docs

## 0.12.5

### Patch Changes

- 1fc99e2: fix canvas canvas discovery of iiif 2.0 pres api

## 0.12.4

### Patch Changes

- 5def8ef: Changed `viewingMode` from a getter to a dedicated `$state` property with its own getter/setter to try and fix an issue where 'paged' viewing mode wasn't working in one consuming application

## 0.12.3

### Patch Changes

- 9c95d95: Trying a different dynamic tooltip theming approach

## 0.12.2

### Patch Changes

- be75cc2: Pass themeConfig colors to the toolbar tooltips

## 0.12.1

### Patch Changes

- 60cca4f: Add manifest URL to metadata dialog

## 0.12.0

### Minor Changes

- 8dd3b38: New feature: viewing mode and customizeable thumbnail sizes

## 0.11.2

### Patch Changes

- d71cd9f: Add lint and format configs, resolve lint errors, run formatting, and make plugins SSR safe

## 0.11.1

### Patch Changes

- 1169712: make toolbar open button match canvas nav

## 0.11.0

### Minor Changes

- 39dcd99: Breaking change: combined the left and right menues into a single 'Toolbar'. The config has been renamed as well. There are now three positions for the single toolbar, left, right, and top. This release also includes zoom controls and double-click to zoom.

## 0.10.5

### Patch Changes

- a461715: fix bug preventing full screen toggling from web component

## 0.10.4

### Patch Changes

- fc9fc4a: show search spinner until search returns and visually indicate the clicked search result

## 0.10.3

### Patch Changes

- 8ebf1a0: enable search pane to be docked on left or right and configured

## 0.10.2

### Patch Changes

- 9f9e9f4: group search results by canvas, render the mark tag, scroll active thumbnail into view

## 0.10.1

### Patch Changes

- edbd565: syle scrollbars in gallery and search pane to be narrow; try to resolve race condition when initiating with a search query

## 0.10.0

### Minor Changes

- 8d71184: Major refactor of the plugin system AND added an initial annotation editor plugin

## 0.9.13

### Patch Changes

- c5cb50b: Enable transparent background config

## 0.9.12

### Patch Changes

- 8604959: Search panel width is not configurable

## 0.9.11

### Patch Changes

- 17eb020: exclude daisyui reset

## 0.9.10

### Patch Changes

- 4647d5d: scope daisyui to viewer root element

## 0.9.9

### Patch Changes

- 9ee87f0: paraglide hell

## 0.9.8

### Patch Changes

- 8c8aa10: more paraglide i18n fixes

## 0.9.7

### Patch Changes

- 997bf55: upgrade and use paraglide v2 API

## 0.9.6

### Patch Changes

- 3aa1826: maybe NOW the paraglide messages make it to npm...

## 0.9.5

### Patch Changes

- 923333c: build: Copy paraglide output to `dist` in `build:lib` script.

## 0.9.4

### Patch Changes

- 0dc41a7: compile i18n messages before builds

## 0.9.3

### Patch Changes

- 5ccb554: Move phospher-svelte to runtime deps

## 0.9.2

### Patch Changes

- 2a76f99: Change how styles are bundled

## 0.9.1

### Patch Changes

- ceba065: Remove css import from index.ts

## 0.9.0

### Minor Changes

- 8f2cf38: distribute as svelte component library package (not vite)

## 0.8.2

### Patch Changes

- 3192bf7: fix types in svelte component library build output and refactor OSD to import onMount

## 0.8.1

### Patch Changes

- 47f8517: internalize phospher-svelte

## 0.8.0

### Minor Changes

- 644f253: Make SSR safe for use in SvelteKit applications; expose iiif search query for external setting

## 0.7.2

### Patch Changes

- b8bb035: Fix right menu transition

## 0.7.1

### Patch Changes

- af4c4fc: When only one floating menu item is enabled, display it instead of the menu

## 0.7.0

### Minor Changes

- 3cac23b: Add both a config prop for initial state and two-way state binding (events for web component and bindable state for svelte environments)

## 0.6.0

### Minor Changes

- 407c2d3: Add a comprehensive theming system that supports selecting an existing theme, overriding some or all of a theme by passing values as a prop, or providing the Tailwind CSS and DaisyUI CSS file.

## 0.5.0

### Minor Changes

- 82e87a9: Expose the selected canvas state as a prop that can be changed by external actors

## 0.4.0

### Minor Changes

- e91c5ba: Add an initial plugin slot framework and add image filter tools as the first plugin to use it.

## 0.3.4

### Patch Changes

- 6c5a9bd: Metadata modal can overflow viewer container. Language change applies immediately to the annotation badge overaly.

## 0.3.3

### Patch Changes

- 61d4461: Update CI/CD to publish in a single PR rather than opening a second for the version bump.
- 2d79871: Fix thumbnail fetching for level 0 resources

## 0.3.0

### Minor Changes

- 1716ff0: Implement i18n (paraglide) and setup changeset and CI/CD
