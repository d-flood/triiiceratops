<script lang="ts">
    import type { SitePage } from './routes';

    let {
        nav,
        current,
        onnavigate,
    }: {
        nav: readonly SitePage[];
        current: string;
        onnavigate?: () => void;
    } = $props();
</script>

<div class="rail__list">
    {#each nav as entry, index (entry.path)}
        <a
            class="rail__item g{entry.group}"
            href={entry.path}
            aria-current={entry.path === current ? 'page' : undefined}
            onclick={onnavigate}
        >
            <span class="n">{index + 1}</span>
            <span>{entry.shortTitle}</span>
        </a>
    {/each}
</div>
