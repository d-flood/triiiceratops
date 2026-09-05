// GENERATED from apps/site/content/docs/vue.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');

// Reactive read: a `computed` that updates when the selected value changes.
const canvasId = useViewerSelector(viewer, (state) => state.canvasId);

// Imperative command, straight through the ref.
function next(): void {
    viewer.value?.state?.nextCanvas();
}
