import type { W3CAnnotationBody, AnnotationStorageAdapter } from '../types';

/** W3C Web Annotation structure (simplified for our use case) */
export interface W3CAnnotation {
    '@context'?: string;
    id: string;
    type: 'Annotation';
    body?: W3CAnnotationBody | W3CAnnotationBody[];
    target: {
        source: string;
        selector?: {
            type: string;
            value?: string;
            conformsTo?: string;
        };
    };
    creator?: {
        id?: string;
        name?: string;
    };
    created?: string;
    modified?: string;
}

// Re-export for convenience
export type { AnnotationStorageAdapter };
