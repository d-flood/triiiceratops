---
search:
  exclude: true
---

# Selectors choose a notification cadence; per-frame state is never mirrored into viewer state

Continuous viewport values (zoom, pan, rotation, bounds) live on the OSD instance and are
deliberately absent from the inventoried members that drive `ViewerState.subscribe`
(ADR 0008). To let framework consumers read them reactively, the selector runtime gained a
second, opt-in notification cadence: a `frame` cadence driven by the live OSD instance's
own `animation` / `viewport-change` / `animation-finish` events, alongside the default
`state` cadence driven by the batched member watcher. The projection, memoization,
equality gate, and disposal are identical in both — only what wakes the selector differs.

The obvious alternative — mirroring viewport values into `$state` fields and classifying
them as observable members — was rejected because the batched watcher would then fire at
animation framerate for every subscriber on the page, degrading every plugin to pay for
one consumer's zoom readout and destroying the batching guarantee ADR 0008 exists to
provide. The other alternative, shipping field-specific helpers (`useZoom`,
`useViewport`), was rejected because it multiplies public API per value and still leaves
the next non-notifying value unreachable; cadence is one parameter that generalizes to
all of them.

Consequences: there are now two reasons a selector can wake, so "notification" alone is
ambiguous — say which cadence. The frame ticker attaches lazily when an OSD instance
appears and detaches on teardown or replacement, so an idle viewer costs nothing and no
permanent `requestAnimationFrame` loop exists. Nothing about `ViewerState`, the state
inventory, batching, or the plugin subscription contract changes; cadence is a selector
concern only, and is wrapper-facing first (the plugin SDK's `selectors.select` signature
is unchanged). A `state`-cadence projection that reads through `osd` is a developer
mistake — it will appear frozen — so it warns in development and names the fix.

**Amended for the first-party renderer.** The two paragraphs above describe the OSD era
and are kept as the record of why cadence exists; the OpenSeadragon instance they name is
gone ([ADR 0012](0012-the-renderer-is-first-party-with-no-pass-through.md)). The decision
survives intact and only its **event source** moved: `frame` is now driven by the
renderer's own animation events, delivered through `ViewerState.subscribeFrame`, in place
of a third party's `animation` / `viewport-change` / `animation-finish` names. Everything
else holds unchanged — the values are still query-only and still never mirrored into
inventoried state, `frame` is still the *finer* cadence (a frame-cadence projection also
wakes on state notifications, so it never serves a stale inventoried member between
animations), the ticker still attaches lazily and detaches on teardown or replacement with
no permanent `requestAnimationFrame` loop, and the projection, memoization, equality gate,
and disposal are identical in both cadences. The developer mistake it warns about is
unchanged in substance and only in spelling: a `state`-cadence projection reading
`viewportScale`, `viewportCentre`, or `viewportBounds` appears frozen, so the runtime
warns once under `debug`, names the member, and names the fix. (`containerSize` is
query-only too but changes only on resize, so the probe deliberately leaves it out of that
watch list — a `state`-cadence projection reading it is not the silent-freeze mistake it
warns about.) Waiting for the viewport to be answerable at all is `rendererReady`, which
*is* an inventoried observable member and is correctly read at `state` cadence.
