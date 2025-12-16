<svelte:options
    customElement={{
        tag: 'triiiceratops-viewer',
        shadow: 'none',
        props: {
            manifestId: {
                attribute: 'manifest-id',
                type: 'String',
                reflect: true,
            },
            canvasId: {
                attribute: 'canvas-id',
                type: 'String',
                reflect: true,
            },
        },
    }}
/>

<script lang="ts">
    import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
    import type { TriiiceratopsPlugin } from '../types/plugin';

    let {
        manifestId = '',
        canvasId = '',
        plugins = [],
    }: {
        manifestId?: string;
        canvasId?: string;
        plugins?: TriiiceratopsPlugin[];
    } = $props();
</script>

<div class="w-full h-full">
    <TriiiceratopsViewer {manifestId} {canvasId} {plugins} />
</div>
