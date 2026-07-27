// Packed conformance consumer: proves the adapter conformance API is consumable
// from the packed `@triiiceratops/plugin-annotation-editor/testing` subpath in a
// plain vitest project (no Svelte tooling, tarballs only). It drives the suite
// against a small in-fixture server-style adapter that mints canonical ids on
// create, exercising the id-reconciliation branch of the contract.
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';

class InMemoryServerAdapter {
    id = 'in-memory-server';
    name = 'In-Memory Server';
    #store = new Map();
    #counter = 0;

    #list(manifestId, canvasId) {
        const key = `${manifestId}::${canvasId}`;
        let list = this.#store.get(key);
        if (!list) {
            list = [];
            this.#store.set(key, list);
        }
        return list;
    }

    async load(manifestId, canvasId) {
        return this.#list(manifestId, canvasId).map((a) => structuredClone(a));
    }

    async create(manifestId, canvasId, annotation) {
        this.#counter += 1;
        const canonical = {
            ...structuredClone(annotation),
            id: `https://mock.server/anno/${this.#counter}`,
        };
        this.#list(manifestId, canvasId).push(canonical);
        return structuredClone(canonical);
    }

    async update(manifestId, canvasId, annotation) {
        const list = this.#list(manifestId, canvasId);
        const index = list.findIndex((a) => a.id === annotation.id);
        if (index >= 0) list[index] = structuredClone(annotation);
        return structuredClone(annotation);
    }

    async delete(manifestId, canvasId, annotationId) {
        const key = `${manifestId}::${canvasId}`;
        const list = this.#store.get(key);
        if (list) {
            this.#store.set(
                key,
                list.filter((a) => a.id !== annotationId),
            );
        }
    }
}

runAdapterContractTests(() => new InMemoryServerAdapter(), {
    supportsIdReconciliation: true,
    label: 'InMemoryServerAdapter (packed /testing)',
});
