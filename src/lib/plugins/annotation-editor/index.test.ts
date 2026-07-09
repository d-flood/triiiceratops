import { describe, expect, it } from 'vitest';

import AnnotationEditorController from './AnnotationEditorController.svelte';
import { createAnnotationEditorPlugin } from './index';

describe('createAnnotationEditorPlugin', () => {
    it('can render the annotation editor as a flyout', () => {
        const plugin = createAnnotationEditorPlugin({ target: 'flyout' });

        expect(plugin.target).toBe('flyout');
        expect(plugin.flyout).toBe(AnnotationEditorController);
        expect(plugin.panel).toBeUndefined();
        expect(plugin.props?.embedded).toBe(true);
    });

    it('passes panel position through for panel targets', () => {
        const plugin = createAnnotationEditorPlugin({ position: 'right' });

        expect(plugin.target).toBe('panel');
        expect(plugin.position).toBe('right');
        expect(plugin.panel).toBe(AnnotationEditorController);
    });
});
