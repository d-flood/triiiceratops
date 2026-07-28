# @triiiceratops/plugin-image-export

## 1.0.0-rc.2

### Minor Changes

- 2bdf833: Rename the package from `@triiiceratops/plugin-image-download` to `@triiiceratops/plugin-image-export`. npm's registry rejects the word "download" in new package names (400 "That word is not allowed"), so the package could not be published under its previous name. The plugin's registry id (the `definePlugin` name and the `window.Triiiceratops.plugins` key) tracks the package name and is now `@triiiceratops/plugin-image-export`. No runtime behavior, exported class (`ImageDownloadPlugin`), helper, or type name changes — only the package identity.

### Patch Changes

- triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Patch Changes

- 064bf1f: Migrate onto the core-owned-chrome path: core renders the toolbar button (from the plugin's icon) among the built-in buttons and owns open/close + docking. The self-rendered toggle and the corner `position: absolute` floating host are removed — `view.mount` renders only the panel content into the core-provided docked container. The panel's presentation is restored to the pre-monorepo themed look: controls render with the shared `@triiiceratops/ui` primitives (`Button`, `Select`) against the current `--tri-` theme tokens, in a body + footer layout matching the viewer's other docked panels, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). Download behavior (IIIF fetch/compositing, output formats) and the structured `pluginerror` reporting are unchanged.
- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
