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
    import PanelStackSection from './PanelStackSection.svelte';

    interface Props {
        panels: PanelStackItem[];
        /**
         * Which edge the section close button sits on. Defaults to 'end' (the
         * trailing edge). Set to 'start' for a right-docked column that hosts the
         * toolbar rail, so the close stays on the image-facing (inner) edge and
         * away from the rail's own controls.
         */
        closeAlign?: 'start' | 'end';
    }

    let { panels, closeAlign = 'end' }: Props = $props();
    let hasMounted = $state(false);

    onMount(() => {
        hasMounted = true;
    });
</script>

<div class="panel-stack">
    {#each panels as panel (panel.id)}
        <PanelStackSection {panel} {closeAlign} scrollOnMount={hasMounted} />
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
</style>
