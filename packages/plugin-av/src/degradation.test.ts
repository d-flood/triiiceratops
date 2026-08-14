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
import type { AvCanvasScan } from './sources';

function scan(overrides: Partial<AvCanvasScan> = {}): AvCanvasScan {
    return {
        canvasId: 'canvas/1',
        width: 320,
        height: 180,
        duration: 2,
        placements: [
            {
                source: { url: 'a.mp4', kind: 'video', format: 'video/mp4' },
                temporal: true,
                spatial: true,
            },
            {
                source: { url: 'b.mp4', kind: 'video', format: 'video/mp4' },
                temporal: true,
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

    it('tells a canvas about BOTH degradations when it has both', () => {
        // A canvas can be spatially placed and temporally composed at once, and a
        // curator told only about the first would never learn the composition was
        // dropped too.
        warnAboutDegradation({ id: 'canvas/1' }, scan());

        expect(messages()).toHaveLength(2);
        expect(messages().join('\n')).toContain(
            'Spatial placement of audiovisual content is not supported',
        );
        expect(messages().join('\n')).toContain(
            '2 time-based bodies sharing its duration',
        );
    });

    it('repeats neither warning on a re-scan of the same canvas', () => {
        const canvas = { id: 'canvas/1' };

        warnAboutDegradation(canvas, scan());
        warnAboutDegradation(canvas, scan());

        expect(messages()).toHaveLength(2);
    });

    it('warns each canvas separately', () => {
        warnAboutDegradation(
            { id: 'canvas/1' },
            scan({ spatiallyTargeted: false }),
        );
        warnAboutDegradation(
            { id: 'canvas/2' },
            scan({ spatiallyTargeted: false }),
        );

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
            expect(said[0]).toContain('The timeline still seeks.');
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
});
