---
'triiiceratops': patch
---

Bundle the framework-neutral `triiiceratops/image-export` entry so Node ESM consumers can load it without extensionless relative imports, and inline the annotation editor's Annotorious stylesheet instead of emitting a Vite-only `?inline` package import.
