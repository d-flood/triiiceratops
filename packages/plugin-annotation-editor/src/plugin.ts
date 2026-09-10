/**
 * The annotation-editor plugin, authored on `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through the
 * structural seam (it carries its own `activate(host)`); core never imports this
 * package or its Svelte runtime. The domain machinery — Store, Adapter seam,
 * per-viewer display sync, undo/redo, body editors, the drawing layer — is driven
 * from the neutral `view.mount(container, context)` contract (see
 * `mount.svelte.ts`).
 *
 * `uiId` is load-bearing, not cosmetic: core decides whether an annotation shape
 * is editable by finding a toolbar button whose plugin id is the literal
 * `'annotation-editor'` (`AnnotationShapeOverlay.svelte`). Renaming it makes
 * every shape non-editable, and no test in this package would catch it.
 */
import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

import { catalog } from './catalog';
import { ICON } from './icons';
import { mountAnnotationEditor } from './mount.svelte';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { ALL_TOOLS } from './tools';
import type { AnnotationEditorConfig } from './types';

/**
 * Create an annotation-editor plugin with custom configuration.
 *
 * @example
 * ```ts
 * import {
 *     createAnnotationEditorPlugin,
 *     LocalStorageAdapter,
 * } from '@triiiceratops/plugin-annotation-editor';
 *
 * const annotationPlugin = createAnnotationEditorPlugin({
 *     adapter: new LocalStorageAdapter(),
 *     user: { id: 'user-123', name: 'Jane Doe' },
 * });
 * // Svelte:  <TriiiceratopsViewer plugins={[annotationPlugin]} />
 * // WC:      viewer.plugins = [annotationPlugin];
 * ```
 */
export function createAnnotationEditorPlugin(
    config: AnnotationEditorConfig = {},
): SdkPlugin {
    const view: PluginView = {
        mount(container, context) {
            return mountAnnotationEditor(container, context, config);
        },
    };

    return definePlugin({
        name: '@triiiceratops/plugin-annotation-editor',
        title: 'annotation_editor_title',
        uiId: 'annotation-editor',
        version: '1.0.0-rc.0',
        // The first core carrying `registerOverlayLayer`, which the drawing
        // layer's container is registered through. No `requiredCapabilities`:
        // overlay layers are not in core's capability list because core treats
        // them as always present, so there is nothing optional to require and
        // the floor is the whole compatibility statement.
        coreRange: '>=1.0.0-rc.36',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: config.target ?? 'panel',
        // Editing surface: when hosted as a flyout, canvas clicks are how the
        // user draws, so it must not light-dismiss on outside pointer-down.
        // Ignored for the default `panel` target (panels toggle from the button).
        dismiss: 'explicit',
        catalog,
        view,
    });
}

/**
 * Pre-configured annotation-editor plugin with the LocalStorage adapter. For
 * advanced configuration use {@link createAnnotationEditorPlugin}.
 */
export const AnnotationEditorPlugin: SdkPlugin = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    tools: ALL_TOOLS,
    defaultTool: 'rectangle',
});
