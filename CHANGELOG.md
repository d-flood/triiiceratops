# triiiceratops

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
