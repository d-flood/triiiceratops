// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { shallowRef } from 'vue';
import { TriiiceratopsViewer, type ViewerConfig } from 'triiiceratops/vue';

// shallowRef, not ref: the wrapper receives this exact object.
const config = shallowRef<ViewerConfig>({
    toolbar: { side: 'left' },
    gallery: { dockPosition: 'right' },
});
