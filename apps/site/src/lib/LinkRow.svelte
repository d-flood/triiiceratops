<script lang="ts">
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
