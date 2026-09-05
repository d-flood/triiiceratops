import { describe, expect, it } from 'vitest';

import { AnnotationEditorPlugin, createAnnotationEditorPlugin } from './index';

/**
 * The factory returns an SDK plugin (framework-neutral `definePlugin` factory):
 * `target` threads through from config (flyout vs panel), and the plugin
 * carries a neutral `view.mount` and its package-qualified name.
 *
 * The capability declaration is deliberately UNSATISFIABLE while the plugin is
 * inert: core retired `osd@5` with no successor, so declaring it is how a
 * consumer who still registers this plugin gets the structured activation
 * failure that says so, rather than a button that quietly does nothing.
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
    });

    // The package is paused and unpublished, but `1.0.0-rc.7` is on the registry
    // for good and its peer range admits a core that cannot run it. A capability
    // core no longer declares is what turns "registered" into a loud activation
    // failure instead of a dead UI.
    it('declares the retired renderer capability, so activation fails loudly', () => {
        expect(createAnnotationEditorPlugin().requiredCapabilities).toEqual([
            'osd@5',
        ]);
    });

    it('exposes a pre-configured default plugin', () => {
        expect(AnnotationEditorPlugin.kind).toBe('triiiceratops-plugin');
        expect(AnnotationEditorPlugin.target).toBe('panel');
    });
});
