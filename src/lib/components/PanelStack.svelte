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
    }

    let { panels }: Props = $props();
    let hasMounted = $state(false);

    onMount(() => {
        hasMounted = true;
    });
</script>

<div class="panel-stack">
    {#each panels as panel (panel.id)}
        <PanelStackSection {panel} scrollOnMount={hasMounted} />
    {/each}
</div>

<style>
    .panel-stack {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        height: 100%;
        max-height: 100%;
        min-height: 0;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        padding-bottom: 1.5rem;
    }
</style>
