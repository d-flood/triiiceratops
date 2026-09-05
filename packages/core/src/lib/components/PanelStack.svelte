<script lang="ts" module>
    import type { Component } from 'svelte';
    import type { IconName } from '../generated/icons';
    import type { IconDescriptor } from '../types/plugin';

    export interface PanelStackItem {
        id: string;
        title: string;
        /** Core glyph for the section header, resolved through `Icon`. */
        iconName?: IconName;
        /**
         * Framework-neutral header icon descriptor. Rendered by `PluginIcon`
         * when set; takes precedence over {@link iconName}.
         */
        iconDescriptor?: IconDescriptor;
        component: Component<any>;
        props?: Record<string, unknown>;
        close?: () => void;
        /**
         * Give the whole section — header, close button and content — a `dialog`
         * role named by {@link title}. Core panel components render their own
         * inside their content; a plugin panel's content is a bare mount host,
         * so the section supplies one. Without it the panel has no accessible
         * name and two stacked panels are two identical "Close" buttons. Naming
         * the section rather than the content is what puts the close button
         * inside the named dialog.
         */
        dialog?: boolean;
        /**
         * This panel scrolls its own content, so give it the height left over in
         * the column instead of sizing it to its content. The section becomes the
         * scroller; the panel's body needs no height cap of its own.
         */
        fills?: boolean;
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
            class:fills={panel.fills}
            transition:fly|global={flyParams}
            animate:flip={{ duration, easing: cubicOut }}
        >
            <PanelStackSection
                {panel}
                {closeAlign}
                scrollOnMount={hasMounted}
            />
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

    /* The padding above keeps the last of a SCROLLING column of panels off the
       bottom edge. A filling panel makes the column not scroll, so the same
       padding is only a strip of viewer background under the panel — and one
       almost exactly a transport bar tall, which reads as space reserved for
       something rather than as breathing room. */
    .panel-stack:has(.panel-slot.fills) {
        padding-bottom: 0;
    }

    /* Flex child wrapper so animate:flip / transition:fly have a measurable box
       without collapsing the section under the stack's flex column. */
    .panel-slot {
        flex-shrink: 0;
    }

    /* Takes the height the content-sized panels leave, so the column itself
       needs no scroll. The floor is for when they already fill it — the one case
       where this stack's own overflow still does the work. */
    .panel-slot.fills {
        display: flex;
        flex: 1 1 auto;
        min-height: 14rem;
    }
</style>
