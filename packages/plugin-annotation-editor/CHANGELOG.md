# @triiiceratops/plugin-annotation-editor

## 1.0.0-rc.4

### Patch Changes

- Updated dependencies [809d6a6]
- Updated dependencies [63fe1bb]
    - triiiceratops@1.0.0-rc.28
    - @triiiceratops/plugin-sdk@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- dfd84ab: Bundle the framework-neutral `triiiceratops/image-export` entry so Node ESM consumers can load it without extensionless relative imports, and inline the annotation editor's Annotorious stylesheet instead of emitting a Vite-only `?inline` package import.
- Updated dependencies [dfd84ab]
    - triiiceratops@1.0.0-rc.27
    - @triiiceratops/plugin-sdk@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- c2505b4: Republish to supersede `1.0.0-rc.1`, whose published tarball carried
  `workspace:^` peer-dependency protocols on `triiiceratops` and
  `@triiiceratops/plugin-sdk` (leftover monorepo linking that was never rewritten
  to real semver ranges). npm cannot parse `workspace:` and crashed consumer
  installs with `EUNSUPPORTEDPROTOCOL`. The release pipeline now rewrites
  `workspace:` ranges before packing and hard-fails the pack on any residual
  `workspace:` protocol, so this cannot regress. No source changed — this
  changeset only cuts a new version through the corrected pipeline.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Patch Changes

- 064bf1f: Migrate onto the core-owned-chrome path and restore the panel presentation to the post-overhaul themed look: core now renders the toolbar button and provides the docked-panel / anchored-flyout surface, so the plugin no longer self-renders a toggle button or self-positions with `position: absolute` — `view.mount` renders content-only. The panel and default body editor render with the shared `@triiiceratops/ui` primitives (Button, Tooltip, Select, TextInput) on the current `--tri-` theme tokens, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). The editing surface declares `dismiss: 'explicit'` so a flyout is not dismissed by canvas clicks. No change to the store, adapter, display sync, undo/redo, Annotorious integration, or body-editor persistence behavior.

    Consumes the core `triiiceratops/image-export` seam's canvas ↔ image coordinate-space helpers instead of carrying byte-identical copies of the core modules.

    Supports the generic `config.plugins['annotation-editor'].position` runtime override (see the core changeset); the plugin's own `AnnotationEditorConfig.position` construction-time option is removed — it never actually reached rendering and was silently ignored.

- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
