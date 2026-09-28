import type { Component } from 'svelte';
import type { PluginUiTarget } from '@triiiceratops/plugin-sdk';
import type { W3CAnnotation, AdapterLoadResult } from './adapters/types';

export interface AnnotationEditorUser {
    id: string;
    name?: string;
}

export interface AnnotationEditorRuntimeContext<
    HostContext = unknown,
    TBody = W3CAnnotationBody,
> {
    manifestId: string | null;
    canvasId: string | null;
    isEditing: boolean;
    selectedAnnotation: W3CAnnotation<TBody> | null;
    user?: AnnotationEditorUser;
    hostContext: HostContext | null;
}

export interface AnnotationEditorExtension<
    HostContext = unknown,
    TBody = W3CAnnotationBody,
> {
    getContext?: () => HostContext | null;
    /**
     * Subscribe to host-context changes. Call `invalidate` when canCreate or
     * getCreateDisabledReason should re-evaluate; return an unsubscribe.
     */
    subscribe?: (invalidate: () => void) => () => void;
    canCreate?: (
        context: AnnotationEditorRuntimeContext<HostContext, TBody>,
    ) => boolean;
    getCreateDisabledReason?: (
        context: AnnotationEditorRuntimeContext<HostContext, TBody>,
    ) => string | null;
    prepareDraft?: (
        annotation: W3CAnnotation<TBody>,
        context: AnnotationEditorRuntimeContext<HostContext, TBody>,
    ) => W3CAnnotation<TBody>;
    beforeSave?: (
        annotation: W3CAnnotation<TBody>,
        context: AnnotationEditorRuntimeContext<HostContext, TBody>,
    ) => W3CAnnotation<TBody> | Promise<W3CAnnotation<TBody>>;
    onSelectionChange?: (
        annotation: W3CAnnotation<TBody> | null,
        context: AnnotationEditorRuntimeContext<HostContext, TBody>,
    ) => void;
}

export interface AnnotationBodyEditorApi<
    HostContext = unknown,
    TBody = W3CAnnotationBody,
> {
    annotation: W3CAnnotation<TBody>;
    bodies: unknown[];
    context: AnnotationEditorRuntimeContext<HostContext, TBody>;
    isHydrating: boolean;
    save: (bodies: unknown[] | unknown) => Promise<void>;
    cancel: () => void;
    requestDelete: () => void;
}

export type AnnotationBodyEditor<
    HostContext = unknown,
    TBody = W3CAnnotationBody,
> =
    | {
          component: Component<{
              api: AnnotationBodyEditorApi<HostContext, TBody>;
          }>;
      }
    | {
          render: (
              container: HTMLElement,
              api: AnnotationBodyEditorApi<HostContext, TBody>,
          ) => (() => void) | void;
      };

export interface AnnotationEditorUiConfig {
    /** Show the Edit/Create segmented control. Defaults to `true`. */
    showModeToggle?: boolean;
    /** Open in create mode when creation is currently allowed. Defaults to `false`. */
    startInCreateMode?: boolean;
    /** Show persistence-aware undo/redo buttons. Defaults to `true`. */
    showUndoRedo?: boolean;
    /** Purpose choices shown by the built-in body editor. Defaults to `W3C_PURPOSES`. */
    purposes?: string[];
    /** Allow adding more body rows in the built-in body editor. Defaults to `true`. */
    allowMultipleBodies?: boolean;
}

/** Pure storage; the store owns display sync, caching, reconciliation, stamping, errors. */
export interface AnnotationStorageAdapter<TBody = W3CAnnotationBody> {
    readonly id: string;
    readonly name: string;
    load(
        manifestId: string,
        canvasId: string,
    ): Promise<AdapterLoadResult<TBody>[]>;
    hydrate?(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<AdapterLoadResult<TBody> | null>;
    create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation<TBody>,
    ): Promise<W3CAnnotation<TBody> | string | void>;
    update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation<TBody>,
    ): Promise<W3CAnnotation<TBody> | void>;
    delete(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<void>;
    destroy?(): void;
}

export type AnnotationPersistenceOp =
    | 'load'
    | 'create'
    | 'update'
    | 'delete'
    | 'hydrate';

export interface AnnotationPersistenceError {
    op: AnnotationPersistenceOp;
    annotationId?: string;
    manifestId: string;
    canvasId: string;
    cause: unknown;
    retry: () => Promise<void>;
}

export interface AnnotationEditorConfig<
    TBody = W3CAnnotationBody,
    THostContext = unknown,
> {
    target?: PluginUiTarget;

    adapter?: AnnotationStorageAdapter<TBody>;

    user?: AnnotationEditorUser;

    tools?: DrawingTool[];

    defaultTool?: DrawingTool;

    extension?: AnnotationEditorExtension<THostContext, TBody>;

    bodyEditor?: AnnotationBodyEditor<THostContext, TBody>;

    ui?: AnnotationEditorUiConfig;

    prepareAnnotation?: (
        annotation: W3CAnnotation<TBody>,
    ) => W3CAnnotation<TBody>;

    canCreateAnnotation?: () => boolean;

    getCreateDisabledReason?: () => string | null;

    defaultMotivation?: string;

    onPersistenceError?: (error: AnnotationPersistenceError) => void;
}

export type DrawingTool =
    | 'rectangle'
    | 'ellipse'
    | 'polygon'
    | 'point'
    | 'wholeCanvas';

export interface W3CAnnotationBody {
    type?: string;
    purpose?: string;
    value?: string;
    format?: string;
    language?: string;
    creator?: {
        id?: string;
        name?: string;
    };
    created?: string;
    modified?: string;
}

export const W3C_PURPOSES = [
    'commenting',
    'tagging',
    'describing',
    'classifying',
    'identifying',
    'linking',
    'bookmarking',
    'highlighting',
    'questioning',
    'replying',
] as const;

export type W3CPurpose = (typeof W3C_PURPOSES)[number];
