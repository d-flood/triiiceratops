/**
 * Dereferencing a content state delivered as a bare manifest URI.
 *
 * The case these exist for: a manifest served at one URL and declaring another
 * as its `id`. It is legal, it is common in generated trees — `mkiiif` writes
 * `manifest.json` beside an `index.html` and gives the Manifest the directory's
 * URI — and it decides whether the document already in hand is handed to the
 * caller or fetched a second time under the declared id, which for that tree is
 * an HTML page and not a manifest at all.
 */

import { describe, expect, it, vi } from 'vitest';

import { manifestsState } from '../state/manifests.svelte';
import { resolveContentState } from './contentStateIngestion';

const FETCHED = 'https://docuver.se/iiif/p3tgsk8jqt/manifest.json';
const DECLARED = 'https://docuver.se/iiif/p3tgsk8jqt';

const report = () => {};

function servingManifest(json: unknown) {
    return vi
        .spyOn(manifestsState, 'fetchResource')
        .mockResolvedValue(json as never);
}

describe('resolveContentState, for a bare manifest URI', () => {
    it('hands back a manifest whose declared id differs from its URL', async () => {
        const json = { '@context': 'x', id: DECLARED, type: 'Manifest' };
        const fetchResource = servingManifest(json);

        const resolved = await resolveContentState(FETCHED, { report });

        expect(fetchResource).toHaveBeenCalledTimes(1);
        expect(resolved).toEqual({
            target: { manifestId: DECLARED },
            manifestJson: json,
        });
    });

    it('hands back a manifest whose declared id is its URL', async () => {
        const json = { id: FETCHED, type: 'Manifest' };
        servingManifest(json);

        expect(await resolveContentState(FETCHED, { report })).toEqual({
            target: { manifestId: FETCHED },
            manifestJson: json,
        });
    });

    it('does not hand back a Collection, which only the manifest path expands', async () => {
        servingManifest({ id: FETCHED, type: 'Collection' });

        expect(await resolveContentState(FETCHED, { report })).toEqual({
            target: { manifestId: FETCHED },
        });
    });

    it('does not hand back a Canvas, whose manifest is a different resource', async () => {
        servingManifest({
            id: `${DECLARED}/canvas/p1`,
            type: 'Canvas',
            partOf: [{ id: DECLARED, type: 'Manifest' }],
        });

        expect(await resolveContentState(FETCHED, { report })).toEqual({
            target: { manifestId: DECLARED, canvasId: `${DECLARED}/canvas/p1` },
        });
    });

    it('falls back to the URI it was given when the fetch fails', async () => {
        vi.spyOn(manifestsState, 'fetchResource').mockRejectedValue(
            new Error('nope'),
        );

        expect(await resolveContentState(FETCHED, { report })).toEqual({
            target: { manifestId: FETCHED },
        });
    });
});
