// GENERATED from docs/plugin-av.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { AvPlugin } from '@triiiceratops/plugin-av';

const plugins = [AvPlugin];

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={plugins}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
