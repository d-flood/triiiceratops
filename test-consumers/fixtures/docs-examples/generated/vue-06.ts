// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ref, useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const showIndex = ref(false);

// Two dependencies, one composable: the viewer's canvas AND `showIndex`.
// Toggling `showIndex` invalidates the selection with no watcher of your own.
const label = useViewerSelector(viewer, (state) =>
    showIndex.value
        ? `Canvas ${state.currentCanvasIndex + 1}`
        : (state.canvasId ?? 'No canvas yet'),
);
