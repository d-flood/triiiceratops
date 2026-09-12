<script lang="ts">
    /**
     * The viewer's chrome as plain markup, for the prerendered page.
     *
     * It is what a reader sees around the first-canvas image before any viewer
     * code has run, and the live viewer replaces it on mount. Nothing here is
     * imported from the package: pulling the real chrome in would put the
     * viewer's module and stylesheet on the front page's critical path, which
     * is the whole thing this exists to avoid.
     *
     * The geometry is measured from the real chrome in its first arrangement —
     * a 36px toolbar handle in the top-left corner, and a 213x32 control
     * cluster centred on the bottom edge — so the swap on mount lands the
     * controls where they already appeared to be. Both are anchored to the
     * box's edges and sized in pixels, exactly as the real chrome is, so the
     * match holds at every width. The cluster's width depends on how many
     * digits the canvas count takes, because the real counter's does; see
     * `.vwc__at`.
     *
     * Decorative, and hidden from assistive technology: every control it draws
     * is inert, and the real ones arrive with the viewer.
     *
     * Every element is a `span`, deliberately. An `i` is italic by default, and
     * Chrome fetches a face for an element in the render tree whether or not it
     * has a glyph to paint — so eight empty `i` elements here made the 347 KB
     * italic a first-paint dependency of the front page, worth a point of
     * performance, to draw shapes with no text in them at all.
     */
    let { canvases }: { canvases: number } = $props();

    const digits = $derived(String(canvases).length);
</script>

<div class="vwc" aria-hidden="true">
    <span class="vwc__handle">
        <span></span><span></span><span></span>
    </span>
    <div class="vwc__bar">
        <span class="vwc__row">
            <span class="vwc__btn"><span class="vwc__lens"></span></span>
            <span class="vwc__btn"
                ><span class="vwc__lens"><span></span></span></span
            >
        </span>
        <span class="vwc__div"></span>
        <span class="vwc__row">
            <span class="vwc__btn"
                ><span class="vwc__chev vwc__chev--prev"></span></span
            >
            <span class="vwc__at" style="--digits: {digits}"
                >1 / {canvases}</span
            >
            <span class="vwc__btn"
                ><span class="vwc__chev vwc__chev--next"></span></span
            >
        </span>
    </div>
</div>
