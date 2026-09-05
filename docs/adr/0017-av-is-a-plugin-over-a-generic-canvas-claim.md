# AV is a plugin over a generic canvas claim, and core classifies what it will never render

Time-based media (canvases with `duration`, painting bodies of type Video or Sound, HLS
delivery) is implemented entirely in `@triiiceratops/plugin-av`. Core gains exactly two
things, both media-agnostic. First, a **body-type classifier** in canvas→source
resolution: non-image painting bodies never enter the image pipeline, so a video URL is
never fetched with `new Image()`, never poisons the negative cache, and never leaks into
the thumbnail fallback; a canvas whose renderable content is non-image and empty gets the
**unsupported presentation** — a first-class placeholder, not a `CanvasErrorKind`. Second,
a **canvas claim**: a plugin may own the non-image content of a canvas, which suppresses
the unsupported presentation and nothing else. Layout, navigation, coordinate projection,
and — deliberately — core's painting of any *image* bodies on that canvas all continue
unchanged. The claimant renders its media through the overlay-layer and paint-hook
substrates it already has (ADR 0016), so the media element is DOM and the waveform is
pixels, exactly where each belongs.

!!! note "Amended: the waveform does not use the paint hook"

    The sentence above is right that the waveform is *pixels* in ADR 0016's sense,
    but wrong about where they are drawn. Implementation (`plugin-av` ticket 10)
    established that the paint hook draws into the **renderer's** canvas, which the
    plugin's overlay layer sits on top of; because a stage is an opaque box, a
    waveform painted underneath it would simply be invisible. The waveform is
    therefore its own `<canvas>` nested inside the stage's timeline lane, within the
    overlay layer — see `packages/plugin-av/src/waveform/surface.ts`. Only the
    substrate named here is superseded; the ADR's decision, and ADR 0016's
    pixels-versus-operable-targets rule that motivates it, are unchanged.

Considered and rejected: an **AV-included core build** (a second element artifact family —
a second row in every size gate, a second reproducible-build path, and AV bytes that
cannot be lazy-loaded out of image-only sessions without doing the plugin work anyway); an
**AV-typed seam** (core marks canvases "AV" and the plugin implicitly owns them — core and
plugin must then agree forever on what AV *is*, and every future non-image medium needs a
new seam); and a **claim that suppresses all core rendering**. The last one matters most
for re-litigation, because "claimed means core paints nothing" sounds cleaner: it would
break the IIIF Cookbook's composite shapes. An `accompanyingCanvas` image beside audio and
a `placeholderCanvas` poster are separate Canvas resources core never painted, but a
canvas with image *and* AV bodies painted together in `items[]` relies on core's tile
pipeline continuing under the claimant's overlay. The claim is scoped to non-image content
precisely so compositing is free and the seam stays generic — a future 3D plugin claims a
canvas whose Model body core already classifies as non-image, and gets the same clean box.

!!! note "Amended: companion canvases are core's to paint, and the claimant supplies only timing"

    The rejected-alternatives passage above names `accompanyingCanvas` and
    `placeholderCanvas` among the "separate Canvas resources core never painted."
    That was a description of the wiring at the time, not a principle, and the
    `paint-companion-canvases` epic reverses it: **core resolves and paints both
    companions itself**, through the same descriptor builder and tile ladder every
    other canvas goes through, into the claimed canvas's rect. A companion is a
    Canvas, so it deep-zooms, pans and honours Choice, region placements and both id
    spellings for free — none of which the plugin's own resolver ever handled.

    **The claimant supplies only *timing*.** Knowing that playback has started is the
    one thing core cannot know, so that is the entire contribution: a
    `setCompanionPhase` command naming `'none' | 'placeholder' | 'accompanying'` for
    a canvas the caller has claimed.

    **An enum, not a Canvas payload**, deliberately. A payload would put
    plugin-supplied JSON into core's planner — a second, unversioned way for a
    resource to reach the tile pipeline, and a second thing to validate. The enum
    carries no resource at all: core reads the manifest, the claimant says when.

    **`placeholderCanvas` and `accompanyingCanvas` are ordinary Presentation 3
    vocabulary**, most often used with time-based media but not defined in terms of
    it — which is what keeps this seam media-agnostic. A future claimant of another
    medium gets companion painting on the same terms, without core learning anything
    about that medium.

    This amends only the sentence about companions. The decision itself is unchanged
    and so are the rejected alternatives: the claim is still scoped to non-image
    content, core still paints image bodies under the claimant's overlay, and a
    claim on its own still paints no companion — a phase is a separate, explicit
    opt-in.

Two deliberate deviations ride along. The plugin's IIFE build breaks the single-file
plugin template: hls.js and the waveform code are emitted as separate chunks loaded on
demand (native HLS is used where the browser has it; hls.js is imported only when an HLS
body meets a browser that needs it), so script-tag consumers host a dist directory rather
than copying one file. A consistency pass will want to restore `inlineDynamicImports` to
match the other plugins; that would silently charge every consumer ~50 KB gzip of HLS
demuxer whether or not any manifest they show is HLS, which is the opposite of the
bundle-size story this project markets. And the classifier lands in core rather than the
plugin even though the plugin is its main beneficiary: without it, a plugin-less viewer
shows broken-image error tiles for video and silently drops audio canvases from layout,
which is a wrong baseline regardless of any plugin.
