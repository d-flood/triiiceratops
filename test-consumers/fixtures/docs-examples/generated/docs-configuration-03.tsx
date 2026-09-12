// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader({ manifestJson }: { manifestJson: object }) {
    return (
        <TriiiceratopsViewer
            manifestId="urn:example:manifest"
            manifestJson={manifestJson as Record<string, unknown>}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
