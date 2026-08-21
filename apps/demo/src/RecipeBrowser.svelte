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
        const status =
            entry.support === 'partial'
                ? m.recipe_support_partial()
                : m.recipe_support_unsupported();
        return entry.reason ? `${status} — ${entry.reason}` : status;
    }
</script>

{#if open}
    <aside class="recipe-browser" aria-label={m.recipe_browser_title()}>
        <div class="browser-header">
            <span class="browser-title">{m.recipe_browser_title()}</span>
            <button
                type="button"
                class="icon-button"
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
        class="icon-button reveal"
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
        background-color: #ffffff;
        border-radius: 6px;
        border: 1px solid color-mix(in oklab, currentColor 10%, transparent);
        overflow: hidden;
    }

    .browser-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid
            color-mix(in oklab, currentColor 10%, transparent);
    }

    .browser-title {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.7;
    }

    .browser-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 0.25rem 0.5rem 0.75rem;
    }

    .section-heading {
        margin: 0.75rem 0 0.25rem;
        font-size: 0.75rem;
        font-weight: 700;
        opacity: 0.6;
    }

    .section-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .entry {
        display: block;
        width: 100%;
        text-align: start;
        padding: 0.25rem 0.375rem;
        font-size: 0.8125rem;
        line-height: 1.25;
        color: currentColor;
        background-color: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
    }
    @media (hover: hover) {
        .entry:hover {
            background-color: color-mix(
                in oklab,
                currentColor 10%,
                transparent
            );
        }
    }
    .entry[aria-current='true'] {
        background-color: #1a5fb4;
        color: #ffffff;
    }

    .entry-label {
        display: block;
    }

    .entry-status {
        display: block;
        font-size: 0.6875rem;
        opacity: 0.75;
    }

    .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        height: 2rem;
        width: 2rem;
        color: currentColor;
        background-color: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
    }
    @media (hover: hover) {
        .icon-button:hover {
            background-color: color-mix(
                in oklab,
                currentColor 10%,
                transparent
            );
        }
    }

    .reveal {
        align-self: flex-start;
        background-color: #ffffff;
        border-color: color-mix(in oklab, currentColor 10%, transparent);
    }

    /* The primitives' focus rings do not reach this hand-written chrome. */
    .entry:focus-visible,
    .icon-button:focus-visible {
        outline: 2px solid #1a5fb4;
        outline-offset: 1px;
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
            box-shadow: 0 10px 25px -5px #00000040;
        }
    }
</style>
