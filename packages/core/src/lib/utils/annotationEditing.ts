import type { PluginMenuButton } from '../types/plugin';

/**
 * Whether the annotation editor is open, read from the plugin's toolbar button
 * — which is target-independent (`isActive` reflects open for both a panel and
 * a flyout).
 *
 * TODO(editing claim): core should not name a plugin. The literal
 * `'annotation-editor'` hard-codes which single plugin may make an annotation
 * editable — nothing else can, however it is packaged. The replacement is an
 * editing claim a plugin declares: an "annotation editing is open" state on
 * `ViewerState.annotationEditBus`, set by whoever is editing, so this reads a
 * capability rather than a name.
 *
 * Known debt, deliberately deferred — see
 * `docs/adr/0021-the-editing-surface-is-first-party.md`. It only pays off when
 * a SECOND plugin wants to make annotations editable, which is the far-future
 * AV annotation editor, and the annotation editor keeps
 * `uiId: 'annotation-editor'` until then or nothing is editable at all.
 */
export function isAnnotationEditorOpen(
    pluginMenuButtons: readonly PluginMenuButton[],
): boolean {
    const editorButton = pluginMenuButtons.find(
        (button) => button.pluginId === 'annotation-editor',
    );
    return editorButton?.isActive?.() ?? false;
}
