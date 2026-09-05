import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvPlacement } from '../sources';
import {
    buildSegmentMap,
    canvasTimeAt,
    positionAt,
    temporalWindow,
} from './segments';

/** One painting annotation, as `scanCanvasForAv` reports it. */
function placement(
    annotation: number,
    fragment: string,
    url = `body-${annotation}.mp4`,
): AvPlacement {
    return {
        annotation,
        fragment,
        alternatives: [
            { url, kind: 'video', format: 'video/mp4', paintsPicture: true },
        ],
        spatial: fragment.includes('xywh='),
    };
}

describe('temporalWindow', () => {
    it('reads the three spellings a media fragment allows', () => {
        expect(temporalWindow('t=0,2')).toEqual({ start: 0, end: 2 });
        expect(temporalWindow('t=3971.24')).toEqual({
            start: 3971.24,
            end: null,
        });
        expect(temporalWindow('t=,2')).toEqual({ start: 0, end: 2 });
        expect(temporalWindow('t=npt:10,20')).toEqual({ start: 10, end: 20 });
        expect(temporalWindow('xywh=0,0,10,10&t=1,2')).toEqual({
            start: 1,
            end: 2,
        });
    });

    it('reads nothing out of a fragment that carries no readable window', () => {
        expect(temporalWindow('')).toBeNull();
        expect(temporalWindow('xywh=0,0,10,10')).toBeNull();
        // A clock-time form this release does not read, rather than a guess.
        expect(temporalWindow('t=00:01:00')).toBeNull();
        expect(temporalWindow('t=5,5')).toBeNull();
        expect(temporalWindow('t=5,2')).toBeNull();
        expect(temporalWindow('t=-1,2')).toBeNull();
    });
});

describe('buildSegmentMap', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it('tiles an ordered canvas, and the last open window ends at the canvas', () => {
        // The vendored `0064-opera-one-canvas` shape, to the second.
        const map = buildSegmentMap(
            [placement(0, 't=0,3971.24'), placement(1, 't=3971.24')],
            7278.422,
        );

        expect(map.duration).toBe(7278.422);
        expect(
            map.segments.map((segment) => [segment.start, segment.end]),
        ).toEqual([
            [0, 3971.24],
            [3971.24, 7278.422],
        ]);
        expect(map.segments.map((segment) => segment.annotation)).toEqual([
            0, 1,
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('orders segments by their window, not by annotation order', () => {
        const map = buildSegmentMap(
            [placement(0, 't=2,4'), placement(1, 't=0,2')],
            4,
        );

        expect(map.segments.map((segment) => segment.annotation)).toEqual([
            1, 0,
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('keeps a gap as a gap, and says so once', () => {
        const map = buildSegmentMap(
            [placement(0, 't=0,2'), placement(1, 't=5,7')],
            7,
        );

        expect(
            map.segments.map((segment) => [segment.start, segment.end]),
        ).toEqual([
            [0, 2],
            [5, 7],
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('gap');
    });

    it('gives an overlap to the earlier body, and says so once', () => {
        const map = buildSegmentMap(
            [
                placement(0, 't=0,5'),
                placement(1, 't=3,8'),
                placement(2, 't=6,9'),
            ],
            9,
        );

        expect(
            map.segments.map((segment) => [segment.start, segment.end]),
        ).toEqual([
            [0, 5],
            [5, 8],
            [8, 9],
        ]);
        // One warning for the whole canvas, not one per overlapping pair.
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('overlapping');
    });

    it('drops a window an earlier body covers entirely', () => {
        const map = buildSegmentMap(
            [placement(0, 't=0,5'), placement(1, 't=1,4')],
            5,
        );

        expect(map.segments.map((segment) => segment.annotation)).toEqual([0]);
    });

    it('drops a fragment-less body on a composed canvas, with one warning', () => {
        const map = buildSegmentMap(
            [placement(0, ''), placement(1, 't=0,2'), placement(2, 't=2,4')],
            4,
        );

        expect(map.segments.map((segment) => segment.annotation)).toEqual([
            1, 2,
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('`t=` window');
    });

    /*
        The bound the lint allowlist states for this warning: at most one line
        per reason per map build. Three windowless bodies are three lines
        without a latch — and the allowlist entry's whole purpose is that the
        stated bound is true.
    */
    it('says it once however many bodies claim no window', () => {
        buildSegmentMap(
            [
                placement(0, ''),
                placement(1, ''),
                placement(2, ''),
                placement(3, 't=0,4'),
            ],
            4,
        );

        expect(warn).toHaveBeenCalledTimes(1);
    });

    /*
        A LEADING gap is a gap: an unpainted first five seconds is exactly what
        the curator who authored it wants told about.
    */
    it('reports a gap before the first window', () => {
        const map = buildSegmentMap([placement(0, 't=5,7')], 7);

        expect(
            map.segments.map((segment) => [segment.start, segment.end]),
        ).toEqual([[5, 7]]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('gap');
    });

    it('clamps a window authored past the end of the canvas', () => {
        const map = buildSegmentMap(
            [placement(0, 't=0,2'), placement(1, 't=2,90')],
            4,
        );

        expect(map.segments.at(-1)?.end).toBe(4);
    });

    it('takes its duration from the last window when the canvas declares none', () => {
        const map = buildSegmentMap(
            [placement(0, 't=0,2'), placement(1, 't=2,4')],
            null,
        );

        expect(map.duration).toBe(4);
    });

    it('is the identity mapping for a single body with no window at all', () => {
        // Not composed: one placement, so there is nothing for the window to
        // disambiguate and the whole canvas is the one segment.
        const map = buildSegmentMap([placement(0, '')], 7);

        expect(map.segments).toEqual([]);
        expect(map.duration).toBe(7);
    });
});

describe('canvas time ↔ (segment, offset)', () => {
    const map = buildSegmentMap(
        [placement(0, 't=0,2'), placement(1, 't=2,4')],
        4,
    );

    it('round-trips every position inside a window', () => {
        for (const time of [0, 0.5, 1.999, 2, 3, 3.999]) {
            const position = positionAt(map, time);
            expect(position).not.toBeNull();
            expect(canvasTimeAt(map, position!)).toBeCloseTo(time, 6);
        }
    });

    it('resolves a canvas time to the segment that plays it', () => {
        expect(positionAt(map, 0)).toEqual({ index: 0, offset: 0 });
        expect(positionAt(map, 1.5)).toEqual({ index: 0, offset: 1.5 });
        // The boundary belongs to the segment that STARTS there.
        expect(positionAt(map, 2)).toEqual({ index: 1, offset: 0 });
        expect(positionAt(map, 3.5)).toEqual({ index: 1, offset: 1.5 });
    });

    it('rests at the end of the last window past the end of the canvas', () => {
        expect(positionAt(map, 4)).toEqual({ index: 1, offset: 2 });
        expect(positionAt(map, 99)).toEqual({ index: 1, offset: 2 });
    });

    it('lands a seek into a gap at the next window’s start', () => {
        const gapped = buildSegmentMap(
            [placement(0, 't=0,2'), placement(1, 't=5,7')],
            7,
        );

        expect(positionAt(gapped, 3.5)).toEqual({ index: 1, offset: 0 });
        expect(canvasTimeAt(gapped, positionAt(gapped, 3.5)!)).toBe(5);
    });

    it('answers nothing for a map with no segments', () => {
        expect(positionAt(buildSegmentMap([], 4), 1)).toBeNull();
    });
});
