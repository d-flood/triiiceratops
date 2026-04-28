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

<div
    class="h-full max-h-full min-h-0 w-full overflow-y-auto overflow-x-hidden pb-6 space-y-4"
>
    {#each panels as panel (panel.id)}
        <PanelStackSection {panel} scrollOnMount={hasMounted} />
    {/each}
</div>
