// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useRef } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { TriiiceratopsViewerRef } from 'triiiceratops/react';

export function Reader() {
    const ref = useRef<TriiiceratopsViewerRef | null>(null);
    return (
        <>
            <button
                type="button"
                onClick={() => ref.current?.element.scrollIntoView()}
            >
                Scroll to viewer
            </button>
            <TriiiceratopsViewer
                ref={ref}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
