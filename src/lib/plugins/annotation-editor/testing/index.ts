import { beforeEach, describe, expect, it } from 'vitest';

import type { AnnotationStorageAdapter } from '../types';
import type { W3CAnnotation } from '../adapters/types';

/**
 * Adapter authoring kit — a reusable conformance suite so adapter authors can
 * verify their implementation against the contract the plugin relies on (ticket
 * 10, F28 / SPEC §2.6).
 *
 * An adapter is pure storage: the plugin owns display sync, caching, id
 * bookkeeping, timestamp/attribution stamping, and error handling. This suite
 * therefore checks only storage behavior — load/create/update/delete round-trips,
 * verbatim body preservation (including structured/unknown shapes), key isolation,
 * and the two opt-in capabilities (server-assigned ids and hydrate).
 *
 * @example
 * ```ts
 * import { runAdapterContractTests } from 'triiiceratops/plugins/annotation-editor/testing';
 * import { MyAdapter } from './MyAdapter';
 *
 * runAdapterContractTests(() => new MyAdapter(), {
 *   supportsIdReconciliation: true,
 *   supportsHydrate: true,
 * });
 * ```
 */
export interface AdapterContractOptions {
    /**
     * The adapter mints its own canonical id on `create` and returns it (as an
     * annotation or an id string). When set, the suite asserts `create` returns a
     * non-void value and that the returned id is honored by subsequent
     * `update`/`delete` (F5).
     */
    supportsIdReconciliation?: boolean;
    /**
     * The adapter implements `hydrate`. When set, the suite asserts `hydrate`
     * exists, returns the full annotation for a known id, and returns `null` for
     * an unknown id.
     */
    supportsHydrate?: boolean;
    /** Overrides the `describe` block label. */
    label?: string;
}

/** Internal bookkeeping markers the plugin reads once, then strips (F7). */
function strip(annotation: W3CAnnotation): W3CAnnotation {
    const clone = { ...annotation } as Record<string, unknown>;
    delete clone.__fullBodyLoaded;
    delete clone.__bodyPreview;
    return clone as unknown as W3CAnnotation;
}

/** Resolve the canonical id an adapter assigned on create (F5). */
function canonicalIdFrom(
    returned: W3CAnnotation | string | void,
    fallbackId: string,
): string {
    if (typeof returned === 'string') return returned;
    if (returned && typeof returned === 'object') return returned.id;
    return fallbackId;
}

function sampleAnnotation(
    id: string,
    canvasId: string,
    body?: W3CAnnotation['body'],
): W3CAnnotation {
    return {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        id,
        type: 'Annotation',
        motivation: 'commenting',
        body: body ?? [
            { type: 'TextualBody', purpose: 'commenting', value: 'hello' },
        ],
        target: {
            type: 'SpecificResource',
            source: canvasId,
            selector: {
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 'xywh=10,20,30,40',
            },
        },
    };
}

/**
 * Register the adapter conformance suite for `factory()`. Call at the top level
 * of a vitest test file; `factory` is invoked fresh before each test so a
 * stateful adapter starts clean, and every test uses a unique manifest/canvas
 * pair so tests can't bleed into each other (important for storage-backed
 * adapters like `LocalStorageAdapter`).
 */
export function runAdapterContractTests(
    factory: () => AnnotationStorageAdapter,
    options: AdapterContractOptions = {},
): void {
    const { supportsIdReconciliation, supportsHydrate, label } = options;

    describe(label ?? 'AnnotationStorageAdapter contract', () => {
        let adapter: AnnotationStorageAdapter;
        let manifestId: string;
        let canvasId: string;
        let counter = 0;

        beforeEach(() => {
            adapter = factory();
            counter += 1;
            manifestId = `contract-manifest-${counter}`;
            canvasId = `contract-canvas-${counter}`;
        });

        /**
         * Persist `created`, then read the stored annotation back the way the
         * plugin does: load the canvas, find the entry, and — if the adapter
         * returned a skeleton (`__fullBodyLoaded === false`) — hydrate it for the
         * full body. Returns the resolved annotation and its canonical id.
         */
        async function createAndResolve(
            created: W3CAnnotation,
        ): Promise<{ id: string; resolved: W3CAnnotation | null }> {
            const returned = await adapter.create(
                manifestId,
                canvasId,
                structuredClone(created),
            );
            const id = canonicalIdFrom(returned, created.id);

            const loaded = await adapter.load(manifestId, canvasId);
            const entry = loaded.find((a) => a.id === id) ?? null;
            if (!entry) return { id, resolved: null };

            if (entry.__fullBodyLoaded === false) {
                // A skeleton is only legal if the adapter can hydrate it.
                expect(typeof adapter.hydrate).toBe('function');
                const full = await adapter.hydrate!(manifestId, canvasId, id);
                return { id, resolved: full };
            }
            return { id, resolved: entry };
        }

        it('load returns an empty array for a canvas with no annotations', async () => {
            const loaded = await adapter.load(manifestId, canvasId);
            expect(Array.isArray(loaded)).toBe(true);
            expect(loaded).toHaveLength(0);
        });

        it('create then load round-trips the annotation verbatim', async () => {
            const created = sampleAnnotation('anno-1', canvasId);
            const { id, resolved } = await createAndResolve(created);

            expect(resolved).not.toBeNull();
            expect(strip(resolved as W3CAnnotation)).toEqual({ ...created, id });
        });

        it('create preserves structured / unknown body shapes verbatim', async () => {
            const structuredBody = {
                type: 'Dataset',
                purpose: 'linking',
                value: {
                    nested: { deep: [1, 2, 3], flag: true },
                    ref: 'https://example.org/entity/42',
                },
                extra: null,
            } as unknown as W3CAnnotation['body'];
            const created = sampleAnnotation('anno-structured', canvasId, structuredBody);

            const { resolved } = await createAndResolve(created);

            expect(resolved).not.toBeNull();
            expect((resolved as W3CAnnotation).body).toEqual(structuredBody);
        });

        it('update replaces a stored annotation body', async () => {
            const created = sampleAnnotation('anno-2', canvasId);
            const { id } = await createAndResolve(created);

            const updated: W3CAnnotation = {
                ...created,
                id,
                body: [
                    { type: 'TextualBody', purpose: 'commenting', value: 'edited' },
                ],
            };
            await adapter.update(manifestId, canvasId, structuredClone(updated));

            const loaded = await adapter.load(manifestId, canvasId);
            const entry = loaded.find((a) => a.id === id);
            expect(entry).toBeDefined();
            const full =
                entry?.__fullBodyLoaded === false
                    ? await adapter.hydrate!(manifestId, canvasId, id)
                    : entry;
            expect(strip(full as W3CAnnotation).body).toEqual(updated.body);
        });

        it('delete removes a stored annotation', async () => {
            const created = sampleAnnotation('anno-3', canvasId);
            const { id } = await createAndResolve(created);

            await adapter.delete(manifestId, canvasId, id);

            const loaded = await adapter.load(manifestId, canvasId);
            expect(loaded.find((a) => a.id === id)).toBeUndefined();
        });

        it('isolates annotations by manifest and canvas', async () => {
            const created = sampleAnnotation('anno-iso', canvasId);
            const { id } = await createAndResolve(created);

            const otherCanvas = `${canvasId}-other`;
            const otherManifest = `${manifestId}-other`;

            expect(await adapter.load(manifestId, otherCanvas)).toHaveLength(0);
            expect(await adapter.load(otherManifest, canvasId)).toHaveLength(0);

            const sameKey = await adapter.load(manifestId, canvasId);
            expect(sameKey.find((a) => a.id === id)).toBeDefined();
        });

        if (supportsIdReconciliation) {
            it('returns a server-assigned id honored by update and delete', async () => {
                const created = sampleAnnotation('local-temp-id', canvasId);
                const returned = await adapter.create(
                    manifestId,
                    canvasId,
                    structuredClone(created),
                );

                // Reconciling adapters must return the canonical id/annotation,
                // never void.
                expect(returned == null).toBe(false);
                const canonicalId = canonicalIdFrom(returned, created.id);
                expect(typeof canonicalId).toBe('string');

                // Update under the canonical id takes effect.
                const updated: W3CAnnotation = {
                    ...created,
                    id: canonicalId,
                    body: [
                        {
                            type: 'TextualBody',
                            purpose: 'commenting',
                            value: 'reconciled-edit',
                        },
                    ],
                };
                await adapter.update(
                    manifestId,
                    canvasId,
                    structuredClone(updated),
                );

                let loaded = await adapter.load(manifestId, canvasId);
                const entry = loaded.find((a) => a.id === canonicalId);
                expect(entry).toBeDefined();
                const full =
                    entry?.__fullBodyLoaded === false
                        ? await adapter.hydrate!(manifestId, canvasId, canonicalId)
                        : entry;
                expect(strip(full as W3CAnnotation).body).toEqual(updated.body);

                // Delete under the canonical id removes it.
                await adapter.delete(manifestId, canvasId, canonicalId);
                loaded = await adapter.load(manifestId, canvasId);
                expect(loaded.find((a) => a.id === canonicalId)).toBeUndefined();
            });
        }

        if (supportsHydrate) {
            it('exposes a hydrate method', () => {
                expect(typeof adapter.hydrate).toBe('function');
            });

            it('hydrate returns the full annotation for a known id', async () => {
                const created = sampleAnnotation('anno-hydrate', canvasId);
                const { id } = await createAndResolve(created);

                const full = await adapter.hydrate!(manifestId, canvasId, id);
                expect(full).not.toBeNull();
                expect(strip(full as W3CAnnotation).body).toEqual(created.body);
            });

            it('hydrate returns null for an unknown id', async () => {
                const full = await adapter.hydrate!(
                    manifestId,
                    canvasId,
                    'no-such-annotation',
                );
                expect(full).toBeNull();
            });
        }
    });
}
