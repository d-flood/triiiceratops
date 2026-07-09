import type { User, DrawingStyle } from '@annotorious/openseadragon';
import type { Component } from 'svelte';
import type { PluginUiTarget } from '../../types/plugin';
import type { PointStyle } from '../../utils/pointMarker';
import type { W3CAnnotation, AdapterLoadResult } from './adapters/types';

export type { PointStyle };

export interface AnnotationEditorRuntimeContext<
    HostContext = unknown,
    TBody = W3CAnnotationBody,
> {
    manifestId: string | null;
    canvasId: string | null;
    isEditing: boolean;
    selectedAnnotation: W3CAnnotation<TBody> | null;
    user?: User;
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
    /** Full selected annotation in canvas space. */
    annotation: W3CAnnotation<TBody>;
    /** Current annotation bodies normalized to an array; body shape is host-owned. */
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

/**
 * The storage contract a host implements to bring its own annotation server.
 * It is pure storage — the plugin's `AnnotationStore` owns display sync,
 * caching, id reconciliation, stamping, and error handling — so a conforming
 * adapter is roughly these five functions (see `LocalStorageAdapter`).
 *
 * The `W3CAnnotation` / `AdapterLoadResult` shapes are defined in
 * `adapters/types.ts`; they are imported here (type-only, so the cycle is
 * erased at compile time) to keep the adapter contract fully typed.
 */
export interface AnnotationStorageAdapter<TBody = W3CAnnotationBody> {
    readonly id: string;
    readonly name: string;
    /**
     * Return the canvas's annotations. Skeleton entries (bodies not yet loaded)
     * carry `__fullBodyLoaded: false`; the plugin reads that marker once and
     * strips it (see {@link AdapterLoadResult}).
     */
    load(
        manifestId: string,
        canvasId: string,
    ): Promise<AdapterLoadResult<TBody>[]>;
    /** Fetch the full body for a previously-skeleton annotation. */
    hydrate?(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<AdapterLoadResult<TBody> | null>;
    /**
     * Persist a new annotation. Servers that mint their own annotation IRI on
     * create may return the canonical annotation (or just its id string); the
     * plugin then reconciles the id everywhere. Returning `void` keeps the
     * client-generated id (the LocalStorageAdapter path).
     */
    create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation<TBody>,
    ): Promise<W3CAnnotation<TBody> | string | void>;
    /**
     * Persist an update. Returning the (possibly server-normalized) annotation
     * replaces the cached copy; returning `void` keeps the sent payload.
     */
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

/** The adapter operations whose failures are surfaced (F20). */
export type AnnotationPersistenceOp =
    | 'load'
    | 'create'
    | 'update'
    | 'delete'
    | 'hydrate';

/**
 * Structured description of a failed persistence operation handed to
 * `config.onPersistenceError`. The plugin has already rolled back its optimistic
 * cache/display changes by the time this fires; `retry()` re-runs the exact
 * failed operation with the same payload (F20).
 */
export interface AnnotationPersistenceError {
    op: AnnotationPersistenceOp;
    /** The affected annotation id, when the operation targets one. */
    annotationId?: string;
    manifestId: string;
    canvasId: string;
    /** The value the adapter threw/rejected with. */
    cause: unknown;
    retry: () => Promise<void>;
}

export interface AnnotationEditorConfig<
    TBody = W3CAnnotationBody,
    THostContext = unknown,
> {
    /** Render target for the plugin chrome. Defaults to `'panel'`. */
    target?: PluginUiTarget;

    /** Preferred panel position when `target` is `'panel'`. Defaults to `'left'`. */
    position?: 'left' | 'right' | 'bottom' | 'overlay';

    /** Storage adapter for persistence */
    adapter?: AnnotationStorageAdapter<TBody>;

    /** Current user for attribution */
    user?: User;

    /** Drawing style for annotations while editing */
    drawingStyle?: DrawingStyle;

    /**
     * Marker styling for point annotations (`PointSelector`). Consumed by both
     * the read-only overlay and the editor so a point looks the same selected or
     * not; `radius` is in screen pixels. Defaults to a red marker of radius 5
     * (spec §3.4).
     */
    pointStyle?: PointStyle;

    /** Available drawing tools */
    tools?: DrawingTool[];

    /** Default drawing tool */
    defaultTool?: DrawingTool;

    /** Optional extension hook surface for host apps */
    extension?: AnnotationEditorExtension<THostContext, TBody>;

    /** Optional replacement for the built-in annotation body editor. */
    bodyEditor?: AnnotationBodyEditor<THostContext, TBody>;

    /** Optional UI chrome and built-in body editor knobs. */
    ui?: AnnotationEditorUiConfig;

    /** Optional hook to prefill a new annotation before its first save */
    prepareAnnotation?: (
        annotation: W3CAnnotation<TBody>,
    ) => W3CAnnotation<TBody>;

    /** Optional gate for whether new annotations can be created right now */
    canCreateAnnotation?: () => boolean;

    /** Optional status message explaining why creation is unavailable */
    getCreateDisabledReason?: () => string | null;

    /**
     * Motivation stamped onto new annotations that don't already carry one.
     * Defaults to `'commenting'`. A host-set `motivation` (or one applied by
     * `extension.beforeSave`) is never overwritten.
     */
    defaultMotivation?: string;

    /**
     * Called when a persistence operation fails. The plugin has already rolled
     * back its optimistic cache/display changes and re-signalled selection; the
     * host decides how to surface the failure and may call `retry()` to re-run
     * the exact failed operation. When omitted, the plugin logs to the console
     * and shows a dismissible error line in the panel so failures are never
     * invisible (F20).
     */
    onPersistenceError?: (error: AnnotationPersistenceError) => void;
}

export type DrawingTool = 'rectangle' | 'polygon' | 'point';

/** W3C Annotation Body */
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

/** Standard W3C purposes for autocomplete */
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
