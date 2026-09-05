// GENERATED from apps/site/content/docs/react.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            onCanvasChange={(snapshot) => history.replaceState(
                null,
                '',
                `?canvas=${encodeURIComponent(snapshot.canvasId ?? '')}`,
            )}
            // The original PluginError object, recovery behavior intact.
            onPluginError={(error) => error.retry()}
            onViewerError={(error) => console.error(error.message)}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
