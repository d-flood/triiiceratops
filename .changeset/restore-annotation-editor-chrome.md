---
'@triiiceratops/plugin-annotation-editor': patch
---

Migrate the annotation-editor onto the core-owned-chrome path (transitional `__coreChrome` marker) and restore its panel presentation to the post-overhaul themed look. Core now renders the toolbar button from the plugin metadata and provides the docked-panel / anchored-flyout surface, so the plugin no longer self-renders a toggle button or self-positions with `position: absolute`; `view.mount` renders content-only. The panel and default body editor render with the shared `@triiiceratops/ui` primitives (Button, Tooltip, Select, TextInput) on the current `--tri-` theme tokens. The editing surface declares `dismiss: 'explicit'` so a flyout is not dismissed by canvas clicks. No change to the store, adapter, display sync, undo/redo, Annotorious integration, or body-editor persistence behavior.
