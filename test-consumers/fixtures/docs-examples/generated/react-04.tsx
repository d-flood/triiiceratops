// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function CanvasCounter({ handle }: { handle: ViewerHandleSlot }) {
    const position = useViewerSelector(
        handle,
        (state) => ({
            index: state.currentCanvasIndex,
            total: state.canvases.length,
        }),
        { equals: (a, b) => a.index === b.index && a.total === b.total },
    );
    if (!position) return null;
    return (
        <span>
            {position.index + 1} / {position.total}
        </span>
    );
}
