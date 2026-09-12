// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ref, useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
// Where the viewer actually is.
const canvasId = useViewerSelector(viewer, (state) => state.canvasId);
// What we last told it to show.
const requestedCanvasId = ref('https://example.org/canvas/1');

const log = (snapshot: ViewerStateSnapshot): void =>
    console.log('New Canvas ID:', snapshot.canvasId);
