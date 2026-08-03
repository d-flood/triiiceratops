<script setup lang="ts">
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';
import { useTemplateRef } from 'vue';

// A public IIIF manifest, so the example works with no setup.
const MANIFEST =
    'https://iiif.wellcomecollection.org/presentation/v2/b18035723';

// An ordinary template ref IS the handle — this wrapper adds no handle API.
const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');

// Reactive read: a `computed` that updates when the selected value changes.
const canvasId = useViewerSelector(viewer, (state) => state.canvasId);

// Imperative command, straight through the ref.
function next(): void {
    viewer.value?.state?.nextCanvas();
}
</script>

<template>
    <main class="page">
        <h1>Triiiceratops in Vue</h1>

        <p class="controls">
            <button type="button" @click="next">Next canvas</button>
            <code>{{ canvasId ?? 'waiting for the viewer…' }}</code>
        </p>

        <!-- The host element needs a height; the wrapper adds no layout box. -->
        <TriiiceratopsViewer
            ref="viewer"
            :manifest-id="MANIFEST"
            style="display: block; height: 70vh"
        />
    </main>
</template>

<style scoped>
.page {
    font:
        16px/1.5 system-ui,
        sans-serif;
    margin: 0 auto;
    max-width: 60rem;
    padding: 1.5rem;
}

h1 {
    font-size: 1.25rem;
}

.controls {
    align-items: center;
    display: flex;
    gap: 0.75rem;
}

code {
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}
</style>
