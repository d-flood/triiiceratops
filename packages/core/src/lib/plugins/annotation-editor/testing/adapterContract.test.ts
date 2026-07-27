import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
import type { W3CAnnotation } from '../adapters/types';
import type { AnnotationStorageAdapter } from '../types';
import { runAdapterContractTests } from './index';

/**
 * The reference minimal adapter: pure `localStorage` storage, always returns
 * full bodies (so `hydrate` is a trivial by-id lookup). Exercises the hydrate
 * capability of the conformance suite.
 */
runAdapterContractTests(() => new LocalStorageAdapter(), {
    supportsHydrate: true,
    label: 'LocalStorageAdapter',
});

/**
 * An in-memory server-style adapter that mints its own canonical IRI on create
 * and returns the reconciled annotation, exercising the id-reconciliation
 * capability of the conformance suite (F5). Kept here as a test fixture — it is
 * the smallest adapter that models a real annotation server.
 */
class InMemoryServerAdapter implements AnnotationStorageAdapter {
    readonly id = 'in-memory-server';
    readonly name = 'In-Memory Server';

    private store = new Map<string, W3CAnnotation[]>();
    private counter = 0;

    private key(manifestId: string, canvasId: string): string {
        return `${manifestId}::${canvasId}`;
    }

    private list(manifestId: string, canvasId: string): W3CAnnotation[] {
        const key = this.key(manifestId, canvasId);
        let list = this.store.get(key);
        if (!list) {
            list = [];
            this.store.set(key, list);
        }
        return list;
    }

    async load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]> {
        return this.list(manifestId, canvasId).map((a) => structuredClone(a));
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        this.counter += 1;
        const canonical: W3CAnnotation = {
            ...structuredClone(annotation),
            id: `https://mock.server/anno/${this.counter}`,
        };
        this.list(manifestId, canvasId).push(canonical);
        return structuredClone(canonical);
    }

    async update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const list = this.list(manifestId, canvasId);
        const index = list.findIndex((a) => a.id === annotation.id);
        if (index >= 0) {
            list[index] = structuredClone(annotation);
        }
        return structuredClone(annotation);
    }

    async delete(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<void> {
        const key = this.key(manifestId, canvasId);
        const list = this.store.get(key);
        if (list) {
            this.store.set(
                key,
                list.filter((a) => a.id !== annotationId),
            );
        }
    }
}

runAdapterContractTests(() => new InMemoryServerAdapter(), {
    supportsIdReconciliation: true,
    label: 'InMemoryServerAdapter',
});
