# Overlay layers are DOM, the paint hook is pixels, and both exist because the substrates differ

Anything a reader must perceive or operate on the image is a real element in an **overlay
layer** — a DOM container `ViewerState.registerOverlayLayer` hands a plugin, placed in the
viewer's stage as a sibling of the renderer root. Painted pixels have no focus, no
accessible name, and no keyboard reach, and no automated accessibility scan can report an
element that does not exist, so a marker a reader clicks, a label a screen reader
announces, or a card they tab to cannot be drawn on the canvas at all. The **paint hook**
(`registerPaintLayer`) is the other half of the pair and is for decoration, or for a second
rendering of geometry the DOM already carries — a heat map under the pins, a thousand tick
marks nobody clicks. Core's own annotation shape overlay is built this way: geometry
projected once into pixels and once into focusable, labeled elements.

The consequences a plugin author sees follow from that split rather than from performance.
A layer's container origin is `canvasToScreen`'s origin, so a projected point is already
the container's own coordinates; the container is transparent to pointer events and
children opt in, so adding a layer cannot cost the reader panning; it is created once on
registration and removed once on dispose, never remounted in between, so a manifest change
leaves a plugin's DOM intact. Plugin layers render in **registration order**, all of them
below the viewer's own annotation shapes — those shapes are focusable targets carrying the
viewer's own accessible names, and stacking a plugin above them would silently cover them.
There is no ordering field: two plugins cannot coordinate one, and within a single plugin
one container with `z-index` on its children is less work than two layers. Ids are
`<pluginId>:<name>`, validated at registration, which makes cross-plugin collisions
impossible and lets `unregisterPlugin` release a layer whose plugin's own cleanup missed it
— orphaned DOM on the image has nothing else left to remove it. That backstop is not the
documented path; a plugin releases its layer from its `view.mount` cleanup, alongside its
styles.

The part that will be re-litigated: **the two registries are near-identical on purpose, and
must not be unified.** `renderer/overlayLayers.ts` is `renderer/paintLayers.ts` minus the
canvas-space maths and minus ordering, and a future consistency pass will read that as
duplication and propose folding overlay layers onto the paint hook, or importing one
registry into the other. Unifying onto the paint hook would look like a simplification,
would keep every test in this repository passing, and would silently delete
assistive-technology access to every plugin marker on the image — the failure is invisible
to the suite and to the person making the change, which is exactly why it is recorded here.
Neither hook is legacy and neither is a transitional step towards the other: the
substrates differ (a canvas context versus a DOM subtree), so the APIs may differ too, and
the paint hook keeps explicit ordering only because core interleaves its own layer with
consumers' inside one canvas context, where there is no `z-index` to fall back on. The
ownership rules above are deliberately **not** extended to `registerPaintLayer`: core
registers a paint layer of its own, so a mandatory plugin prefix there would require a
reserved core namespace — reworking shipped, working code for a leak that is invisible
because paint layers own no DOM. That asymmetry is not an oversight; the ownership logic
lives in `unregisterPlugin`, not in either registry, which is where it is discoverable.

The **input claim** remains a phase-2 API and is not a prerequisite for this capability.
Pointer events on a layer's content never traverse the renderer's surface element, because
a layer is a sibling of the renderer root and the renderer binds its gesture handling
inside that root — so a plugin's operable children work today with no negotiation, and the
empty space between them still pans the image. An input claim is for a consumer that wants
to suppress pan and zoom *while gesturing over the image itself*, which is a different
problem from owning a container over it.
