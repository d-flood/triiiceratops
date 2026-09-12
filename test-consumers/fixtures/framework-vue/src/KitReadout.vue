<script setup>
// Reads a real `ViewerState` built by `triiiceratops/testing` — no viewer, no
// custom element, no renderer, no network — through the very same
// composable a mounted viewer would feed.
import { useViewerSelector } from 'triiiceratops/vue';

import { selectCanvasId, testHandleRef } from './store.js';

const canvasId = useViewerSelector(testHandleRef, selectCanvasId);
</script>

<template>
    <span data-testid="kit-canvas">{{ canvasId ?? 'none' }}</span>
</template>
