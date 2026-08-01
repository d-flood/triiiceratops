<script setup>
// The equality gate, with a CURRENT equality function: `store.coarseEquality`
// is read inside `equals`, which runs inside the composable's own `computed`,
// so Vue tracks it and flipping the flag rewires the gate with no manual
// watcher and no re-created composable.
import { useViewerSelector } from 'triiiceratops/vue';

import { selectCanvasId, store } from './store.js';

const value = useViewerSelector(selectCanvasId, {
    equals: (a, b) => (store.coarseEquality ? true : Object.is(a, b)),
});
</script>

<template>
    <span data-testid="v1-gated">{{ value ?? 'none' }}</span>
</template>
