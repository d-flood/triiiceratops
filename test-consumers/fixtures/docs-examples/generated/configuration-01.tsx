// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { ViewerConfig } from 'triiiceratops/react';

// Hoisted (or `useMemo`d) so a parent re-render does not re-apply it.
const config: ViewerConfig = {
    toolbar: { side: 'left' },
    gallery: { dockPosition: 'right' },
};

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/iiif/manifest.json"
            config={config}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
