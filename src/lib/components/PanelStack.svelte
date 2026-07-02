<script lang="ts" module>
    import type { Component } from 'svelte';

    export interface PanelStackItem {
        id: string;
        title: string;
        icon?: Component<any>;
        component: Component<any>;
        props?: Record<string, unknown>;
        close?: () => void;
    }
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { fly } from 'svelte/transition';
    import { flip } from 'svelte/animate';
    import { cubicOut } from 'svelte/easing';
    import PanelStackSection from './PanelStackSection.svelte';

    const DURATION = 200;

    interface Props {
        panels: PanelStackItem[];
        /**
         * Which edge the section close button sits on. Defaults to 'end' (the
         * trailing edge). Set to 'start' for a right-docked column that hosts the
         * toolbar rail, so the close stays on the image-facing (inner) edge and
         * away from the rail's own controls.
         */
        closeAlign?: 'start' | 'end';
        /** Which column the stack lives in; drives panel slide-in direction. */
        side?: 'left' | 'right';
    }

    let { panels, closeAlign = 'end', side = 'right' }: Props = $props();
    let hasMounted = $state(false);

    // Honor prefers-reduced-motion by collapsing animations to 0ms.
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : DURATION;

    // A newly-opened panel slides in from the column's outer edge (left column
    // from the left, right column from the right).
    const flyParams = $derived({
        x: prefersReducedMotion ? 0 : side === 'left' ? -32 : 32,
        duration,
        easing: cubicOut,
    });

    onMount(() => {
        hasMounted = true;
    });
</script>

<div class="panel-stack">
    {#each panels as panel (panel.id)}
        <div
            class="panel-slot"
            transition:fly|global={flyParams}
            animate:flip={{ duration, easing: cubicOut }}
        >
            <PanelStackSection {panel} {closeAlign} scrollOnMount={hasMounted} />
        </div>
    {/each}
</div>

<style>
    .panel-stack {
        display: flex;
        flex-direction: column;
        gap: var(--ui-section-gap, 1rem);
        height: 100%;
        max-height: 100%;
        min-height: 0;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        padding-bottom: 1.5rem;
    }

    /* Flex child wrapper so animate:flip / transition:fly have a measurable box
       without collapsing the section under the stack's flex column. */
    .panel-slot {
        flex-shrink: 0;
    }
</style>
