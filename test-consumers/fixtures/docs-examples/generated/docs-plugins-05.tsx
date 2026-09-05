// GENERATED from apps/site/content/docs/plugins.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useEffect, useState } from 'react';
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
} from 'triiiceratops/react';

export function Viewer() {
    const handle = useViewerHandle();
    const viewer = useViewer(handle);
    const [narrow, setNarrow] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 640px)');
        const sync = () => setNarrow(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        viewer?.setPluginTarget(
            'image-manipulation',
            narrow ? 'flyout' : 'panel',
        );
    }, [viewer, narrow]);

    return (
        <TriiiceratopsViewer
            handle={handle}
            manifestId="https://example.org/manifest.json"
            style={{ display: 'block', height: '600px' }}
        />
    );
}
