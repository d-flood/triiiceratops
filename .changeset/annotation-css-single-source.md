---
'triiiceratops': patch
---

Annotation editor: the Annotorious stylesheet now has a single source of truth. The manager imports `@annotorious/openseadragon/annotorious-openseadragon.css?inline` and injects it (shadow-root aware) instead of carrying a vendored, minified copy with version-specific hashed class names that silently broke on any `@annotorious/*` upgrade. The panel's duplicate side-effect CSS import was removed. No API change.
