---
'@triiiceratops/plugin-av': minor
'triiiceratops': minor
---

Add `@triiiceratops/plugin-av`, the audiovisual plugin, and the shared Svelte runtime it consumes.

The plugin scans every canvas on activation and again on each manifest change, claims the ones whose only renderable content is time-based, and renders each claimed canvas's media as a `<video>`/`<audio>` element inside one overlay layer, projected over the canvas rect on every frame the viewport moves. The element never gets the native `controls` attribute — the transport is the viewer's — and carries `playsinline` and `preload="metadata"` so a manifest of twenty canvases does not fetch twenty files. Tapping the picture toggles playback. A media error (dead URL, undecodable format, blocked request) shows a localized "can't play" treatment inside that one stage: never the unsupported presentation, never an activation failure, and nothing on the plugin error channel. Ships ESM and IIFE builds.

Interim behavior this release is explicit about, both announced once per canvas on the developer console: a canvas whose duration is tiled by several time-based bodies plays the first of them, and a body targeting part of the canvas rect (`#xywh=`) is played over the whole rect. A duration-only audio canvas is deliberately **not** claimed yet — no plugin-facing query reports the layout rect core synthesizes for it, so claiming would replace core's honest unsupported-content treatment with a blank canvas.

Core now publishes a **shared Svelte runtime** on `window.Triiiceratops`: a hand-curated list of `svelte/internal/client` helpers plus `mount`/`unmount`/`getContext`, which `@triiiceratops/plugin-av`'s IIFE consumes instead of bundling a second copy of Svelte (13.24 KB gzip → 1.51 KB gzip on a representative component; core pays nothing, because it already used every helper on the list). This is a **first-party-only** arrangement: `svelte/internal` is private, unversioned API, and the guarantee behind it is that core and the plugin are built and released from one repository at one Svelte version. Third-party plugins keep bundling their own runtime, and the authoring guide keeps saying so.

Two consequences for hosts. `@triiiceratops/plugin-av`'s script must load **after** core's — it is the one plugin IIFE of which that is true, and loading it out of order logs one diagnostic naming the cause and does not register, rather than throwing. And the plugin pins `coreRange` to an exact core version rather than a lower bound, because only the exact version says the shared runtime is the *same* runtime.

Plugin API 1.1.0 → 1.2.0: core declares a third capability, `shared-svelte-runtime`. A plugin listing it in `requiredCapabilities` activates on this core and is refused, with a `PluginCompatibilityError` naming the capability, on one that shares no runtime.

New message keys: `av_title`, `av_cannot_play`.
