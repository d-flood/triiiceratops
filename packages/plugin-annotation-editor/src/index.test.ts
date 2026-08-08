import { describe, expect, it } from 'vitest';

import { AnnotationEditorPlugin, createAnnotationEditorPlugin } from './index';

/**
 * The factory returns an SDK plugin (framework-neutral `definePlugin` factory).
 * This suite is the moved `index.test.ts`, updated to assert the SDK shape: the
 * `target` still threads through from config (flyout vs panel), and the plugin
 * carries a neutral `view.mount`, no required capabilities, and its
 * package-qualified name.
 */
describe('createAnnotationEditorPlugin', () => {
    it('can create the annotation editor as a flyout', () => {
        const plugin = createAnnotationEditorPlugin({ target: 'flyout' });

        expect(plugin.kind).toBe('triiiceratops-plugin');
        expect(plugin.target).toBe('flyout');
        expect(typeof plugin.view.mount).toBe('function');
        expect(plugin.name).toBe('@triiiceratops/plugin-annotation-editor');
    });

    it('defaults to a panel target', () => {
        const plugin = createAnnotationEditorPlugin();

        expect(plugin.target).toBe('panel');
        expect(plugin.requiredCapabilities).toEqual([]);
    });

    it('exposes a pre-configured default plugin', () => {
        expect(AnnotationEditorPlugin.kind).toBe('triiiceratops-plugin');
        expect(AnnotationEditorPlugin.target).toBe('panel');
    });
});
