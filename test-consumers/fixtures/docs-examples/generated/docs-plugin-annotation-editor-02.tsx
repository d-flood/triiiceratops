// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { AnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';

const plugins = [AnnotationEditorPlugin];

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={plugins}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
