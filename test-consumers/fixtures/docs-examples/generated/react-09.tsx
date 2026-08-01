// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const plugins = [ImageManipulationPlugin, createPdfExportPlugin()];

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={plugins}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
