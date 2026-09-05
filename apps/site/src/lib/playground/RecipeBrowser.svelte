<script lang="ts">
    /*
     * The playground's shelf of loadable manifests: the Cookbook catalog grouped
     * as the Cookbook groups it, followed by the manifests that have no catalog
     * entry.
     */
    import { tick } from 'svelte';

    import DemoIcon from './DemoIcon.svelte';
    import { m } from './i18n.svelte';
    import {
        groupRecipes,
        INSTITUTIONAL_MANIFESTS,
        LOCAL_MANIFESTS,
        WAVEFORM_MANIFESTS,
        type ManifestEntry,
        type ManifestSection,
    } from './manifestCatalog';

    let {
        activeUrl = '',
        onSelect,
    }: {
        /** The manifest currently loaded, marked in the list. */
        activeUrl?: string;
        onSelect: (url: string) => void;
    } = $props();

    const recipeSections = groupRecipes();

    let sections = $derived<ManifestSection[]>(
        [
            ...recipeSections,
            {
                key: 'institutional',
                heading: m.recipe_browser_group_institutional(),
                entries: INSTITUTIONAL_MANIFESTS,
            },
            {
                key: 'waveforms',
                heading: m.recipe_browser_group_waveforms(),
                entries: WAVEFORM_MANIFESTS,
            },
            {
                key: 'local',
                heading: m.recipe_browser_group_local(),
                entries: LOCAL_MANIFESTS,
            },
        ].filter((section) => section.entries.length > 0),
    );

    // Starts out of the way on a narrow viewport, where the list overlays the
    // viewer rather than sitting beside it. Same breakpoint as the style below.
    let open = $state(window.innerWidth >= 1024);

    let hideButton = $state<HTMLButtonElement>();
    let revealButton = $state<HTMLButtonElement>();

    /*
     * Toggling swaps one control for the other, which unmounts the element that
     * had focus: without moving focus onto its replacement, a keyboard user is
     * dropped back to the top of the document.
     */
    async function setOpen(next: boolean) {
        open = next;
        await tick();
        (next ? hideButton : revealButton)?.focus();
    }

    function statusText(entry: ManifestEntry): string {
        const status = m.recipe_support_unsupported();
        return entry.reason ? `${status} — ${entry.reason}` : status;
    }
</script>

{#if open}
    <aside class="recipe-browser" aria-label={m.recipe_browser_title()}>
        <div class="browser-header">
            <span class="sh-caption browser-title"
                >{m.recipe_browser_title()}</span
            >
            <button
                type="button"
                class="sh-btn sh-btn--quiet sh-btn--icon"
                bind:this={hideButton}
                onclick={() => setOpen(false)}
                title={m.recipe_browser_hide()}
                aria-label={m.recipe_browser_hide()}
            >
                <DemoIcon name="x" size={16} />
            </button>
        </div>
        <nav class="browser-scroll">
            {#each sections as section (section.key)}
                <h2 class="section-heading">{section.heading}</h2>
                <ul class="section-list">
                    {#each section.entries as entry (entry.url)}
                        <li>
                            <button
                                type="button"
                                class="entry"
                                aria-current={entry.url === activeUrl
                                    ? 'true'
                                    : undefined}
                                onclick={() => onSelect(entry.url)}
                            >
                                <span class="entry-label">{entry.label}</span>
                                {#if entry.support && entry.support !== 'supported'}
                                    <span class="entry-status"
                                        >{statusText(entry)}</span
                                    >
                                {/if}
                            </button>
                        </li>
                    {/each}
                </ul>
            {/each}
        </nav>
    </aside>
{:else}
    <button
        type="button"
        class="sh-btn sh-btn--icon reveal"
        bind:this={revealButton}
        onclick={() => setOpen(true)}
        title={m.recipe_browser_show()}
        aria-label={m.recipe_browser_show()}
    >
        <DemoIcon name="books" size={20} />
    </button>
{/if}

<style>
    .recipe-browser {
        display: flex;
        flex-direction: column;
        width: 18rem;
        flex-shrink: 0;
        min-height: 0;
        background: var(--paper);
        border: 1px solid var(--rule-2);
        border-radius: 2px;
        overflow: hidden;
    }

    .browser-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s2);
        padding: var(--s2) var(--s3);
        border-bottom: 1px solid var(--rule);
    }

    .browser-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: var(--s1) var(--s2) var(--s3);
    }

    .section-heading {
        margin: var(--s3) var(--s1) var(--s1);
        font-size: var(--t-small);
        font-weight: 600;
        line-height: 1.2;
        color: var(--ink-2);
    }

    .section-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    /* Ruled rows rather than cards, and a selected row is a change of ground
       and of weight — the house rules the rest of the origin is drawn to. */
    .entry {
        display: block;
        width: 100%;
        text-align: start;
        padding: var(--s1) var(--s2);
        font: 400 var(--t-tiny) / 1.35 var(--face);
        color: var(--ink);
        background: none;
        border: 0;
        border-radius: 1px;
        cursor: pointer;
    }
    @media (hover: hover) {
        .entry:hover {
            background: var(--bench);
        }
    }
    .entry[aria-current='true'] {
        font-weight: 600;
        color: var(--paper);
        background: var(--ink);
    }

    .entry-label {
        display: block;
    }

    .entry-status {
        display: block;
        font-style: italic;
        color: var(--ink-2);
    }
    .entry[aria-current='true'] .entry-status {
        color: var(--ink-dim-on-dark);
    }

    .reveal {
        align-self: flex-start;
    }

    /* Narrow viewports have no room for a second column, so the list floats over
       the viewer instead of squeezing it. */
    @media (width < 1024px) {
        .recipe-browser {
            position: absolute;
            z-index: 700;
            inset-block: 0;
            inset-inline-start: 0;
            width: min(18rem, 85vw);
            box-shadow: 0 14px 34px -20px rgb(60 40 10 / 0.55);
        }
    }
</style>
