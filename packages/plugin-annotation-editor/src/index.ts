/**
 * `@triiiceratops/plugin-annotation-editor` — ESM entry.
 *
 * ```ts
 * import {
 *     createAnnotationEditorPlugin,
 *     AnnotationEditorPlugin,
 *     LocalStorageAdapter,
 * } from '@triiiceratops/plugin-annotation-editor';
 * // Svelte:  <TriiiceratopsViewer plugins={[AnnotationEditorPlugin]} />
 * // WC:      viewer.plugins = [AnnotationEditorPlugin];
 * ```
 */

export {
    createAnnotationEditorPlugin,
    AnnotationEditorPlugin,
} from './plugin';

// Public type surface.
export type {
    AnnotationEditorConfig,
    AnnotationBodyEditor,
    AnnotationBodyEditorApi,
    AnnotationEditorExtension,
    AnnotationEditorRuntimeContext,
    AnnotationEditorUiConfig,
    AnnotationPersistenceError,
    AnnotationPersistenceOp,
    DrawingTool,
    PointStyle,
    W3CAnnotationBody,
    W3CPurpose,
    AnnotationStorageAdapter,
} from './types';
export { W3C_PURPOSES } from './types';

// Adapter surface.
export type {
    W3CAnnotation,
    W3CTarget,
    W3CSelector,
    FragmentSelector,
    PointSelector,
    SvgSelector,
    UnknownSelector,
    AdapterLoadResult,
} from './adapters/types';
export { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
