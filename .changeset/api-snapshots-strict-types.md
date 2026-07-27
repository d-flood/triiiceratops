---
'triiiceratops': patch
---

Make the published TypeScript declarations resolve `OpenSeadragon` types for consumers without a manual `@types/openseadragon` install: `@types/openseadragon` is now a runtime dependency of core, and the public declarations that name the OSD types (`viewerState.osdViewer`, `ViewerConfig.openSeadragonConfig`) reference the `openseadragon` module rather than an ambient global, so a strict-TypeScript consumer compiles under `skipLibCheck: false`. Also adds checked-in, machine-reviewable API snapshots (per-package declaration reports and `exports` maps, the custom-element property/event surface, the browser runtime shape and capabilities, the plugin API version and capability vocabulary, the public CSS token list, and the state inventory) and enables strict TypeScript with no `any` in public declarations across every package.
