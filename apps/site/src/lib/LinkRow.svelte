<script lang="ts">
    /**
     * One row in a `linkRows` group: a link, a line saying what it is, and an
     * optional second link the reader can follow instead.
     *
     * The second link's visible label repeats across every row, so it carries
     * the row's own label after it for a screen reader: a page of identical
     * "Open an example" links is a page with no distinguishable destinations.
     */
    let {
        label = '',
        href = '',
        note = '',
        actionLabel = '',
        actionHref = '',
    }: {
        label?: string;
        href?: string;
        note?: string;
        actionLabel?: string;
        actionHref?: string;
    } = $props();

    const action = $derived(actionHref.trim() && actionLabel.trim());
</script>

<div class="linkrows__row">
    <span>
        <a class="linkrows__label" {href}>{label}</a>
        <span class="linkrows__note">{note}</span>
    </span>
    {#if action}
        <a class="linkrows__go" href={actionHref}>
            {actionLabel}<span class="vh">{` of ${label}`}</span>
        </a>
    {/if}
</div>
