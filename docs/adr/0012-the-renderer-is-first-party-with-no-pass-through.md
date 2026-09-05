# The renderer is first-party with no pass-through, and no capability negotiates it

Core owns its deep-zoom renderer outright, so the renderer object is not public state.
What plugins and wrappers get instead is a small, closed, first-party surface — viewport
commands (`zoomIn`/`zoomOut`/`zoomTo`, `panTo`, `fitBounds`, `fitCanvas`), query-only
viewport values (`viewportScale`, `viewportCentre`, `viewportBounds`, `containerSize`),
canvas-space↔screen-space coordinate helpers, an image-adjustment command, and a typed
`config.renderer` knob set — every member of it governed by core's own semver.

Handing out the renderer object was rejected. A pass-through is only ever worth its cost
when the object's methods belong to a third party's versioning: core can then honestly
promise the field's existence and its ready-timing while disclaiming the surface behind
it. A first-party object has no such split, so publishing it would newly bind core's
internals to core's semver — strictly worse than the surface above, which is testable
without a DOM, hands out no live node, and survives a rewrite of everything behind it. An
open `Partial<RendererOptions>` config escape hatch was rejected for the same reason in
configuration form; it is the shape a hurried implementer reaches for precisely because
it defers the decision about which knobs are real.

The part that will be re-litigated: **no runtime capability describes the renderer, and
`renderer@1` must not be introduced.** Someone will propose it in good faith, reasoning
that plugins need a way to negotiate the renderer's version before touching it. They do
not. Capability negotiation exists for genuinely optional runtime *seams* a plugin fails
closed without — not for versions. The renderer's surface is covered by core's own
version, which a plugin's `coreRange` already expresses. A `renderer@1` capability would
encode the same fact twice, in two places that can disagree, and would introduce a
failure mode worth naming: a capability mismatch politely deactivating every
renderer-touching plugin on the page instead of failing where the incompatibility
actually is. The mechanism itself is unchanged and still available for real seams
(`canvas-claim`, `published-state`, `transport-chrome`, and the shared-runtime pair); it
is the renderer entry that has no reason to exist.
