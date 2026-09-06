import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import { getCanvasChoices } from '../utils/iiifParsing';
import {
    syntheticV2Choice,
    syntheticV2MultipleSequences,
} from '../test/fixtures/syntheticManifests';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';
import { getCanvasId } from '../utils/iiifIds';
import { getPaintingAnnotations } from '../utils/iiifParsing';
import {
    resolveAllCanvasImages,
    toImageSource,
} from '../utils/resolveCanvasImage';

/**
 * IIIF v2 painting annotations end-to-end, through the epic's one seam — a real
 * `ViewerState` loaded with raw manifest JSON, backed by the real manifest
 * cache, with no mocks and no hand-built canvases (`remove-manifesto` SPEC →
 * "The seam").
 *
 * The unit tests beside `getPaintingAnnotations`, `getThumbnailSrc` and
 * `resolveCanvasImage` pin each reader in isolation. This file pins the thing a
 * user would notice: that a v2 manifest handed to the viewer still produces an
 * image and a thumbnail for every canvas, and that a v2 `oa:Choice` canvas
 * offers its alternatives and switches between them.
 *
 * It exists because the failure it guards is silent. The two deep raw-JSON
 * fallback paths read only the v3 `body` spelling of a painting resource and
 * never the v2 `resource` one; the moment ticket 06 handed them raw v2
 * annotations, both would have rendered nothing at all, with nothing at
 * runtime reporting it. These tests are the only guard.
 */

describe('IIIF v2 painting annotations through the viewer', () => {
    const registeredIds: string[] = [];

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    async function load(id: string, json: any): Promise<ViewerState> {
        const state = new ViewerState();
        registeredIds.push(id);
        await state.setManifestData(id, json);
        return state;
    }

    it('resolves an image and a thumbnail for every canvas of a v2 manifest', async () => {
        const state = await load(
            syntheticV2MultipleSequences['@id'],
            syntheticV2MultipleSequences,
        );

        expect(state.canvases).toHaveLength(3);

        for (const canvas of state.canvases) {
            const canvasId = getCanvasId(canvas);

            expect(getPaintingAnnotations(canvas)).toHaveLength(1);
            expect(resolveAllCanvasImages(canvas).map(toImageSource)).toEqual([
                {
                    kind: 'service',
                    serviceId: `${canvasId}/image`,
                    profile: 'http://iiif.io/api/image/2/level2.json',
                },
            ]);
            expect(getThumbnailSrc(canvas)).toBe(
                `${canvasId}/image/full/200,/0/default.jpg`,
            );
        }
    });

    it('offers a v2 oa:Choice canvas its alternatives and honors the selection', async () => {
        const state = await load(syntheticV2Choice['@id'], syntheticV2Choice);

        const [choiceCanvas, plainCanvas] = state.canvases;
        const canvasId = getCanvasId(choiceCanvas);

        // `default` first, then `item[]` — the default is an alternative in its
        // own right, and offering only `item` would hide the image the
        // publisher chose to render.
        const choices = getCanvasChoices(choiceCanvas);
        expect(choices.map((choice: any) => choice['@id'])).toEqual([
            'http://example.org/synthetic/v2-choice/image/natural.jpg',
            'http://example.org/synthetic/v2-choice/image/x-ray.jpg',
            'http://example.org/synthetic/v2-choice/image/uv.jpg',
        ]);

        // A plain v2 canvas in the same manifest offers none, so "this canvas
        // has a Choice" is distinguishable from "this manifest has one".
        expect(getCanvasChoices(plainCanvas)).toEqual([]);

        const urlFor = (canvas: any) =>
            resolveAllCanvasImages(canvas, {
                getSelectedChoice: (id: string) => state.getSelectedChoice(id),
            }).map((resolved) => {
                const source = toImageSource(resolved);
                // Every alternative in this fixture is a plain image body, so a
                // service source here would itself be the regression.
                return source?.kind === 'static' ? source.url : null;
            });

        // Nothing selected: the v2 `default` renders.
        expect(urlFor(choiceCanvas)).toEqual([
            'http://example.org/synthetic/v2-choice/image/natural.jpg',
        ]);

        for (const choice of choices) {
            state.selectChoice(canvasId, choice['@id']);
            expect(urlFor(choiceCanvas)).toEqual([choice['@id']]);
        }
    });

    it('does not throw when a v2 canvas writes images as a bare object', async () => {
        // The spec's failure contract: every enumerator is total, because a
        // field the spec declares as an array turns up in real manifests as a
        // bare object. `manifesto.js`'s `getImages()` walked `images` with an
        // indexed loop, so this enumerated nothing at all.
        const id = 'http://example.org/v2-bare-images/manifest';
        const canvasId = 'http://example.org/v2-bare-images/canvas/1';
        const state = await load(id, {
            '@context': 'http://iiif.io/api/presentation/2/context.json',
            '@id': id,
            '@type': 'sc:Manifest',
            label: 'v2 images as a bare object',
            sequences: [
                {
                    '@id': `${id}/sequence/normal`,
                    '@type': 'sc:Sequence',
                    canvases: [
                        {
                            '@id': canvasId,
                            '@type': 'sc:Canvas',
                            label: 'Page 1',
                            height: 1000,
                            width: 800,
                            images: {
                                '@id': `${canvasId}/annotation`,
                                '@type': 'oa:Annotation',
                                motivation: 'sc:painting',
                                on: canvasId,
                                resource: {
                                    '@id': `${canvasId}/image.jpg`,
                                    '@type': 'dctypes:Image',
                                },
                            },
                        },
                    ],
                },
            ],
        });

        const [canvas] = state.canvases;

        expect(getPaintingAnnotations(canvas)).toHaveLength(1);
        expect(resolveAllCanvasImages(canvas).map(toImageSource)).toEqual([
            { kind: 'static', url: `${canvasId}/image.jpg` },
        ]);
    });
});
