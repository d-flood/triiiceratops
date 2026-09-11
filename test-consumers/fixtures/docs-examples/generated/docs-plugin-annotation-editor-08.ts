// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createAnnotationEditorPlugin,
    type AnnotationBodyEditorApi,
} from '@triiiceratops/plugin-annotation-editor';

const annotations = createAnnotationEditorPlugin({
    bodyEditor: {
        render(container: HTMLElement, api: AnnotationBodyEditorApi) {
            const input = document.createElement('textarea');
            const [body] = api.bodies as { value?: string }[];
            input.value = body?.value ?? '';
            input.onchange = () => {
                void api.save([{ type: 'TextualBody', value: input.value }]);
            };
            container.append(input);
            return () => input.remove();
        },
    },
});
