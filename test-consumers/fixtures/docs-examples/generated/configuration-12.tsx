// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useState } from 'react';
import {
    TriiiceratopsViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

export function Reader({ startCanvasId }: { startCanvasId: string }) {
    const handle = useViewerHandle();
    // Where the viewer actually is.
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);
    // What we last told it to show.
    const [requestedCanvasId, setRequestedCanvasId] = useState(startCanvasId);

    return (
        <>
            <p>Showing {canvasId ?? '…'}</p>
            <button
                type="button"
                onClick={() =>
                    setRequestedCanvasId('https://example.org/canvas/7')
                }
            >
                Jump to canvas 7
            </button>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                canvasId={requestedCanvasId}
                onCanvasChange={(snapshot) =>
                    console.log('New Canvas ID:', snapshot.canvasId)
                }
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
