<script setup>
// A projection the fixture can break on demand. The failure must reach Vue's
// own application error handling — `onErrorCaptured` in <Boundary> and
// `app.config.errorHandler` — and never be swallowed, mislabelled, or served
// as a stale value.
import { useViewerSelector } from 'triiiceratops/vue';

import { store } from './store.js';

const value = useViewerSelector((state) => {
    if (store.fragileThrows) {
        throw new Error('consumer projection failed');
    }
    return state.canvasId ?? 'none';
});
</script>

<template>
    <span data-testid="fragile">{{ value ?? 'none' }}</span>
</template>
