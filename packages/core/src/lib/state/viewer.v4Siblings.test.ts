import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import { toPlannerCanvas } from '../renderer/canvasDescriptors';
import { getPaintingAnnotations } from '../utils/iiifParsing';
import { isUnsupportedCanvasFor } from '../utils/paintingBodies';

/**
 * Each published v4 Cookbook recipe against its v3 sibling, through the real
 * `ViewerState` and manifest cache with no mocks. Asserted as a comparison, not
 * as bare numbers, so a v4 regression reads as a divergence from v3.
 */

const CORPUS_DIR = join(import.meta.dirname, '../test/fixtures/manifests');

function fixture(path: string): any {
    return JSON.parse(readFileSync(join(CORPUS_DIR, path), 'utf8'));
}

describe('v4 recipes through the viewer', () => {
    const registeredIds: string[] = [];

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    /** Enumeration, painting annotations, classification and descriptor geometry. */
    async function rows(path: string) {
        const json = fixture(path);
        const state = new ViewerState();
        registeredIds.push(json.id);
        await state.setManifestData(json.id, json);

        return state.canvases.map((canvas: unknown) => {
            const descriptor = toPlannerCanvas(canvas);
            return {
                paintingAnnotations: getPaintingAnnotations(canvas).length,
                unsupported: isUnsupportedCanvasFor(state, canvas),
                width: descriptor?.width,
                height: descriptor?.height,
                duration: descriptor?.duration,
                images: descriptor?.images.length,
            };
        });
    }

    it.each([
        ['v4/0001-mvm-image.json', 'cookbook/0001-mvm-image.json'],
        ['v4/0002-mvm-audio.json', 'av/0002-mvm-audio.json'],
        ['v4/0003-mvm-video.json', 'av/0003-mvm-video.json'],
        // Paints the same Video as 0003; its transcript is not a painting.
        ['v4/0253-using-transcript-file.json', 'av/0003-mvm-video.json'],
    ])('%s matches %s', async (v4, v3) => {
        const expected = await rows(v3);
        expect(expected).toHaveLength(1);
        expect(await rows(v4)).toEqual(expected);
    });

    it('keeps the v4 Scene as an unsized, unsupported, claimable canvas', async () => {
        expect(await rows('v4/0608-mvm-3d.json')).toEqual([
            {
                paintingAnnotations: 1,
                unsupported: true,
                width: null,
                height: null,
                duration: null,
                images: 0,
            },
        ]);
    });
});
