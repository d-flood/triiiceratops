import type {
    W3CAnnotation,
    AdapterLoadResult,
    AnnotationStorageAdapter,
} from './types';

/**
 * LocalStorage-based annotation adapter — the reference minimal adapter.
 *
 * It is pure storage: `localStorage` reads and writes, nothing more. Display
 * sync (`manifestsState`), caching, id reconciliation, and error handling are
 * all owned by the plugin's `AnnotationStore`, so a custom adapter only needs to
 * implement these few storage methods (F10). This is the shape every adapter
 * should aim for.
 */
export class LocalStorageAdapter implements AnnotationStorageAdapter {
    readonly id = 'localStorage';
    readonly name = 'Local Storage';

    private storageKey(manifestId: string, canvasId: string): string {
        return `triiiceratops:annotations:${encodeURIComponent(manifestId)}:${encodeURIComponent(canvasId)}`;
    }

    async load(
        manifestId: string,
        canvasId: string,
    ): Promise<AdapterLoadResult[]> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        for (const annotation of annotations) {
            annotation.__fullBodyLoaded = true;
        }
        return annotations;
    }

    async hydrate(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<AdapterLoadResult | null> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        const annotation = annotations.find((entry) => entry.id === annotationId) ?? null;
        if (!annotation) return null;
        annotation.__fullBodyLoaded = true;
        return annotation;
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<void> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        annotations.push(annotation);
        this.saveToStorage(manifestId, canvasId, annotations);
    }

    async update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<void> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        const index = annotations.findIndex((a) => a.id === annotation.id);
        if (index >= 0) {
            annotations[index] = annotation;
            this.saveToStorage(manifestId, canvasId, annotations);
        }
    }

    async delete(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<void> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        const filtered = annotations.filter((a) => a.id !== annotationId);
        this.saveToStorage(manifestId, canvasId, filtered);
    }

    private async loadFromStorage(
        manifestId: string,
        canvasId: string,
    ): Promise<AdapterLoadResult[]> {
        const key = this.storageKey(manifestId, canvasId);
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    private saveToStorage(
        manifestId: string,
        canvasId: string,
        annotations: W3CAnnotation[],
    ): void {
        const key = this.storageKey(manifestId, canvasId);
        localStorage.setItem(key, JSON.stringify(annotations));
    }
}
