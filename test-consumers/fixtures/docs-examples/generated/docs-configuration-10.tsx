// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
} from 'triiiceratops/react';

export function Reader() {
    const handle = useViewerHandle();
    const viewer = useViewer(handle);
    return (
        <>
            <button type="button" onClick={() => void viewer?.search('lorem')}>
                Search
            </button>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
