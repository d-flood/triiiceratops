<script setup>
// Deep in the tree, resolving the viewer through `provideViewer()` with no
// handle argument at all.
import { useViewer, useViewerSelector } from 'triiiceratops/vue';

import { live, selectCanvasId } from './store.js';

const canvasId = useViewerSelector(selectCanvasId);
const viewer = useViewer();
live.deepToggle = () => viewer.value?.toggleToolbar();
</script>

<template>
    <span data-testid="deep-canvas">{{ canvasId ?? 'none' }}</span>
</template>
