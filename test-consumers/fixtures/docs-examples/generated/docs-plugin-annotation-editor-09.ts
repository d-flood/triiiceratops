// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createAnnotationEditorPlugin,
    type AnnotationEditorRuntimeContext,
    type W3CAnnotation,
} from '@triiiceratops/plugin-annotation-editor';

const annotations = createAnnotationEditorPlugin({
    extension: {
        canCreate: (context: AnnotationEditorRuntimeContext) =>
            context.user !== undefined,
        getCreateDisabledReason: () => 'Sign in to annotate.',
        // The draft is what the reader sees in the panel AND what is saved.
        prepareDraft: (annotation: W3CAnnotation) => ({
            ...annotation,
            motivation: 'describing',
        }),
        onSelectionChange: (annotation: W3CAnnotation | null) => {
            console.log(annotation?.id ?? 'nothing selected');
        },
    },
});
