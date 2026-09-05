// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const galleryOpen = useViewerSelector(
    viewer,
    (state) => state.showThumbnailGallery,
);

const log = (snapshot: ViewerStateSnapshot): void =>
    console.log('Dock side:', snapshot.dockSide);
