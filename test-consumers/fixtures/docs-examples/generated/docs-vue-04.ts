// GENERATED from apps/site/content/docs/vue.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
// ComputedRef<boolean | undefined>, inferred.
const galleryOpen = useViewerSelector(
    viewer,
    (state) => state.showThumbnailGallery,
);
