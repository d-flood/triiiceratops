import { describe, expect, it } from 'vitest';

import { AnnotationEditorPlugin, createAnnotationEditorPlugin } from './index';
import { ALL_TOOLS } from './tools';

/**
 * The factory returns an SDK plugin (framework-neutral `definePlugin` factory):
 * `target` threads through from config (flyout vs panel), and the plugin
 * carries a neutral `view.mount` and its package-qualified name.
 *
 * Compatibility is stated by `coreRange` alone. Overlay layers — the drawing
 * layer's container — are not in core's capability list, because core treats
 * them as always present, so there is nothing optional left to require.
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

    // A core without `registerOverlayLayer` has nowhere to put the drawing
    // layer, so the floor is what fails activation loudly rather than mounting
    // a button that draws nothing.
    it('declares a core floor and requires no capability', () => {
        const plugin = createAnnotationEditorPlugin();

        expect(plugin.coreRange).toBe('>=1.0.0-rc.36');
        expect(plugin.requiredCapabilities).toEqual([]);
    });

    it('exposes a pre-configured default plugin', () => {
        expect(AnnotationEditorPlugin.kind).toBe('triiiceratops-plugin');
        expect(AnnotationEditorPlugin.target).toBe('panel');
    });

    // The panel's button list comes straight from this, so a tool dropped here
    // disappears from the UI with nothing else failing.
    it('offers every drawing tool by default', () => {
        expect(ALL_TOOLS).toEqual([
            'rectangle',
            'ellipse',
            'polygon',
            'point',
            'wholeCanvas',
        ]);
    });
});
