/**
 * Canvas → **source provider** resolution, over raw IIIF canvas JSON.
 *
 * The fixtures are the vendored audiovisual Cookbook recipes wherever one says
 * the thing under test: real manifests are the only evidence that the shapes
 * this reads are the shapes curators publish. Synthetic canvases appear only for
 * shapes no vendored recipe carries.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanCanvasForAv } from './sources';

const AV_DIR = join(
    import.meta.dirname,
    '../../core/src/lib/test/fixtures/manifests/av',
);

function recipeCanvases(file: string): unknown[] {
    const manifest = JSON.parse(readFileSync(join(AV_DIR, file), 'utf8'));
    return manifest.items ?? [];
}

describe('scanCanvasForAv', () => {
    it('answers null for a canvas that paints no time-based body', () => {
        const canvas = {
            id: 'canvas/1',
            type: 'Canvas',
            width: 100,
            height: 100,
            items: [
                {
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: 'https://example.org/page.jpg',
                                type: 'Image',
                                format: 'image/jpeg',
                            },
                            target: 'canvas/1',
                        },
                    ],
                },
            ],
        };

        expect(scanCanvasForAv(canvas)).toBeNull();
    });

    it('resolves a single video body to one playable source', () => {
        const [canvas] = recipeCanvases('0003-mvm-video.json');

        const scan = scanCanvasForAv(canvas);

        expect(scan).not.toBeNull();
        expect(scan?.canvasId).toBe(
            'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas',
        );
        expect(scan?.width).toBe(480);
        expect(scan?.height).toBe(360);
        expect(scan?.placements).toHaveLength(1);
        expect(scan?.placements[0].alternatives[0]).toEqual({
            url: 'https://fixtures.iiif.io/video/indiana/lunchroom_manners/high/lunchroom_manners_1024kb.mp4',
            kind: 'video',
            format: 'video/mp4',
        });
        expect(scan?.temporallyComposed).toBe(false);
        expect(scan?.spatiallyTargeted).toBe(false);
    });

    it('classifies a Sound body with an audio format as audio', () => {
        const [canvas] = recipeCanvases('0002-mvm-audio.json');

        const scan = scanCanvasForAv(canvas);

        expect(scan?.placements[0].alternatives[0].kind).toBe('audio');
    });

    it('keeps a Sound body whose format says video on the video element', () => {
        // `0014-accompanyingcanvas` types its body `Sound` and formats it
        // `video/mp4`. A `<video>` plays a soundtrack; an `<audio>` cannot show
        // a picture, so the disagreement resolves towards video.
        const canvases = recipeCanvases('0014-accompanyingcanvas.json');
        const scans = canvases.map((canvas) => scanCanvasForAv(canvas));

        expect(scans[0]?.placements[0].alternatives[0].kind).toBe('video');
    });

    it('reports every alternative of a Choice, and is not composed by it', () => {
        const [canvas] = recipeCanvases('0434-choice-av.json');

        const scan = scanCanvasForAv(canvas);

        // One painting annotation, several formats to pick between: a Choice is
        // the reader's pick between equivalents, not a composition.
        expect(scan?.placements).toHaveLength(1);
        expect(scan?.temporallyComposed).toBe(false);
        // All of them, in manifest order. Which one plays is decided against
        // the browser, in `formats.ts`, and not by parsing.
        expect(
            scan?.placements[0].alternatives.map((source) => source.format),
        ).toEqual([
            'audio/alac',
            'audio/mpeg',
            'audio/flac',
            'audio/ogg',
            'audio/mpeg',
            'audio/wav',
        ]);
    });

    it('reports a canvas whose duration is tiled by several bodies as composed', () => {
        const [canvas] = recipeCanvases('0064-opera-one-canvas.json');

        const scan = scanCanvasForAv(canvas);

        expect(scan?.placements).toHaveLength(2);
        expect(scan?.temporallyComposed).toBe(true);
        // The interim contract: the first body is what plays.
        expect(scan?.placements[0].alternatives[0].url).toContain('vae0637');
    });

    it('reports a spatially targeted time-based body', () => {
        const [canvas] = recipeCanvases('0489-multimedia-canvas.json');

        const scan = scanCanvasForAv(canvas);

        expect(scan?.spatiallyTargeted).toBe(true);
    });

    it('reads a fragment target carried as a SpecificResource selector', () => {
        // No vendored recipe spells its target this way; IIIF permits it.
        const canvas = {
            id: 'canvas/1',
            type: 'Canvas',
            duration: 10,
            items: [
                {
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: 'https://example.org/clip.mp4',
                                type: 'Video',
                                format: 'video/mp4',
                            },
                            target: {
                                type: 'SpecificResource',
                                source: 'canvas/1',
                                selector: {
                                    type: 'FragmentSelector',
                                    value: 'xywh=0,0,10,10',
                                },
                            },
                        },
                    ],
                },
            ],
        };

        expect(scanCanvasForAv(canvas)?.spatiallyTargeted).toBe(true);
    });

    it('ignores a non-image body that is not time-based media', () => {
        // Core's classifier only answers "can core paint this", so "not an image"
        // includes transcripts, datasets and caption tracks. A body has to say it
        // is audio or video — by media type or by IIIF type — to become a source.
        const canvas = {
            id: 'canvas/1',
            type: 'Canvas',
            duration: 10,
            items: [
                {
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: 'https://example.org/captions.vtt',
                                type: 'Text',
                                format: 'text/vtt',
                            },
                            target: 'canvas/1',
                        },
                    ],
                },
            ],
        };

        expect(scanCanvasForAv(canvas)).toBeNull();
    });

    it('reads a streaming body whose format names no medium', () => {
        // `av-hls.json`: `application/vnd.apple.mpegurl` says nothing about the
        // medium, so the IIIF type is what makes it a video.
        const canvas = {
            id: 'canvas/1',
            type: 'Canvas',
            width: 320,
            height: 180,
            duration: 2,
            items: [
                {
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: '/media/hls/bars.m3u8',
                                type: 'Video',
                                format: 'application/vnd.apple.mpegurl',
                            },
                            target: 'canvas/1',
                        },
                    ],
                },
            ],
        };

        expect(scanCanvasForAv(canvas)?.placements[0].alternatives[0]).toEqual({
            url: '/media/hls/bars.m3u8',
            kind: 'video',
            format: 'application/vnd.apple.mpegurl',
        });
    });

    it('finds the video even when the caption track is authored first', () => {
        // `av-video.json` (and the spec's own `body: [Choice(videos), Text(vtt)]`)
        // carry the VTT in the painting body array. Nothing makes the video come
        // first, and a plugin that plays whatever is not an image would build
        // `<video src="…vtt">` and show "can't play" for a perfectly good clip.
        const [original] = recipeCanvases('0219-using-caption-file.json');
        const canvas = JSON.parse(JSON.stringify(original));
        const annotation = canvas.items[0].items[0];
        annotation.body = [
            {
                id: 'https://example.org/captions.vtt',
                type: 'Text',
                format: 'text/vtt',
            },
            annotation.body,
        ];

        const scan = scanCanvasForAv(canvas);

        expect(scan?.placements).toHaveLength(1);
        expect(scan?.placements[0].alternatives[0].kind).toBe('video');
        expect(scan?.placements[0].alternatives[0].url).toMatch(/\.mp4$/);
    });

    it('reports no dimensions for a duration-only canvas', () => {
        const [canvas] = recipeCanvases('0002-mvm-audio.json');

        const scan = scanCanvasForAv(canvas);

        expect(scan?.width).toBeNull();
        expect(scan?.height).toBeNull();
    });
});
