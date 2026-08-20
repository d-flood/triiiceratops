---
search:
  exclude: true
---

# Selectors choose a notification cadence; per-frame state is never mirrored into viewer state

Continuous viewport values (`viewportScale`, `viewportCentre`, `viewportBounds`,
`containerSize`) are read from the renderer on demand and are deliberately absent from the
inventoried members that drive `ViewerState.subscribe` (ADR 0008). To let framework
consumers read them reactively, the selector runtime carries a second, opt-in notification
cadence: a `frame` cadence driven by the renderer's own animation events, delivered
through `ViewerState.subscribeFrame`, alongside the default `state` cadence driven by the
batched member watcher. The projection, memoization, equality gate, and disposal are
identical in both — only what wakes the selector differs.

The obvious alternative — mirroring viewport values into `$state` fields and classifying
them as observable members — was rejected because the batched watcher would then fire at
animation framerate for every subscriber on the page, degrading every plugin to pay for
one consumer's zoom readout and destroying the batching guarantee ADR 0008 exists to
provide. The other alternative, shipping field-specific helpers (`useZoom`,
`useViewport`), was rejected because it multiplies public API per value and still leaves
the next non-notifying value unreachable; cadence is one parameter that generalizes to
all of them.

Consequences: there are two reasons a selector can wake, so "notification" alone is
ambiguous — say which cadence. `frame` is the *finer* cadence, never a coarser one: a
frame-cadence projection also wakes on state notifications, so it never serves a stale
inventoried member between animations. The frame ticker attaches lazily when a renderer
surface appears and detaches on teardown or replacement, so an idle viewer costs nothing
and no permanent `requestAnimationFrame` loop exists. Nothing about `ViewerState`, the
state inventory, batching, or the plugin subscription contract changes; cadence is a
selector concern only, and the plugin SDK's `selectors.select` signature is unchanged.

A `state`-cadence projection that reads `viewportScale`, `viewportCentre`, or
`viewportBounds` is a developer mistake — it will appear frozen — so the runtime warns
once under `debug`, names the member, and names the fix. (`containerSize` is query-only
too but changes only on resize, so the probe deliberately leaves it out of that watch
list; a `state`-cadence projection reading it is not the silent-freeze mistake.) Waiting
for the viewport to be answerable at all is `rendererReady`, which *is* an inventoried
observable member and is correctly read at `state` cadence.
