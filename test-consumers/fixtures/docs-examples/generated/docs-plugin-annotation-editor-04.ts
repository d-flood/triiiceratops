// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createAnnotationEditorPlugin,
    LocalStorageAdapter,
} from '@triiiceratops/plugin-annotation-editor';

const annotations = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    user: { id: 'user-123', name: 'Jane Doe' },
    tools: ['rectangle', 'polygon', 'point'],
});

viewer.plugins = [annotations];
