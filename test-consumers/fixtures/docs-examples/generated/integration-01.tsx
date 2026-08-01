// GENERATED from docs/integration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

const plugins = [ImageManipulationPlugin];
const config = { toolbar: { side: 'right' as const } };

export function Viewer({ manifestId }: { manifestId: string }) {
    return (
        <TriiiceratopsViewer
            manifestId={manifestId}
            plugins={plugins}
            config={config}
            onStateChange={(snapshot) => console.log('viewer state', snapshot)}
            style={{ display: 'block', width: '100%', height: '600px' }}
        />
    );
}
