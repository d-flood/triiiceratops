# An ellipse persists as a polygon, and core's projector gains no ellipse geometry

The annotation editor's ellipse tool is a **creation affordance only**. Dragging a bounding
box emits a 64-point polygon inscribed in it, stored as an ordinary `SvgSelector` holding a
`<polygon>`, and nothing anywhere records that the polygon was once an ellipse. Once
created, an ellipse edits as the polygon it is: vertex handles, like any other polygon.

The alternative — persist an `<ellipse>` (or a centre and two radii) and give core's shape
projector a fourth geometry to draw it with — is the one a reader will reach for, because the
faceting is visible if you go looking for it and an ellipse geometry looks like the obvious
fix. It was rejected for three reasons that point the same way.

**A round trip through a stored ellipse loses fidelity anyway.** Core's SVG selector parser
already approximates `<circle>` and `<ellipse>` into polygons on read, because that is what
its three-geometry projector can draw. Persisting an `<ellipse>` would mean an editor that
draws a true curve and a read-only overlay that degrades it — the editor showing the reader
something the viewer will not show them — and every save-and-reload would re-approximate.
Making it faithful means changing the parser and adding the fourth geometry to the projector,
which is the whole cost the "fix" was supposed to avoid.

**Storing ellipse-ness is a second representation of one shape**, and this project has
already refused that for points. ADR 0004 settled that a point is a `PointSelector` and
nothing else, rather than a `PointSelector` plus a legacy fragment-rectangle spelling; the
legacy read path that survived it is unreachable, because the predicate guarding it
classifies a fragment rectangle as a rectangle regardless of any legacy marker. An
"ellipse" flag alongside the polygon, kept so the editor could re-offer centre and radius
handles, would be exactly the same mistake with a different shape: two spellings for one
region, a non-standard extension in a W3C target, and an editor whose handle set depends on
provenance rather than on geometry.

**The faceting is not visible where it would matter.** 64 vertices rather than the more
common 32 keeps facet edges sub-pixel at the zoom levels a deep-zoom viewer actually reaches,
and it is a single constant to raise if that ever stops being true. A polygon is also what
the reader wants after creation: an ellipse traced around a seal is almost never a true
ellipse by the time it fits, and vertex handles let them correct it, where centre/radius
handles would not.

So the record is here to stop a specific future change. Someone will find the polygon,
recognise it as a discretised ellipse, read the faceting as a bug, and add an ellipse
geometry to core's projector to fix it — a change that would look like an improvement, would
break nothing in the suite, and would reintroduce a second representation of a region plus a
parser and projector asymmetry, in exchange for a curve nobody can see. A native ellipse
geometry in core is foreclosed by nothing; it is simply not needed once an ellipse persists
as a polygon.
