/**
 * Caption detection, over raw canvas JSON in the shapes real manifests use.
 */

import { describe, expect, it } from 'vitest';

import { captionTracksForCanvas } from './captions';

/** The `av-video.json` shape: the VTT rides in the painting body array. */
function canvasWithBodyArrayTrack(): unknown {
    return {
        id: 'canvas/bars',
        type: 'Canvas',
        items: [
            {
                type: 'AnnotationPage',
                items: [
                    {
                        type: 'Annotation',
                        motivation: 'painting',
                        target: 'canvas/bars',
                        body: [
                            {
                                id: '/media/bars.mp4',
                                type: 'Video',
                                format: 'video/mp4',
                            },
                            {
                                id: '/media/captions.vtt',
                                type: 'Text',
                                format: 'text/vtt',
                                language: 'en',
                                label: { en: ['Captions in English'] },
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

/** The cookbook 0219 shape: a canvas-level `supplementing` annotation. */
function canvasWithSupplementingTrack(body: unknown): unknown {
    return {
        id: 'canvas/bars',
        type: 'Canvas',
        items: [
            {
                type: 'AnnotationPage',
                items: [
                    {
                        type: 'Annotation',
                        motivation: 'painting',
                        target: 'canvas/bars',
                        body: {
                            id: '/media/bars.mp4',
                            type: 'Video',
                            format: 'video/mp4',
                        },
                    },
                ],
            },
        ],
        annotations: [
            {
                type: 'AnnotationPage',
                items: [
                    {
                        type: 'Annotation',
                        motivation: 'supplementing',
                        target: 'canvas/bars',
                        body,
                    },
                ],
            },
        ],
    };
}

describe('captions — detection', () => {
    it('reads a text/vtt item out of the painting annotation body array', () => {
        expect(captionTracksForCanvas(canvasWithBodyArrayTrack())).toEqual([
            {
                url: '/media/captions.vtt',
                language: 'en',
                label: 'Captions in English',
            },
        ]);
    });

    it('reads a canvas-level supplementing annotation', () => {
        const canvas = canvasWithSupplementingTrack({
            id: '/media/captions.vtt',
            type: 'Text',
            format: 'text/vtt',
            language: 'en',
            label: { en: ['Captions in WebVTT format'] },
        });

        expect(captionTracksForCanvas(canvas)).toEqual([
            {
                url: '/media/captions.vtt',
                language: 'en',
                label: 'Captions in WebVTT format',
            },
        ]);
    });

    it('reads every alternative of a Choice of supplementing tracks', () => {
        // Cookbook 0074's shape: one track per language, and each label is
        // authored in the language it describes.
        const canvas = canvasWithSupplementingTrack({
            type: 'Choice',
            items: [
                {
                    id: '/media/captions.vtt',
                    type: 'Text',
                    format: 'text/vtt',
                    language: 'en',
                    label: { en: ['Captions in WebVTT format'] },
                },
                {
                    id: '/media/captions-it.vtt',
                    type: 'Text',
                    format: 'text/vtt',
                    language: 'it',
                    label: { it: ['Sottotitoli in formato WebVTT'] },
                },
            ],
        });

        expect(
            captionTracksForCanvas(canvas).map((track) => track.url),
        ).toEqual(['/media/captions.vtt', '/media/captions-it.vtt']);
        expect(captionTracksForCanvas(canvas)[1].label).toBe(
            'Sottotitoli in formato WebVTT',
        );
    });

    it('names the same file once however many shapes carry it', () => {
        const canvas = canvasWithBodyArrayTrack() as Record<string, unknown>;
        canvas.annotations = [
            {
                type: 'AnnotationPage',
                items: [
                    {
                        type: 'Annotation',
                        motivation: 'supplementing',
                        body: {
                            id: '/media/captions.vtt',
                            type: 'Text',
                            format: 'text/vtt',
                        },
                    },
                ],
            },
        ];

        expect(captionTracksForCanvas(canvas)).toHaveLength(1);
    });

    it('ignores non-VTT supplementing bodies and every other motivation', () => {
        const transcript = canvasWithSupplementingTrack({
            id: '/media/transcript.html',
            type: 'Text',
            format: 'text/html',
        });
        expect(captionTracksForCanvas(transcript)).toEqual([]);

        const commented = canvasWithSupplementingTrack({
            id: '/media/captions.vtt',
            type: 'Text',
            format: 'text/vtt',
        }) as Record<string, unknown>;
        const pages = commented.annotations as {
            items: { motivation: string }[];
        }[];
        pages[0].items[0].motivation = 'commenting';
        expect(captionTracksForCanvas(commented)).toEqual([]);
    });

    it('carries a track that declares no language or label', () => {
        const canvas = canvasWithSupplementingTrack({
            id: '/media/captions.vtt',
            type: 'Text',
            format: 'text/vtt',
        });

        expect(captionTracksForCanvas(canvas)).toEqual([
            { url: '/media/captions.vtt', language: null, label: null },
        ]);
    });

    it('answers nothing for a canvas with no captions at all', () => {
        expect(captionTracksForCanvas(null)).toEqual([]);
        expect(
            captionTracksForCanvas({ id: 'canvas/plain', type: 'Canvas' }),
        ).toEqual([]);
    });
});
