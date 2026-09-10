# Modal drawing swallows pointer events in the DOM, and the input claim stays unshipped

The annotation editor's drawing layer is an **overlay layer**, and while a tool is armed its
root takes `pointer-events: auto` across the whole surface. A drag then draws instead of
panning, because an overlay layer is a sibling of the renderer root and stacks above it, so
the gesture never reaches the element the renderer binds its pointer handling inside. That
is the entire mechanism. Core was not changed for it, and the **input claim** — the API the
glossary has named since the gesture recognizer was built, where a consumer would ask the
arbiter for temporary ownership of pointer input — was not used and is still not built.

The obvious reading of that is that the claim was the right route and we took a shortcut
because it was cheaper. It is the wrong reading, and it is worth being explicit about
because the claim is a named, half-promised API and a reader who finds a drawing layer
shipped without one will assume something was missed. Granting a claim at the arbiter means
the renderer's own pointer handlers run and *then* decline the gesture, and three things
follow from their running that the DOM route avoids entirely. The renderer cancels momentum
unconditionally on `pointerdown`, so every vertex of a polygon would kill an in-flight
glide. It takes pointer capture on the surface element, so the drawing layer would be
negotiating for events the renderer already owns rather than receiving them first. And
worst, viewport stability would read *true* for the duration of the drag — the renderer
would believe it is holding a gesture — which ungates exactly the work that is gated on the
viewport being still: thumbnail fetches and `info.json` requests would fire under the
reader's hand while they drew. Suppressing pan is the easy half of a claim; not lying about
what the viewport is doing is the hard half, and the DOM route gets it for free by never
telling the renderer a gesture happened at all.

The rejected alternative, then, is not "do nothing" but **build the claim and route modal
drawing through the arbiter**. It was rejected on the mechanism, not the cost: it is a
strictly worse mechanism for this consumer, and building it for one hypothetical consumer
would also drag DOM concerns into a gesture arbiter that is deliberately DOM-free. The
consequence is recorded as an outcome rather than an omission: the input claim is unshipped
because the one consumer that was expected to need it does not, and the glossary now says so.
A future claim has to justify itself against a real consumer that gestures over the image
*without* owning a container above it.

Modal drawing costs one thing, and it is paid for explicitly. Pointer-drag panning is
suppressed while a tool is armed — that is the point — so the drawing layer implements
**hold Space to pan**, dropping its own `pointer-events` for as long as the key is held and
letting the renderer's gesture handling take over underneath. A drag already in flight when
Space goes down is discarded rather than committed, because the renderer never saw its
`pointerdown` and cannot adopt it. Everything else the reader needs mid-drawing keeps
working without any of this: wheel zoom is bound on the stage and explicitly accepts events
originating inside a plugin overlay layer, and keyboard zoom and arrow-key panning are bound
on the renderer root, which core deliberately returns focus to after a press on a plugin
layer. Those are not accidents of the layering; they are why full-surface `pointer-events`
is tolerable as a mode at all.

The failure mode to watch for is a future consistency pass reading `pointer-events: auto` on
a full-surface layer as heavy-handed and replacing it with hit-testing against the drawn
geometry, or with a claim once the API exists. Both would reintroduce the renderer's
handlers into the drawing path, and neither would fail a test in this repository — the shapes
would still be drawn, and the momentum-cancel and false-stability effects are invisible to
the suite. That is why it is here.
