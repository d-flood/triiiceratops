// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useState } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader({ initialCanvasId }: { initialCanvasId: string }) {
    const [currentCanvasId, setCurrentCanvasId] = useState(initialCanvasId);

    return (
        <>
            <p>Showing {currentCanvasId}</p>
            <TriiiceratopsViewer
                manifestId="https://example.org/manifest.json"
                // An instruction, not a binding: this value is applied when it
                // changes, and internal navigation is never overwritten by it.
                canvasId={initialCanvasId}
                onCanvasChange={(snapshot) => {
                    if (snapshot.canvasId) setCurrentCanvasId(snapshot.canvasId);
                }}
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
