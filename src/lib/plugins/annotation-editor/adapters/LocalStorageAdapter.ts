import type { W3CAnnotation, AnnotationStorageAdapter } from './types';
import { manifestsState } from '../../../state/manifests.svelte';

/**
 * LocalStorage-based annotation adapter.
 * Stores annotations in localStorage and injects them into manifestsState for display.
 */
export class LocalStorageAdapter implements AnnotationStorageAdapter {
    readonly id = 'localStorage';
    readonly name = 'Local Storage';

    private injectedCanvases = new Set<string>();

    private storageKey(manifestId: string, canvasId: string): string {
        return `triiiceratops:annotations:${encodeURIComponent(manifestId)}:${encodeURIComponent(canvasId)}`;
    }

    private canvasKey(manifestId: string, canvasId: string): string {
        return `${manifestId}::${canvasId}`;
    }

    async load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]> {
        const key = this.storageKey(manifestId, canvasId);
        const data = localStorage.getItem(key);
        const annotations: W3CAnnotation[] = data ? JSON.parse(data) : [];

        // Inject into manifestsState for display
        this.injectIntoManifestsState(manifestId, canvasId, annotations);

        return annotations;
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<void> {
        const annotations = await this.loadFromStorage(manifestId, canvasId);
        annotations.push(annotation);
        this.saveToStorage(manifestId, canvasId, annotations);
        this.injectIntoManifestsState(manifestId, canvasId, annotations);
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
            this.injectIntoManifestsState(manifestId, canvasId, annotations);
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
        this.injectIntoManifestsState(manifestId, canvasId, filtered);
    }

    destroy(): void {
        // Clear injected annotations from manifestsState
        for (const canvasKey of this.injectedCanvases) {
            const [manifestId, canvasId] = canvasKey.split('::');
            manifestsState.clearUserAnnotations(manifestId, canvasId);
        }
        this.injectedCanvases.clear();
    }

    private injectIntoManifestsState(
        manifestId: string,
        canvasId: string,
        annotations: W3CAnnotation[],
    ): void {
        const key = this.canvasKey(manifestId, canvasId);
        this.injectedCanvases.add(key);
        manifestsState.setUserAnnotations(manifestId, canvasId, annotations);
    }

    private async loadFromStorage(
        manifestId: string,
        canvasId: string,
    ): Promise<W3CAnnotation[]> {
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
