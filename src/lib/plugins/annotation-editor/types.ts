import type { User, DrawingStyle } from '@annotorious/openseadragon';

/** Forward reference to avoid circular imports - full definition in adapters/types.ts */
export interface AnnotationStorageAdapter {
    readonly id: string;
    readonly name: string;
    load(manifestId: string, canvasId: string): Promise<any[]>;
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
