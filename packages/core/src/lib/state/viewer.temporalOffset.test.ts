import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import { parseContentState } from '../utils/contentState';

/**
 * Temporal offsets carried by navigation, against REAL manifest parsing: a
 * structure item's `#t=`, a manifest `start`, and a content-state target each
 * reach `ViewerState.temporalOffset` through the navigation that carried them.
 * Core carries the time; nothing here seeks.
 */

const CANVAS_1 = 'http://example.org/temporal/canvas/1';
const CANVAS_2 = 'http://example.org/temporal/canvas/2';

function canvas(canvasId: string, label: string) {
    return {
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
    };
}

function manifest(id: string, extra: Record<string, unknown> = {}) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Temporal offsets'] },
        items: [canvas(CANVAS_1, 'Part 1'), canvas(CANVAS_2, 'Part 2')],
        ...extra,
    };
}

const STRUCTURES = [
    {
        id: 'http://example.org/temporal/range/1',
        type: 'Range',
        label: { en: ['Atto Primo'] },
        items: [{ type: 'Canvas', id: `${CANVAS_1}#t=157,203` }],
    },
    {
        id: 'http://example.org/temporal/range/2',
        type: 'Range',
        label: { en: ['Atto Secondo'] },
        items: [{ type: 'Canvas', id: CANVAS_2 }],
    },
];

function encodeContentState(payload: unknown): string {
    return Buffer.from(JSON.stringify(payload), 'utf8')
        .toString('base64url')
        .replace(/=+$/g, '');
}

describe('ViewerState temporal offsets', () => {
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

    it('starts with no temporal offset', () => {
        expect(state.temporalOffset).toBeNull();
    });

    it('exposes the offset of a structure item navigated to', async () => {
        const id = 'http://example.org/temporal/manifest/structures';
        await load(id, manifest(id, { structures: STRUCTURES }));

        const [chapter] = state.structures;
        state.setCanvas(chapter.canvasIds[0], chapter.canvasTimes[0]);

        expect(state.canvasId).toBe(CANVAS_1);
        expect(state.temporalOffset).toEqual({
            canvasId: CANVAS_1,
            seconds: 157,
            endSeconds: 203,
        });
    });

    it('resets the offset when a plain navigation carries no time', async () => {
        const id = 'http://example.org/temporal/manifest/plain-nav';
        await load(id, manifest(id, { structures: STRUCTURES }));

        const [chapter, remainder] = state.structures;
        state.setCanvas(chapter.canvasIds[0], chapter.canvasTimes[0]);
        state.setCanvas(remainder.canvasIds[0], remainder.canvasTimes[0]);

        expect(state.canvasId).toBe(CANVAS_2);
        expect(state.temporalOffset).toBeNull();
    });

    it("exposes the offset of Cookbook 0015's SpecificResource `start`", async () => {
        const json = JSON.parse(
            readFileSync(
                join(
                    import.meta.dirname,
                    '../test/fixtures/manifests/av/0015-start.json',
                ),
                'utf8',
            ),
        );
        await load(json.id, json);

        const startCanvas =
            'https://iiif.io/api/cookbook/recipe/0015-start/canvas/segment1';
        expect(state.startCanvasId).toBe(startCanvas);
        expect(state.canvasId).toBe(startCanvas);
        expect(state.temporalOffset).toEqual({
            canvasId: startCanvas,
            seconds: 120.5,
        });
    });

    it('exposes the offset of a `start` spelled as a media fragment on the id', async () => {
        const id = 'http://example.org/temporal/manifest/start';
        await load(
            id,
            manifest(id, {
                start: { id: `${CANVAS_2}#t=120.5`, type: 'Canvas' },
            }),
        );

        expect(state.canvasId).toBe(CANVAS_2);
        expect(state.temporalOffset).toEqual({
            canvasId: CANVAS_2,
            seconds: 120.5,
        });
    });

    it('leaves the offset null when a manifest `start` carries no time', async () => {
        const id = 'http://example.org/temporal/manifest/start-no-time';
        await load(
            id,
            manifest(id, { start: { id: CANVAS_2, type: 'Canvas' } }),
        );

        expect(state.canvasId).toBe(CANVAS_2);
        expect(state.temporalOffset).toBeNull();
    });

    it('exposes the offset of a content state delivered to the viewer', async () => {
        const id = 'http://example.org/temporal/manifest/content-state';
        await load(id, manifest(id));

        const target = parseContentState(
            encodeContentState({
                id: 'annotation-1',
                type: 'Annotation',
                motivation: 'contentState',
                target: `${CANVAS_2}#t=42`,
                partOf: { id },
            }),
        );

        state.setCanvas(target!.canvasId!, target!.time);

        expect(state.temporalOffset).toEqual({
            canvasId: CANVAS_2,
            seconds: 42,
        });
    });

    it('carries a time and a region on the same target', async () => {
        const id = 'http://example.org/temporal/manifest/region-and-time';
        await load(id, manifest(id));

        const target = parseContentState(
            encodeContentState({
                id: 'annotation-2',
                type: 'Annotation',
                motivation: 'contentState',
                target: `${CANVAS_1}#xywh=10,20,30,40&t=9,12`,
                partOf: { id },
            }),
        );

        state.setInitialCanvasRegion(target!.region ?? null);
        state.setCanvas(target!.canvasId!, target!.time);

        expect(state.initialCanvasRegion).toEqual({
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });
        expect(state.temporalOffset).toEqual({
            canvasId: CANVAS_1,
            seconds: 9,
            endSeconds: 12,
        });
    });

    it('resets the offset when a sequence switch lands on the same canvas', async () => {
        const id = 'http://example.org/temporal/manifest/sequences';
        // v2 sequences are alternative orderings of the same canvases, so the
        // new sequence's first canvas is the one the stale offset names.
        await load(id, {
            '@context': 'http://iiif.io/api/presentation/2/context.json',
            '@id': id,
            '@type': 'sc:Manifest',
            label: 'Two orderings',
            sequences: [
                {
                    '@id': `${id}/sequence/1`,
                    '@type': 'sc:Sequence',
                    canvases: [
                        { '@id': CANVAS_1, '@type': 'sc:Canvas', label: 'One' },
                        { '@id': CANVAS_2, '@type': 'sc:Canvas', label: 'Two' },
                    ],
                },
                {
                    '@id': `${id}/sequence/2`,
                    '@type': 'sc:Sequence',
                    canvases: [
                        { '@id': CANVAS_1, '@type': 'sc:Canvas', label: 'One' },
                        { '@id': CANVAS_2, '@type': 'sc:Canvas', label: 'Two' },
                    ],
                },
            ],
        });

        state.setCanvas(CANVAS_1, { seconds: 157, endSeconds: 203 });
        expect(state.temporalOffset).not.toBeNull();

        state.setSequenceIndex(1);

        expect(state.canvasId).toBe(CANVAS_1);
        expect(state.temporalOffset).toBeNull();
    });
});
