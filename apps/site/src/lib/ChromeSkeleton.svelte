<script lang="ts">
    /* Plain-markup chrome for the prerender. `span`s only: Chrome fetches a face for `i` elements even with no glyph. */
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
