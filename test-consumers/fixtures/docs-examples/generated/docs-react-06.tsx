// GENERATED from apps/site/content/docs/react.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
    ViewerProvider,
} from 'triiiceratops/react';

function CanvasLabel() {
    const canvasId = useViewerSelector((state) => state.canvasId);
    return <p>{canvasId ?? 'No canvas yet'}</p>;
}

function ZoomButtons() {
    const viewer = useViewer();
    return (
        <>
            <button type="button" onClick={() => viewer?.zoomOut()}>
                −
            </button>
            <button type="button" onClick={() => viewer?.zoomIn()}>
                +
            </button>
        </>
    );
}

export function Reader() {
    const handle = useViewerHandle();
    return (
        <ViewerProvider value={handle}>
            <header>
                <CanvasLabel />
                <ZoomButtons />
            </header>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </ViewerProvider>
    );
}
