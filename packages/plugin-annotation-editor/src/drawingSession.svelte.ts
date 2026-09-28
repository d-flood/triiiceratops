/** Arming state shared by the panel and the drawing layer. */
import type { W3CAnnotation } from './adapters/types';
import type { DrawingTool } from './types';

export class DrawingSession {
    armedTool = $state<DrawingTool | null>(null);

    editingAnnotationId = $state<string | null>(null);

    focusOnEdit = $state(false);

    onCreated: ((annotation: W3CAnnotation) => void) | null = null;

    prepareDraft: ((annotation: W3CAnnotation) => W3CAnnotation) | null = null;

    beforeSave: ((annotation: W3CAnnotation) => Promise<W3CAnnotation>) | null =
        null;

    createWholeCanvasAnnotation: (() => void) | null = null;

    placeDefaultShape: ((tool: DrawingTool) => void) | null = null;

    requestDelete: (() => void) | null = null;

    requestCancelEdit: (() => void) | null = null;

    requestDisarm: (() => void) | null = null;
}
