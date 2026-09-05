<script lang="ts">
    /** The mark, inline so the chrome costs no request. Decorative: the
        wordmark beside it carries the accessible name. */
    let { eye = false }: { eye?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path
        d="M4 21c1-8 7-12 13-12 3 0 5 1 6 3l5-1-3 4c1 4-2 9-8 10-5 1-10-1-13-4z"
        fill="#b84a19"
    />
    {#if eye}<circle cx="20" cy="14" r="1.7" fill="#fffdf9" />{/if}
</svg>
