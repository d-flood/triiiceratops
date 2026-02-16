# triiiceratops

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
