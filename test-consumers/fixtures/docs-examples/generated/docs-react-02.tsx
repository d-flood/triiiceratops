// GENERATED from apps/site/content/docs/react.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

export function Reader() {
    const handle = useViewerHandle();

    // Reactive read: re-renders only when the selected value changes.
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);
    // The live state object: commands and on-demand reads, no subscription.
    const viewer = useViewer(handle);

    return (
        <div className="reader">
            <p>{canvasId ?? 'No canvas yet'}</p>
            <button type="button" onClick={() => viewer?.nextCanvas()}>
                Next canvas
            </button>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </div>
    );
}
