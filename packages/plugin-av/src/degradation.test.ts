/**
 * The degradation contract's arithmetic: what a canvas is told about, and how
 * often. The manifest-driven half lives in `activation.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    warnAboutDegradation,
    warnAboutUnloadableCaptionTrack,
    warnAboutUnloadableHlsChunk,
    warnAboutUnreadableWaveform,
} from './degradation';
import { PLUGIN_META } from './identity';
import type { AvCanvasScan } from './sources';

function scan(overrides: Partial<AvCanvasScan> = {}): AvCanvasScan {
    return {
        canvasId: 'canvas/1',
        width: 320,
        height: 180,
        duration: 2,
        placements: [
            {
                annotation: 0,
                fragment: 'xywh=0,0,160,90&t=0,1',
                alternatives: [
                    {
                        url: 'a.mp4',
                        kind: 'video',
                        format: 'video/mp4',
                        paintsPicture: true,
                    },
                ],
                spatial: true,
            },
            {
                annotation: 1,
                fragment: 't=1,2',
                alternatives: [
                    {
                        url: 'b.mp4',
                        kind: 'video',
                        format: 'video/mp4',
                        paintsPicture: true,
                    },
                ],
                spatial: false,
            },
        ],
        temporallyComposed: true,
        spatiallyTargeted: true,
        ...overrides,
    };
}

describe('warnAboutDegradation', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    function messages(): string[] {
        return warn.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    it('names the spatial placement it dropped', () => {
        warnAboutDegradation({ id: 'canvas/1' }, scan());

        expect(messages()).toHaveLength(1);
        expect(messages()[0]).toContain('canvas/1');
        expect(messages()[0]).toContain('spatial placement is unsupported');
    });

    /*
        Temporal composition is no longer a degradation: a composed canvas plays
        through as one work under the sequencer, so there is nothing to announce
        and a curator who reads the console must not be told otherwise.
    */
    it('says nothing about a temporally composed canvas', () => {
        warnAboutDegradation(
            { id: 'canvas/1' },
            scan({ spatiallyTargeted: false }),
        );

        expect(messages()).toEqual([]);
    });

    it('repeats the warning on a re-scan of the same canvas', () => {
        const canvas = { id: 'canvas/1' };

        warnAboutDegradation(canvas, scan());
        warnAboutDegradation(canvas, scan());

        expect(messages()).toHaveLength(1);
    });

    it('warns each canvas separately', () => {
        warnAboutDegradation({ id: 'canvas/1' }, scan());
        warnAboutDegradation({ id: 'canvas/2' }, scan());

        expect(messages()).toHaveLength(2);
    });

    it('says nothing about a canvas that rendered fully', () => {
        warnAboutDegradation(
            { id: 'canvas/1' },
            scan({ spatiallyTargeted: false, temporallyComposed: false }),
        );

        expect(messages()).toEqual([]);
    });

    describe('unreadable waveform data', () => {
        it('announces one broken publish once, however often it is linked', () => {
            warnAboutUnreadableWaveform('https://example.org/a/waveform.json');
            warnAboutUnreadableWaveform('https://example.org/a/waveform.json');
            warnAboutUnreadableWaveform('https://example.org/b/waveform.dat');

            const said = messages();
            expect(said).toHaveLength(2);
            expect(said[0]).toContain('a/waveform.json');
            expect(said[0]).toContain('audiowaveform');
        });
    });

    describe('an hls.js chunk that will not load', () => {
        it('names the packaging contract, once per page', () => {
            warnAboutUnloadableHlsChunk(new Error('404'));
            warnAboutUnloadableHlsChunk(new Error('404'));

            const said = messages();
            expect(said).toHaveLength(1);
            expect(said[0]).toContain('dist/iife.js');
        });
    });

    describe('a caption track that will not load', () => {
        it('names the CORS requirement, once per URL', () => {
            warnAboutUnloadableCaptionTrack('https://elsewhere.test/en.vtt');
            warnAboutUnloadableCaptionTrack('https://elsewhere.test/en.vtt');
            warnAboutUnloadableCaptionTrack('https://elsewhere.test/it.vtt');

            const said = messages();
            expect(said).toHaveLength(2);
            expect(said[0]).toContain('Access-Control-Allow-Origin');
        });
    });

    /*
        Every warning is one cause line ending in the same docs pointer, so what
        tells them apart is that line. Asserted over the whole contract rather
        than warning by warning: no line may repeat or contain another, and each
        must carry the pointer.
    */
    it('keeps every warning distinguishable, and each pointed at the docs', async () => {
        // A fresh module, because the once-per-page and once-per-URL guards of
        // the cases above have already been spent.
        vi.resetModules();
        const fresh = await import('./degradation');

        fresh.warnAboutDegradation({ id: 'canvas/1' }, scan());
        fresh.warnAboutCanvasRepeat({
            id: 'canvas/1',
            behavior: ['repeat'],
        });
        fresh.warnAboutUnreadableWaveform('https://distinct.test/peaks.json');
        fresh.warnAboutUnloadableCaptionTrack('https://distinct.test/en.vtt');
        fresh.warnAboutUnloadableHlsChunk(new Error('404'));

        const said = messages();
        expect(said).toHaveLength(5);
        for (const line of said) expect(line).toContain(PLUGIN_META.docs);
        expect(new Set(said).size).toBe(said.length);
        for (const one of said) {
            for (const other of said) {
                if (one === other) continue;
                expect(other).not.toContain(one);
            }
        }
    });
});
