import { afterEach, describe, expect, it, vi } from 'vitest';

import { manifestsState } from './manifests.svelte';

/**
 * The in-flight guard on external annotation lists.
 *
 * A IIIF Canvas may point `annotations`/`otherContent` at a list that has to be
 * fetched, and the annotation surfaces now ask about every canvas the viewport
 * meets — so in continuous mode a scroll asks about each folio as it arrives, and
 * the same list can be asked for several times before the first response lands.
 */
describe('manifestsState.fetchAnnotationList', () => {
    const url = 'https://example.org/annotations/list-1';

    afterEach(() => {
        manifestsState.clearManifest(url);
        vi.restoreAllMocks();
    });

    it('makes ONE request when the same list is asked for repeatedly in flight', async () => {
        let resolve: (value: unknown) => void = () => {};
        const response = new Promise((r) => {
            resolve = r;
        });
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation((): any => response);

        const first = manifestsState.fetchAnnotationList(url);
        const second = manifestsState.fetchAnnotationList(url);
        const third = manifestsState.fetchAnnotationList(url);

        resolve({ ok: true, json: async () => ({ resources: [] }) });
        await Promise.all([first, second, third]);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(manifestsState.getManifestEntry(url)?.json).toEqual({
            resources: [],
        });
    });

    it('lets a failed list be asked for again', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('offline'));

        await manifestsState.fetchAnnotationList(url);
        await manifestsState.fetchAnnotationList(url);

        // A network blip must not mark the list permanently unavailable.
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
