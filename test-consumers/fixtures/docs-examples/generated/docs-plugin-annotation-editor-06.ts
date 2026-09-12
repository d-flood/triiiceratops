// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createAnnotationEditorPlugin,
    type AnnotationPersistenceError,
} from '@triiiceratops/plugin-annotation-editor';

const annotations = createAnnotationEditorPlugin({
    onPersistenceError: (error: AnnotationPersistenceError) => {
        // Already rolled back by the time this runs: decide how to surface it.
        console.warn(`annotation ${error.op} failed`, error.cause);
        void error.retry();
    },
});
