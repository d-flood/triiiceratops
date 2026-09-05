// GENERATED from apps/site/content/docs/react.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function ZoomReadout({ handle }: { handle: ViewerHandleSlot }) {
    const zoom = useViewerSelector(
        handle,
        (state) => state.viewportScale,
        { cadence: 'frame' },
    );
    if (zoom === undefined) return null;
    return <span>{Math.round(zoom * 100)}%</span>;
}
