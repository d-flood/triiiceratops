---
'@triiiceratops/plugin-annotation-editor': patch
---

Migrate onto the core-owned-chrome path and restore the panel presentation to the post-overhaul themed look: core now renders the toolbar button and provides the docked-panel / anchored-flyout surface, so the plugin no longer self-renders a toggle button or self-positions with `position: absolute` — `view.mount` renders content-only. The panel and default body editor render with the shared `@triiiceratops/ui` primitives (Button, Tooltip, Select, TextInput) on the current `--tri-` theme tokens, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). The editing surface declares `dismiss: 'explicit'` so a flyout is not dismissed by canvas clicks. No change to the store, adapter, display sync, undo/redo, Annotorious integration, or body-editor persistence behavior.

Consumes the core `triiiceratops/image-export` seam's canvas ↔ image coordinate-space helpers instead of carrying byte-identical copies of the core modules.

Supports the generic `config.plugins['annotation-editor'].position` runtime override (see the core changeset); the plugin's own `AnnotationEditorConfig.position` construction-time option is removed — it never actually reached rendering and was silently ignored.
