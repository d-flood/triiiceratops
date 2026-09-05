// GENERATED from apps/site/content/docs/vue.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const position = useViewerSelector(
    viewer,
    (state) => ({
        index: state.currentCanvasIndex,
        total: state.canvases.length,
    }),
    { equals: (a, b) => a.index === b.index && a.total === b.total },
);
