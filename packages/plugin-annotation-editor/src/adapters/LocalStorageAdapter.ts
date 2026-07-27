import type {
    W3CAnnotation,
    AdapterLoadResult,
    AnnotationStorageAdapter,
} from './types';

/**
 * LocalStorage-based annotation adapter — the reference minimal adapter.
 *
 * It is pure storage: `localStorage` reads and writes, nothing more. Display
 * sync (to the owning viewer's state), caching, id reconciliation, and error
 * handling are all owned by the plugin's `AnnotationStore`, so a custom adapter
 * only needs to implement these few storage methods (F10). This is the shape
 * every adapter should aim for.
 *
 * ── LocalStorage namespace (FROZEN) ────────────────────────────────────────
 * 1.0 writes under a new, stable, versioned, package-qualified key:
 *
 *     @triiiceratops/plugin-annotation-editor:v1:<manifestId>:<canvasId>
 *
 * This key is FROZEN — it is the stable 1.0 contract and must not change without
 * a `:v2:` bump. The prerelease adapter used a different, unversioned key
 * (`triiiceratops:annotations:<manifestId>:<canvasId>`). Per SPEC, RC-era data is
 * neither read, migrated, deleted, nor overwritten: this adapter never touches
 * the old namespace, so prerelease keys are left byte-identical and untouched
 * (they are disposable RC data). This is local/single-browser storage — not a
 * production multi-user adapter.
 */
export class LocalStorageAdapter implements AnnotationStorageAdapter {
    readonly id = 'localStorage';
    readonly name = 'Local Storage';

    /** The frozen 1.0 namespace prefix (see the class doc). */
    private static readonly KEY_PREFIX =
        '@triiiceratops/plugin-annotation-editor:v1';

    private storageKey(manifestId: string, canvasId: string): string {
        return `${LocalStorageAdapter.KEY_PREFIX}:${encodeURIComponent(manifestId)}:${encodeURIComponent(canvasId)}`;
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
