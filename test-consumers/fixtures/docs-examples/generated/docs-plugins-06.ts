// GENERATED from apps/site/content/docs/plugins.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { computed, useTemplateRef, watchEffect } from 'vue';
import {
    TriiiceratopsViewer,
    useViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const state = useViewer(viewer);

const mq = window.matchMedia('(max-width: 640px)');
const target = computed(() => (mq.matches ? 'flyout' : 'panel'));

watchEffect(() => {
    state.value?.setPluginTarget('image-manipulation', target.value);
});
