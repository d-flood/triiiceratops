// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const state = useViewer(viewer);
const hasPrevious = useViewerSelector(viewer, (s) => s.hasPrevious);
const hasNext = useViewerSelector(viewer, (s) => s.hasNext);
const position = useViewerSelector(
    viewer,
    (s) => `${s.currentCanvasIndex + 1} / ${s.canvases.length}`,
);

// Hide the built-in chrome you are replacing.
const config = { showCanvasNav: false, showToggle: false };
