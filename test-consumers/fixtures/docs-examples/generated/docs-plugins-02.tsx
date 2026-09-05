// GENERATED from apps/site/content/docs/plugins.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

const plugins = [ImageManipulationPlugin];

export function Viewer() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={plugins}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
