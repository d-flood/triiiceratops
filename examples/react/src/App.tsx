import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

// A public IIIF manifest, so the example works with no setup.
const MANIFEST =
    'https://iiif.wellcomecollection.org/presentation/v2/b18035723';

export function App() {
    // The handle is a stable box the component fills in. It is `null` until the
    // custom element publishes its viewer state, which is why reads below are
    // optional.
    const handle = useViewerHandle();

    // Reactive read: re-renders only when the selected value changes.
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);

    // The live state object, for commands and on-demand reads.
    const viewer = useViewer(handle);

    return (
        <main
            style={{
                font: '16px/1.5 system-ui, sans-serif',
                margin: '0 auto',
                maxWidth: '60rem',
                padding: '1.5rem',
            }}
        >
            <h1 style={{ fontSize: '1.25rem' }}>Triiiceratops in React</h1>

            <p
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                }}
            >
                <button type="button" onClick={() => viewer?.nextCanvas()}>
                    Next canvas
                </button>
                <code
                    style={{ fontSize: '0.8125rem', overflowWrap: 'anywhere' }}
                >
                    {canvasId ?? 'waiting for the viewer…'}
                </code>
            </p>

            {/* The host element needs a height; the wrapper adds no layout box. */}
            <TriiiceratopsViewer
                handle={handle}
                manifestId={MANIFEST}
                style={{ display: 'block', height: '70vh' }}
            />
        </main>
    );
}
