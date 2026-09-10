# The editing surface is first-party, core draws the set, and the editing claim is deferred

The annotation editor's drawing surface is written in this repository, on core's own
published primitives — an overlay layer for the DOM it owns, `canvasToScreen` /
`screenToCanvas` for projection, `subscribeFrame` for reprojection — and
`@annotorious/annotorious`, `@annotorious/openseadragon` and `openseadragon` are gone from
the plugin's dependencies. This **supersedes the premise of ADR 0002** while keeping its
conclusion, which is the part worth recording: the split it describes survives its own
justification.

Annotorious went because the coupling it needed no longer exists and should not be
recreated. Its OpenSeadragon integration is constructed *from* the raw viewer instance core
stopped handing out when the renderer became first-party, and there is no member of the new
API to pass it instead. But the breakage is the occasion, not the argument. Three things
were already wrong. It was heavy and thinly used — it drove drawing and nothing else, while
the store, the adapter seam, the body editor and undo/redo never touched it. It fought the
domain hard enough to need three ADRs (0002, 0003, 0004) to contain its in-memory store
competing with the adapter, its undo stack resurrecting deleted annotations, and its missing
point tool forcing points through a fragment-rectangle round trip. And its accessibility
model was its own SVG layer, which is not the one core adopted: core projects every
annotation twice, once into pixels and once into focusable, labelled elements, and an
editing surface that does not do the same silently drops assistive-technology access to the
very shape the reader is working on.

**A headless Annotorious was considered and rejected.** Its core package is separable from
its OpenSeadragon binding, so keeping the store and shape model and writing only a new
rendering adapter looked like the smaller change. It is smaller in lines and larger in
everything else. It keeps the competing in-memory store that ADR 0002 exists to contain, it
keeps the undo stack ADR 0003 exists to work around, it keeps a third party's shape model
between the editor and the canvas coordinates the adapter persists, and it does nothing at
all for the accessibility problem, which lives in the rendering half we would have been
replacing anyway. The dependency's remaining value was drawing; drawing is what we were
rewriting. Also rejected, earlier and for the record: a compatibility shim reconstructing
the ~14 viewport/world methods and 6 events Annotorious needs, which would have rebuilt
exactly the coupling to a third party's object model that removing the pass-through was for.

ADR 0002's conclusion stands with substituted reasoning. Core's shape overlay renders every
persisted annotation and owns hover and selection; the drawing layer renders only the
annotation currently under edit, its handles, and the in-progress preview. The old reason was
to stop Annotorious's store competing with the adapter as a source of truth. There is no
such store now, and the reason is better: core's shapes are the **accessible** targets —
focusable, labelled, keyboard-operable — and an editor that drew the set too would either
double every shape visually or duplicate those targets, which means two tab stops per
annotation and two accessible names that can disagree. Suppression of the one doubled shape
goes through the existing per-viewer edit channel: setting the active edit annotation id
makes core's overlay drop exactly that shape, on the stated grounds that the editor is
drawing it instead.

**The editing claim is deferred, deliberately, and that is the other half of this record.**
Two pieces of that channel are shabbier than the rest of the seam and both stay. Core decides
whether an annotation is editable by finding a toolbar button whose plugin id is the literal
string `'annotation-editor'`, which hard-codes which single plugin may make an annotation
editable. And the plugin installs its request-edit handler by replacing a function on core's
state object, restoring the previous value on teardown. The replacement for the first is an
editing claim a plugin declares — an "annotation editing is open" state on
`ViewerState.annotationEditBus`, set by whoever is editing, so core reads a capability rather
than a name — and for the second, promoting the channel to stable public API.

Neither was done here. Promoting them is core API design whose only payoff arrives when a
*second* plugin wants to make annotations editable, which is the far-future audiovisual
annotation editor, and doing core API design inside a plugin rewrite widens the blast radius
of the rewrite for no user-visible gain. The alternative rejected is therefore "design the
editing claim now, while the editor is already being rebuilt onto it" — rejected because a
claim API designed with exactly one consumer is a claim API shaped like that consumer, and
the second consumer is the one that would tell us what the shape should be. Two consequences
are load-bearing and must be honoured: the plugin **keeps `uiId: 'annotation-editor'`**, or
nothing in the viewer becomes editable and no test in the plugin's own package would catch
it; and core's `TODO` reads as known debt pointing here, rather than as an oversight
somebody should tidy.
