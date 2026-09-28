import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

const MANIFEST =
    'https://iiif.wellcomecollection.org/presentation/v2/b18035723';

export function App() {
    const handle = useViewerHandle();

    const canvasId = useViewerSelector(handle, (state) => state.canvasId);

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

            <TriiiceratopsViewer
                handle={handle}
                manifestId={MANIFEST}
                style={{ display: 'block', height: '70vh' }}
            />
        </main>
    );
}
