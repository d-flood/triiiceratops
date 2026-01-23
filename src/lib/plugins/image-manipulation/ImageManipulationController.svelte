<script lang="ts">
    import { getContext } from 'svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { DEFAULT_FILTERS, type ImageFilters } from './types';
    import { applyFilters } from './filters';
    import ImageManipulationPanel from './ImageManipulationPanel.svelte';

    // Props from the plugin system
    let { isOpen: _isOpen = false, close } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });

    // React to filter changes and apply to OSD
    $effect(() => {
        if (viewerState?.osdViewer) {
            applyFilters(viewerState.osdViewer, filters);
        }
    });

    // Reset filters when a new image is opened (canvas change)
    let lastCanvasId = $state(viewerState?.canvasId);
    $effect(() => {
        if (viewerState?.canvasId !== lastCanvasId) {
            lastCanvasId = viewerState?.canvasId;
            filters = { ...DEFAULT_FILTERS };
        }
    });

    function handleFilterChange(newFilters: ImageFilters) {
        filters = newFilters;
    }

    function handleReset() {
        filters = { ...DEFAULT_FILTERS };
    }
</script>

<!--
    We render the generic panel, passing our state and handlers.
    The controller is responsible for the "Smart" logic (applying filters to OSD),
    while the panel handles the UI.
-->
<div class="h-full">
    <ImageManipulationPanel
        {filters}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        onClose={close}
    />
</div>
