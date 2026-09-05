// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

export function Reader() {
    const handle = useViewerHandle();
    const galleryOpen = useViewerSelector(
        handle,
        (state) => state.showThumbnailGallery,
    );

    return (
        <>
            <p>Gallery is {galleryOpen ? 'open' : 'closed'}</p>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                onStateChange={(snapshot) =>
                    console.log('Dock side:', snapshot.dockSide)
                }
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
