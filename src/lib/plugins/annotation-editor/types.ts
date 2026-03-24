import type { User, DrawingStyle } from '@annotorious/openseadragon';

export interface AnnotationEditorRuntimeContext<HostContext = unknown> {
    manifestId: string | null;
    canvasId: string | null;
    isEditing: boolean;
    selectedAnnotation: any | null;
    user?: User;
    hostContext: HostContext | null;
}

export interface AnnotationEditorExtension<HostContext = unknown> {
    getContext?: () => HostContext | null;
    canCreate?: (
        context: AnnotationEditorRuntimeContext<HostContext>,
    ) => boolean;
    getCreateDisabledReason?: (
        context: AnnotationEditorRuntimeContext<HostContext>,
    ) => string | null;
    prepareDraft?: (
        annotation: any,
        context: AnnotationEditorRuntimeContext<HostContext>,
    ) => any;
    beforeSave?: (
        annotation: any,
        context: AnnotationEditorRuntimeContext<HostContext>,
    ) => any | Promise<any>;
    onSelectionChange?: (
        annotation: any | null,
        context: AnnotationEditorRuntimeContext<HostContext>,
    ) => void;
}

/** Forward reference to avoid circular imports - full definition in adapters/types.ts */
export interface AnnotationStorageAdapter {
    readonly id: string;
    readonly name: string;
    load(manifestId: string, canvasId: string): Promise<any[]>;
    hydrate?(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<any | null>;
    create(
        manifestId: string,
        canvasId: string,
        annotation: any,
    ): Promise<void>;
    update(
        manifestId: string,
        canvasId: string,
        annotation: any,
    ): Promise<void>;
    delete(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<void>;
    destroy?(): void;
}

export interface AnnotationEditorConfig {
    /** Storage adapter for persistence */
    adapter?: AnnotationStorageAdapter;

    /** Current user for attribution */
    user?: User;

    /** Drawing style for annotations while editing */
    drawingStyle?: DrawingStyle;

    /** Available drawing tools */
    tools?: DrawingTool[];

    /** Default drawing tool */
    defaultTool?: DrawingTool;

    /** Optional extension hook surface for host apps */
    extension?: AnnotationEditorExtension;

    /** Optional hook to prefill a new annotation before its first save */
    prepareAnnotation?: (annotation: any) => any;

    /** Optional gate for whether new annotations can be created right now */
    canCreateAnnotation?: () => boolean;

    /** Optional status message explaining why creation is unavailable */
    getCreateDisabledReason?: () => string | null;
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
