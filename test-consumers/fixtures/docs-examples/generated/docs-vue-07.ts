// GENERATED from apps/site/content/docs/vue.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const zoom = useViewerSelector(
    viewer,
    (state) => state.viewportScale,
    { cadence: 'frame' },
);
