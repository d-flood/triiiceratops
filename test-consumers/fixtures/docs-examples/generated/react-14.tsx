// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
    ViewerProvider,
} from 'triiiceratops/react';

// Hide the built-in chrome you are replacing. Hoisted, so the wrapper
// never re-applies it.
const CONFIG = { showCanvasNav: false, showToggle: false };

function MyToolbar() {
    const viewer = useViewer();
    const hasPrevious = useViewerSelector((state) => state.hasPrevious);
    const hasNext = useViewerSelector((state) => state.hasNext);
    const position = useViewerSelector(
        (state) => `${state.currentCanvasIndex + 1} / ${state.canvases.length}`,
    );

    return (
        <nav className="my-toolbar">
            <button
                type="button"
                disabled={!hasPrevious}
                onClick={() => viewer?.previousCanvas()}
            >
                Previous
            </button>
            <span>{position}</span>
            <button
                type="button"
                disabled={!hasNext}
                onClick={() => viewer?.nextCanvas()}
            >
                Next
            </button>
            <button type="button" onClick={() => viewer?.zoomIn()}>
                Zoom in
            </button>
        </nav>
    );
}

export function Reader() {
    const handle = useViewerHandle();
    return (
        <ViewerProvider value={handle}>
            <MyToolbar />
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                config={CONFIG}
                style={{ display: 'block', height: '600px' }}
            />
        </ViewerProvider>
    );
}
