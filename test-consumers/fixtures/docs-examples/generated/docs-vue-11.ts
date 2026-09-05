// GENERATED from apps/site/content/docs/vue.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { shallowRef } from 'vue';
import { TriiiceratopsViewer, type ViewerConfig } from 'triiiceratops/vue';

// shallowRef: the wrapper receives this exact object, not a reactive proxy.
const config = shallowRef<ViewerConfig>({ toolbar: { side: 'right' } });

function moveToolbar(side: 'left' | 'right'): void {
    // Replace the object; do not mutate it in place.
    config.value = { toolbar: { side } };
}
