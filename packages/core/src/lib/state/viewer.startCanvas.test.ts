import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';

/**
 * Start-canvas honouring against REAL manifesto parsing (no mocked manifest
 * state), so the v2 (`sequences[].startCanvas`) and v3 (`start`) spellings are
 * both exercised the way a consumer's manifest hits the viewer.
 */

const V2_CANVAS_1 = 'http://example.org/v2/canvas/1';
const V2_CANVAS_2 = 'http://example.org/v2/canvas/2';
const V2_CANVAS_3 = 'http://example.org/v2/canvas/3';

function v2Canvas(id: string, label: string) {
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label,
        height: 1000,
        width: 800,
        images: [
            {
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                resource: {
                    '@id': `${id}/image`,
                    '@type': 'dctypes:Image',
                },
                on: id,
            },
        ],
    };
}

function manifestV2(startCanvas: unknown, id: string) {
    const sequence: Record<string, unknown> = {
        '@id': `${id}/sequence/normal`,
        '@type': 'sc:Sequence',
        canvases: [
            v2Canvas(V2_CANVAS_1, 'Page 1'),
            v2Canvas(V2_CANVAS_2, 'Page 2'),
            v2Canvas(V2_CANVAS_3, 'Page 3'),
        ],
    };
    if (startCanvas !== undefined) {
        sequence.startCanvas = startCanvas;
    }
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'Test Manifest v2 with startCanvas',
        sequences: [sequence],
    };
}

const V3_CANVAS_1 = 'http://example.org/v3/canvas/1';
const V3_CANVAS_2 = 'http://example.org/v3/canvas/2';

function manifestV3(id: string) {
    const canvas = (canvasId: string, label: string) => ({
        id: canvasId,
        type: 'Canvas',
        label: { en: [label] },
        height: 1000,
        width: 800,
        items: [
            {
                id: `${canvasId}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `${canvasId}/image`,
                            type: 'Image',
                            format: 'image/jpeg',
                        },
                        target: canvasId,
                    },
                ],
            },
        ],
    });

    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Test Manifest v3 with start'] },
        start: { id: V3_CANVAS_2, type: 'Canvas' },
        items: [canvas(V3_CANVAS_1, 'Page 1'), canvas(V3_CANVAS_2, 'Page 2')],
    };
}

describe('ViewerState start canvas', () => {
    let state: ViewerState;
    const registeredIds: string[] = [];

    beforeEach(() => {
        state = new ViewerState();
    });

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    async function load(manifestId: string, json: unknown) {
        registeredIds.push(manifestId);
        await state.setManifestData(manifestId, json);
    }

    it('honors the IIIF v3 `start` property', async () => {
        const id = 'http://example.org/v3/manifest/start';
        await load(id, manifestV3(id));

        expect(state.startCanvasId).toBe(V3_CANVAS_2);
        expect(state.canvasId).toBe(V3_CANVAS_2);
    });

    it('honors an IIIF v2 sequence `startCanvas` given as a string', async () => {
        const id = 'http://example.org/v2/manifest/start-string';
        await load(id, manifestV2(V2_CANVAS_2, id));

        expect(state.startCanvasId).toBe(V2_CANVAS_2);
        expect(state.canvasId).toBe(V2_CANVAS_2);
    });

    it('honors an IIIF v2 sequence `startCanvas` given as an object', async () => {
        const id = 'http://example.org/v2/manifest/start-object';
        await load(
            id,
            manifestV2({ '@id': V2_CANVAS_3, '@type': 'sc:Canvas' }, id),
        );

        expect(state.startCanvasId).toBe(V2_CANVAS_3);
        expect(state.canvasId).toBe(V2_CANVAS_3);
    });

    it('falls back to the first canvas when a v2 manifest has no startCanvas', async () => {
        const id = 'http://example.org/v2/manifest/no-start';
        await load(id, manifestV2(undefined, id));

        expect(state.startCanvasId).toBeNull();
        expect(state.canvasId).toBe(V2_CANVAS_1);
    });

    it('ignores a v2 startCanvas that is not in the sequence', async () => {
        const id = 'http://example.org/v2/manifest/bogus-start';
        await load(id, manifestV2('http://example.org/v2/canvas/missing', id));

        expect(state.startCanvasId).toBeNull();
        expect(state.canvasId).toBe(V2_CANVAS_1);
    });
});
