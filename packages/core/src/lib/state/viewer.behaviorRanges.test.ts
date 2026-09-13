/**
 * **Cookbook 0229, as the recipe publishes it.**
 *
 * The recipe's own manifest, through the seam a host loads one by. 0229 asks
 * for thumbnail scrubbing and NOT for a table of contents — the spec tells
 * clients not to render a `thumbnail-nav` range as one — so the whole manifest
 * contributes no TOC entries, and its thumbnails arrive as keyframes instead.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { thumbnailNavKeyframes } from '../utils/structures';
import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';

const FIXTURE = join(
    import.meta.dirname,
    '../test/fixtures/manifests/av/0229-behavior-ranges.json',
);

const CANVAS_ID =
    'https://iiif.io/api/cookbook/recipe/0229-behavior-ranges/canvas/1';

describe('cookbook 0229 range behaviors', () => {
    let state: ViewerState;
    let manifestId: string;

    beforeEach(async () => {
        const json = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        // The fixture's own id carries a trailing space, as vendored.
        manifestId = String(json.id).trim();
        state = new ViewerState();
        await state.setManifestData(manifestId, json);
    });

    afterEach(() => {
        manifestsState.clearManifest(manifestId);
    });

    it('generates no table of contents from a thumbnail-nav range', () => {
        expect(state.nonSequenceStructures).toEqual([]);
    });

    it('offers every thumbnailed chapter as a keyframe, in time order', () => {
        const frames = thumbnailNavKeyframes(state.structures, CANVAS_ID);

        // Ten of the eleven children: the no-nav title card carries no
        // thumbnail, and asks not to be navigated to in any case.
        expect(frames).toHaveLength(10);
        expect(frames.map((frame) => frame.seconds)).toEqual([
            9, 305, 610, 915, 1220, 1525, 1830, 2135, 2440, 2745,
        ]);
        for (const frame of frames) {
            expect(frame.src).toMatch(/^https:\/\//);
        }
    });

    it('leaves the parsed structures themselves complete', () => {
        // `structures` is the manifest as authored; the filtering is the
        // navigation surface's, so a consumer reading ranges still sees all 11.
        expect(state.structures[0].children).toHaveLength(11);
    });
});
