---
search:
  exclude: true
---

# The renderer is first-party with no pass-through, and capabilities retire with no successor

Core owns its deep-zoom renderer outright, so the renderer object is not public state and
there is no successor to `osdViewer`: what plugins and wrappers get instead is a small,
closed, first-party surface — viewport commands (`zoomIn`/`zoomOut`/`zoomTo`, `panTo`,
`fitBounds`, `fitCanvas`), query-only viewport values (`viewportScale`,
`viewportCentre`, `viewportBounds`, `containerSize`), canvas-space↔screen-space
coordinate helpers, an image-adjustment command, and a typed `config.renderer` knob set
— every member of it governed by core's own semver. Continuing to expose a renderer
object was rejected because the reason [ADR 0009](0009-osd-is-a-documented-pass-through.md)
gave for the pass-through has evaporated: the pass-through existed because the object's
methods belonged to a third party's versioning, so core could honestly promise only the
field's existence and its ready-timing. A first-party object has no such split, and
publishing it would newly bind core's internals to core's semver — strictly worse than
the surface above, which is testable without a DOM, hands out no live node, and survives
a rewrite of everything behind it. An open `Partial<RendererOptions>` config escape hatch
was rejected for the same reason in configuration form; it is the shape a hurried
implementer reaches for precisely because it defers the decision about which knobs are
real.

The part that will be re-litigated: **the `osd@5` runtime capability retires with no
successor, and `renderer@1` must not be introduced.** Someone will propose it in good
faith, reasoning that plugins need a way to negotiate the renderer's version before
touching it. They do not. Capability negotiation existed for exactly one problem — a
dependency whose major version core could bump without core's own version moving — and
core's own surface is already covered by core's version, which a plugin's peer range on
`triiiceratops` already expresses. A `renderer@1` capability would encode the same fact
twice, in two places that can disagree, and would restore the failure mode ADR 0009
closes with: a capability mismatch politely deactivating every renderer-touching plugin
on the page instead of failing where the incompatibility actually is. Plugins still
declaring `osd@5` fail activation, which is the correct outcome — the thing they asked
for is gone. The mechanism itself is unchanged and still available; it is the renderer
entry that has no reason to exist.
