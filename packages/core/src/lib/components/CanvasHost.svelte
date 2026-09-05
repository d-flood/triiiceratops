<script lang="ts">
    import { onMount } from 'svelte';

    import { createCanvasRenderer } from '../renderer/canvasRenderer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import type { ViewerState } from '../state/viewer.svelte';

    let {
        tileSources,
        viewerState,
        dockedChrome = '',
    }: {
        tileSources: unknown;
        viewerState: ViewerState;
        /**
         * An opaque identity for the chrome core currently has docked beside
         * the viewer. Only compared for CHANGE — a different string means the
         * size the renderer has to work with is about to change because core
         * took some of it, and nothing here reads the tokens themselves. A
         * flyout is not in it: it floats and takes no width or height, so it is
         * not an event for the image.
         */
        dockedChrome?: string;
    } = $props();

    const m = getMessages();

    let root: HTMLDivElement | undefined = $state();
    let surface: HTMLCanvasElement | undefined = $state();

    /*
     * The renderer itself — frame loop, input, residency, measurement, error
     * policy — is `renderer/canvasRenderer.svelte.ts`. What is left here is what
     * genuinely needs a component: the two element refs, the accessible markup
     * around the surface, the DOM error layer, and the three effects below that
     * translate viewer-state changes into renderer calls.
     *
     * `viewerState` is read once on purpose: it is one live object per viewer
     * for the lifetime of this component, so capturing it is capturing the
     * viewer, not a value. Everything reactive ABOUT it is read inside the
     * renderer's own `$derived`s and inside these effects.
     */
    // svelte-ignore state_referenced_locally
    const renderer = createCanvasRenderer({
        viewerState,
        messages: m,
        getTileSources: () => tileSources,
    });

    onMount(() => renderer.mount(root!, surface!));

    $effect(() => {
        // `tileSources` is read purely as the change signal the viewer already
        // computes: a new canvas, mode, or direction produces new sources, and
        // that is when the view must be refitted.
        void tileSources;
        // Read so the effect re-runs when the manifest or the mode changes and
        // the world has to be refitted; the images themselves are reconciled in
        // the frame loop, where the tier that gates them is known. Geometry
        // only — a refit overwrites the reader's centre and scale, so it must
        // not fire for a change that leaves every rect where it was.
        void renderer.paintedGeometry;

        // Whether this is a TRAVEL within a laid-out world or a jump into a new
        // one is the renderer's own memory — see `refitForCurrentWorld`.
        renderer.refitForCurrentWorld();
    });

    /*
     * What the renderer cannot see for itself: a resize caused by core taking
     * part of the surface for docked chrome, rather than by the window changing
     * size. The two must not be collapsed — a resize the reader asked for
     * preserves their scale, and one core imposed compensates their whole view
     * for it, so that the content on screen survives the narrower surface. See
     * `compensateForDockedChrome`.
     *
     * The baseline is the empty string rather than the mount value on purpose.
     * A viewer that opens with a panel already docked still mounts this
     * component beside a column of zero width and lets it slide out, so the
     * first measurement is taken on the FULL surface and the column's arrival
     * is a change like any other.
     */
    let chromeDocked = '';
    $effect(() => {
        const docked = dockedChrome;
        if (docked === chromeDocked) return;
        chromeDocked = docked;
        renderer.compensateForDockedChrome();
    });

    $effect(() => {
        // Repaint when a decoded image, a decoded tile, or image-service
        // metadata lands.
        void renderer.loadedGeneration;
        renderer.requestFrame();
    });

    $effect(() => {
        // A paint layer was registered or released. Without this a layer added
        // while the viewport is idle would first appear at whatever unrelated
        // repaint came next — and one that was released would go on being drawn
        // until then.
        //
        // The revision is CONSUMED rather than merely read: a bare `void`
        // statement is deletable by any minifier that treats a property read as
        // pure, which would leave this effect with no dependency at all in the
        // shipped bundle. `pure_getters` is off for that reason
        // (`src/packaging/terserElement.ts`), and `distributions.test.ts`
        // asserts the read survives minification. The guard is always true; it
        // exists so the read cannot be dropped. `overlayLayers` in
        // `TriiiceratopsViewer.svelte` is the same idiom.
        if (viewerState.paintLayerRevision >= 0) renderer.requestFrame();
    });

    $effect(() => {
        // A canvas was claimed or released, which moves the unsupported
        // presentation. The same rule as the layers above: the frame loop stops
        // rescheduling once the viewport settles, so without this a claim taken
        // on an idle viewer would leave the placard painted over the claimant's
        // content until the reader panned — while the thumbnail strip, which
        // reads the claim set directly, dropped its glyph immediately.
        //
        // `keys()` rather than `size`: a release and a fresh claim in one tick
        // leave the size unchanged.
        void viewerState.claimedCanvases.keys();
        renderer.requestFrame();
    });
</script>

<!--
    NOTE: this wrapper must NOT be called `viewer-root`. That class is reserved
    for TriiiceratopsViewer's single root element: the published light-DOM
    stylesheet is scoped by src/packaging/scopeViewerRoot.ts, which rewrites
    `:where(:root, :host)` to `:where(.viewer-root)` — turning the base token
    block into a real DECLARATION of every `--tri-*`/`--ui-*` token on ANY
    element with the class. A declaration beats inheritance, so a nested
    `viewer-root` shadows the root's `[data-theme]` / `themeConfig` values for
    its whole subtree (this painted the canvas stock-light in every theme).
    Guarded by src/packaging/viewerRootUnique.test.ts.
-->
<!--
    The image surface is a real tab stop with a role and an accessible name
    (spec §Keyboard).

    The focus target is this WRAPPER rather than the `<canvas>` inside it, and
    that is the same division of labour the spec draws for overlays: the canvas
    paints pixels, a DOM layer carries the focusable, labelled targets. A canvas
    element is interactive content in its own right, so giving it a widget role
    is a contradiction assistive technology has no good answer to; the box
    around it has no implicit role to contradict. Clicking the canvas still
    focuses this, because the browser focuses the nearest focusable ancestor.

    `role="application"` because arrow keys mean something HERE that they do not
    mean anywhere else in the viewer: a screen reader must pass them through
    rather than use them to browse its own way around. This is the narrowest
    scope that claim can be made in — one element, whose only child paints.

    CONSTRAINT ON THIS SUBTREE, for whoever adds the next child: `application`
    suppresses browse mode for the WHOLE subtree, not just this element, and it
    is the only role NVDA and JAWS pass arrows through — so it stays. The price
    is that any non-canvas descendant becomes unreadable in browse mode:
    ordinary text, a heading, an error message, a list of annotations would all
    be skipped over. Ticket 12's per-canvas error layer IS such a child — it is
    the `.error-layer` below, and it carries `role="document"` for exactly this
    reason. Each such child must either carry `role="document"` (which restores
    browse mode for its own subtree) or be hoisted OUT of this element and
    rendered as a sibling. Recorded in lint-allowlist.md entry 7.

    Ticket 14's annotation shape overlay took the second option: it is a SIBLING
    of this element, mounted by `TriiiceratopsViewer` into the same stage box, so
    its labels are read normally and its focusable shapes are ordinary widgets.
    This element comes first in DOM order, so Tab goes surface → annotations: the
    picture before the things marked on it.

    The two suppressions below are recorded in lint-allowlist.md. Svelte's
    heuristic classifies every ARIA role outside the widget set as
    non-interactive, and `application` — whose entire purpose is to declare that
    this element handles its own keys — is one of them. There is no role that
    both describes a pan/zoom surface honestly and satisfies the heuristic, and
    the accessible name, focus ring, and key bindings the rules exist to demand
    are all present.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    bind:this={root}
    class="renderer-root"
    class:has-bg={!viewerState.config.transparentBackground}
    data-testid="canvas-renderer-root"
    tabindex="0"
    role="application"
    aria-label={m.canvas_surface_label()}
    onkeydown={renderer.handlers.keydown}
    onkeyup={renderer.handlers.keyup}
    onblur={renderer.handlers.blur}
>
    <canvas
        bind:this={surface}
        class="renderer-surface"
        data-testid="canvas-renderer-surface"
        onpointerdown={renderer.handlers.pointerdown}
        onpointermove={renderer.handlers.pointermove}
        onpointerup={renderer.handlers.pointerup}
        onpointercancel={renderer.handlers.pointercancel}
        onlostpointercapture={renderer.handlers.pointercancel}
    ></canvas>

    <!--
        The per-canvas error layer: one placeholder over the layout rect of each
        canvas that failed, and nothing at all when none did.

        DOM rather than painted pixels, per ticket 14's rule — a message the reader
        must perceive needs an accessible name, and painted text has none.

        `role="document"` on the layer is the constraint the note above this markup
        records: `role="application"` suppresses browse mode for its whole subtree,
        so text inside it would be skipped by NVDA and JAWS. `document` restores
        browse mode for this subtree only, leaving the surface's arrow-key
        pass-through intact.

        `pointer-events: none` throughout (see the style block): a placeholder sits
        over the surface, and a reader must still be able to pan and zoom the page
        the failed folio is sitting next to.
    -->
    {#if renderer.errorLayer.length > 0}
        <div class="error-layer" role="document">
            {#each renderer.errorLayer as placement (placement.canvasId)}
                <div
                    class="canvas-error"
                    class:canvas-error-auth={placement.kind === 'auth'}
                    data-testid="canvas-error-placeholder"
                    data-canvas-id={placement.canvasId}
                    data-error-kind={placement.kind}
                    role="img"
                    aria-label={renderer.errorLabel(placement.kind)}
                    style:left="{placement.left}px"
                    style:top="{placement.top}px"
                    style:width="{placement.width}px"
                    style:height="{placement.height}px"
                >
                    <!--
                        The VISIBLE message, centred in the part of the failed
                        canvas that is actually on screen rather than in the
                        canvas rect — see `CanvasErrorPlacement`. Zoomed into a
                        failed folio (the ceiling is 128x home) the rect is many
                        times the viewport, and a label centred in it is centred
                        on a point nobody can see: a sighted reader gets a flat
                        fill and no message while the accessible name goes on
                        being correct. Positioned relative to the placeholder,
                        which is this element, hence the offsets.

                        Omitted entirely below a minimum box, because a clipped
                        fragment of one glyph reads as a rendering bug rather
                        than as an error. The named, bordered box remains.

                        The same string as the accessible name, and hidden from
                        the accessibility tree because `role="img"` above already
                        carries it — which also makes every descendant of that
                        element presentational anyway, so this attribute is
                        belt-and-braces rather than what makes it true.
                    -->
                    {#if placement.labelled}
                        <span
                            class="canvas-placeholder-text"
                            data-testid="canvas-error-label"
                            aria-hidden="true"
                            style:left="{placement.labelLeft -
                                placement.left}px"
                            style:top="{placement.labelTop - placement.top}px"
                            style:width="{placement.labelWidth}px"
                            style:height="{placement.labelHeight}px"
                            >{renderer.errorLabel(placement.kind)}</span
                        >
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <!--
        The unsupported presentation: one honest placeholder over the layout rect
        of each canvas whose painting bodies core cannot render — a sound
        recording, a film — and nothing at all on an image manifest.

        A SEPARATE layer from the error one, because it is not an error
        (CONTEXT.md → Unsupported presentation). Nothing failed, nothing was
        fetched, and there is nothing to retry; the manifest simply describes
        content this viewer does not display, and the canvas keeps its rect, its
        place in navigation and its place in the thumbnail strip. The two layers
        never overlap: an unsupported canvas issues no request, so it can never
        acquire an error.

        `role="document"` and `pointer-events: none` for the same two reasons the
        error layer carries them — see the notes above it.
    -->
    {#if renderer.unsupportedLayer.length > 0}
        <div class="unsupported-layer" role="document">
            {#each renderer.unsupportedLayer as placement (placement.canvasId)}
                <div
                    class="canvas-unsupported"
                    data-testid="canvas-unsupported-placeholder"
                    data-canvas-id={placement.canvasId}
                    role="img"
                    aria-label={renderer.unsupportedLabel()}
                    style:left="{placement.left}px"
                    style:top="{placement.top}px"
                    style:width="{placement.width}px"
                    style:height="{placement.height}px"
                >
                    {#if placement.labelled}
                        <span
                            class="canvas-placeholder-text"
                            data-testid="canvas-unsupported-label"
                            aria-hidden="true"
                            style:left="{placement.labelLeft -
                                placement.left}px"
                            style:top="{placement.labelTop - placement.top}px"
                            style:width="{placement.labelWidth}px"
                            style:height="{placement.labelHeight}px"
                            >{renderer.unsupportedLabel()}</span
                        >
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* See the note on the markup: this is deliberately NOT `.viewer-root`. */
    .renderer-root {
        width: 100%;
        height: 100%;
        position: relative;
        /* Pan and zoom are ours; the browser must not also scroll or
           pinch-zoom the page from gestures on this surface. */
        touch-action: none;
    }

    /*
     * The viewer background lives HERE, in CSS, and never on the canvas. The
     * canvas has an alpha channel and composites over this, so switching theme
     * re-resolves the token with no JS involvement, and
     * `transparentBackground` is simply the absence of this class.
     */
    .renderer-root.has-bg {
        background-color: var(--tri-viewer-bg);
    }

    .renderer-surface {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
    }

    /*
     * The error layer covers the surface and takes no input: the placeholders are
     * positioned in surface coordinates by the frame loop, and the reader must
     * still be able to pan and zoom from anywhere on the surface — including from
     * over a folio that failed.
     */
    .error-layer,
    .unsupported-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        /* The layer is a positioning context in its own right, so a placeholder's
           surface-local coordinates are not affected by anything the root's
           padding or borders might later become. */
        overflow: hidden;
    }

    /*
     * One placeholder, filling the failed canvas's layout rect exactly — which is
     * what makes it read as "this page", rather than as a message about the viewer.
     *
     * Theme tokens throughout, like the rest of the surface: the placeholder sits
     * among the working pages and has to belong to the same picture.
     */
    .canvas-error,
    .canvas-unsupported {
        position: absolute;
        box-sizing: border-box;
        background-color: var(--tri-panel-bg);
        border: 1px solid var(--tri-color-warning);
        color: var(--tri-panel-content);
    }

    /*
     * Not an error, and it must not look like one: the border is the ordinary
     * panel border rather than the warning colour, because nothing went wrong.
     * The canvas is present, laid out and navigable — it just holds a medium
     * this viewer does not play.
     */
    .canvas-unsupported {
        border-color: var(--tri-surface-border);
    }

    /*
     * Auth is not load, and the distinction survives to the picture as well as to
     * the label: a reader scanning a long manifest can see which failures a login
     * would fix without reading every box.
     */
    .canvas-error-auth {
        /* The `-text` variant, not the raw primary, for the reason the focus
           ring's note spells out: the raw token is a fill colour and has no
           contrast guarantee against a panel surface. */
        border-color: var(--tri-color-primary-text);
    }

    /*
     * The message, in a box the frame loop sizes to the on-screen part of the
     * failed canvas (see the markup). Absolutely positioned inside the
     * placeholder, because "centred in the canvas rect" and "centred where the
     * reader is looking" stop being the same box the moment the rect is larger
     * than the viewport — which the zoom ceiling makes ordinary.
     */
    .canvas-placeholder-text {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.3;
        text-align: center;
        /* The box is never below `canvasPlacements.MIN_LABEL_*`, so the message
           fits at the ordinary text size; this is the guard for the cases that
           bound cannot know about — a translation several times longer, or a
           reader's larger minimum font size. Clipped rather than allowed to
           spill over the pages either side of it. */
        overflow: hidden;
    }

    /*
     * The visible focus ring — a NEW visual affordance, and an accepted design
     * cost rather than an oversight. The previous renderer suppressed focus on
     * this surface outright (`tabIndex: ''`, "This prevents the focus outline
     * from appearing"); a surface that is operable by keyboard must show where
     * the keyboard is (WCAG 2.4.7).
     *
     * Drawn INSIDE the element (`outline-offset` is negative, where the global
     * rule in styles/base.css offsets outward). The surface fills the viewer to
     * its edges, so an outward ring would be drawn over the chrome that abuts
     * it, or clipped away entirely by an overflow boundary. Thicker than the
     * global 2px for the same reason: there is no gap between ring and content
     * to separate them.
     *
     * `:focus-visible`, not `:focus`, so clicking the image to pan does not
     * ring it.
     *
     * **TWO-TONE, and that is what makes it visible at all.** Drawn inside, the
     * ring's neighbour is not the viewer background but the CANVAS — arbitrary
     * image pixels, which whenever the image fills the viewport is the common
     * case, not the exception. With `transparentBackground` set there is not
     * even a known colour behind it. A single-colour indicator over content
     * nobody chose has no contrast guarantee at all, so the ring carries its own
     * contrast: an outer band in `--tri-color-primary-text` and an inner band in
     * `--tri-viewer-bg`, which clear 3:1 AGAINST EACH OTHER in all four themes
     * (the standard technique for an indicator over unknown content, and the
     * adjacent-contrast allowance in WCAG 2.4.11/1.4.11). Whatever the image is
     * doing underneath, one of the two bands stands off it. Gated by
     * `pnpm test:contrast`, which carries the pairing.
     *
     * `--tri-color-primary-TEXT`, not `--tri-color-primary`, for the outer band:
     * the raw primary is a fill colour and reaches only 2.03:1 (light) and
     * 1.40:1 (teal) against `--tri-viewer-bg`. The `-text` variant is the
     * palette's legible-on-a-surface form.
     *
     * The inner band is a PSEUDO-ELEMENT rather than a second `box-shadow` on
     * the root: an inset shadow paints above the element's background but below
     * its content, so the canvas would cover it. An absolutely-positioned
     * pseudo-element is positioned content and paints above the in-flow canvas
     * — the same place the outline itself lands.
     */
    .renderer-root:focus-visible {
        outline: 3px solid var(--tri-color-primary-text);
        outline-offset: -3px;
    }

    .renderer-root:focus-visible::after {
        content: '';
        position: absolute;
        /* Immediately inside the outline's 3px band, so the two are adjacent
           with no image pixels between them. */
        inset: 3px;
        pointer-events: none;
        box-shadow: inset 0 0 0 2px var(--tri-viewer-bg);
    }
</style>
