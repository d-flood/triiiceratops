// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function GalleryBadge({ handle }: { handle: ViewerHandleSlot }) {
    // `boolean | undefined`, inferred.
    const open = useViewerSelector(handle, (state) => state.showThumbnailGallery);
    return <span>{open ? 'Gallery open' : 'Gallery closed'}</span>;
}
