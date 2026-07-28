# @triiiceratops/plugin-pdf-export

## 1.0.0-rc.1

### Patch Changes

- 064bf1f: Render `@triiiceratops/ui` primitives (and the plugin's own components) with idiomatic, Svelte-scoped `<style>` blocks while staying CSP-safe under a strict `style-src`. The build extracts component CSS (`emitCss: true` + the `@triiiceratops/ui/vite` `bundledCss()` helper) into a single string installed through the root-aware, nonce-aware SDK style service, instead of Svelte's runtime `append_styles` injection (which appends an un-nonced `<style>` the browser blocks). No stray stylesheet ships; the bundle stays self-contained.
- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
