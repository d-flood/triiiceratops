// GENERATED from docs/plugins.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createAnnotationEditorPlugin,
    type AnnotationStorageAdapter,
    type W3CAnnotation,
} from '@triiiceratops/plugin-annotation-editor';

class AnnotationServerAdapter implements AnnotationStorageAdapter {
    readonly id = 'annotation-server';
    readonly name = 'Annotation Server';

    constructor(private baseUrl: string) {}

    /** One container per manifest+canvas. */
    private container(manifestId: string, canvasId: string): string {
        const key = encodeURIComponent(`${manifestId}::${canvasId}`);
        return `${this.baseUrl}/containers/${key}/`;
    }

    async load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]> {
        const res = await fetch(this.container(manifestId, canvasId), {
            headers: { Accept: 'application/ld+json' },
        });
        // An empty container is normal — return [] rather than throwing.
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const page = await res.json();
        return page.items ?? [];
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(this.container(manifestId, canvasId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`create failed: ${res.status}`);
        // Prefer the server's returned representation; fall back to the id it
        // minted in the Location header. Returning the canonical annotation lets
        // the plugin reconcile the id everywhere it is displayed and edited.
        const location = res.headers.get('Location');
        const created = await res.json().catch(() => null);
        if (created?.id) return created;
        if (location) return { ...annotation, id: location };
        return created ?? annotation;
    }

    async update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(annotation.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`update failed: ${res.status}`);
        return (await res.json().catch(() => null)) ?? annotation;
    }

    async delete(
        _manifestId: string,
        _canvasId: string,
        annotationId: string,
    ): Promise<void> {
        const res = await fetch(annotationId, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`delete failed: ${res.status}`);
        }
    }
}

const plugin = createAnnotationEditorPlugin({
    adapter: new AnnotationServerAdapter('https://annotations.example.org'),
});
