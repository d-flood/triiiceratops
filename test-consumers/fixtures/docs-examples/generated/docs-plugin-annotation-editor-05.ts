// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type {
    AdapterLoadResult,
    AnnotationStorageAdapter,
    W3CAnnotation,
} from '@triiiceratops/plugin-annotation-editor';

const url = (manifestId: string, canvasId: string) =>
    `/api/annotations?manifest=${encodeURIComponent(manifestId)}` +
    `&canvas=${encodeURIComponent(canvasId)}`;

export const adapter: AnnotationStorageAdapter = {
    id: 'my-server',
    name: 'Institutional annotation server',

    async load(manifestId, canvasId) {
        const response = await fetch(url(manifestId, canvasId));
        return (await response.json()) as AdapterLoadResult[];
    },

    // Return the canonical annotation (or just its id string) when your server
    // mints its own IRI — the plugin then reconciles the id everywhere at once.
    // Returning `void` keeps the client-generated one.
    async create(manifestId, canvasId, annotation) {
        const response = await fetch(url(manifestId, canvasId), {
            method: 'POST',
            body: JSON.stringify(annotation),
        });
        return (await response.json()) as W3CAnnotation;
    },

    async update(manifestId, canvasId, annotation) {
        await fetch(url(manifestId, canvasId), {
            method: 'PUT',
            body: JSON.stringify(annotation),
        });
    },

    async delete(manifestId, canvasId, annotationId) {
        await fetch(`${url(manifestId, canvasId)}&id=${annotationId}`, {
            method: 'DELETE',
        });
    },
};
