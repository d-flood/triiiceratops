/**
 * The rendering-honesty rule: temporal zoom sharpens only to the data's own
 * resolution, and beyond it interpolates rather than inventing detail.
 *
 * Asserted against a recording context rather than against pixels, because what
 * is under test is the arithmetic that decides each column's extremes — jsdom
 * has no 2D context, and a real one would only let the same numbers be read back
 * more slowly.
 */

import { describe, expect, it } from 'vitest';

import type { Peaks } from './peaks';
import { drawWaveform, type WaveformView } from './render';

/**
 * One hundred points of quiet with a single loud one at the exact middle, and
 * arithmetic chosen so the clip is one second long and one point is one
 * hundredth of it. Every expectation below is stated in those terms.
 */
const LOUD_POINT = 50;
const QUIET = 1000;
const LOUD = 30_000;
const PEAKS: Peaks = (() => {
    const pairs = new Int16Array(200);
    for (let point = 0; point < 100; point += 1) {
        const level = point === LOUD_POINT ? LOUD : QUIET;
        pairs[point * 2] = -level;
        pairs[point * 2 + 1] = level;
    }
    return {
        pairs,
        sampleRate: 100,
        samplesPerPixel: 1,
        channels: 1,
        points: 100,
    };
})();

interface Column {
    x: number;
    top: number;
    height: number;
}

function record(
    view: Partial<WaveformView> & { width: number },
    peaks: Peaks = PEAKS,
): {
    columns: Column[];
    playheads: number[];
} {
    const columns: Column[] = [];
    const playheads: number[] = [];
    const ctx = {
        fillStyle: '',
        setTransform: () => {},
        clearRect: () => {},
        beginPath: () => {},
        fill: () => {},
        rect: (x: number, top: number, _w: number, height: number) =>
            void columns.push({ x, top, height }),
        fillRect: (x: number) => void playheads.push(x),
    } as unknown as CanvasRenderingContext2D;

    drawWaveform(ctx, peaks, {
        height: 100,
        scale: 1,
        startTime: 0,
        endTime: 1,
        duration: 1,
        playhead: null,
        waveColor: '#fff',
        playheadColor: '#000',
        ...view,
    });
    return { columns, playheads };
}

/**
 * One column's drawn envelope back in peaks units: `max - min` as a fraction of
 * 16-bit full scale. The surface is 100 tall, so half of it is 50.
 */
function amplitude(column: Column): number {
    return column.height / 50;
}

const FULL_SCALE_QUIET = (QUIET * 2) / 32_768;
const FULL_SCALE_LOUD = (LOUD * 2) / 32_768;

describe('waveform rendering', () => {
    it('aggregates the true extremes when a column covers many points', () => {
        // Two columns over a hundred points: the loud one falls in the second,
        // and aggregation must carry it there rather than average it away.
        const { columns } = record({ width: 2 });
        expect(columns).toHaveLength(2);
        expect(amplitude(columns[0])).toBeCloseTo(FULL_SCALE_QUIET, 3);
        expect(amplitude(columns[1])).toBeCloseTo(FULL_SCALE_LOUD, 3);
    });

    it('aggregates both extremes, not just the one the fixture is symmetric in', () => {
        // Four points, deliberately lopsided: the largest MAX is in the third
        // point and the largest MIN is in the fourth, so one column over all
        // four can only be right if both halves of the aggregation run.
        const pairs = new Int16Array([
            -1000, 1000, -1000, 1000, -1000, 20_000, -25_000, 1000,
        ]);
        const lopsided: Peaks = {
            pairs,
            sampleRate: 4,
            samplesPerPixel: 1,
            channels: 1,
            points: 4,
        };

        const { columns } = record({ width: 1 }, lopsided);

        expect(amplitude(columns[0])).toBeCloseTo(
            (20_000 + 25_000) / 32_768,
            3,
        );
    });

    it('sharpens as the drawn range narrows', () => {
        // The loud point is one hundredth of the recording. Drawn whole it owns
        // one column of a hundred; drawn over a tenth of the timeline at the
        // same surface width it owns proportionally more of them. That widening
        // share IS temporal zoom.
        const half = FULL_SCALE_LOUD / 2;
        const loudColumns = (columns: Column[]): number =>
            columns.filter((column) => amplitude(column) > half).length;

        const whole = record({ width: 100 });
        const zoomed = record({ width: 100, startTime: 0.45, endTime: 0.55 });

        expect(loudColumns(whole.columns)).toBe(1);
        expect(loudColumns(zoomed.columns)).toBeGreaterThan(5);
    });

    it('interpolates past the data resolution rather than fabricating detail', () => {
        // Forty columns over one point's worth of time: the reader has zoomed
        // forty times past what the file can resolve. The honest rendering is a
        // ramp from the loud point down to its quiet neighbour — never a
        // staircase of repeated source values, and never louder than the file.
        const { columns } = record({
            width: 40,
            startTime: 0.505,
            endTime: 0.515,
        });
        const heights = columns.map(amplitude);
        const distinct = new Set(heights.map((height) => height.toFixed(6)));

        expect(distinct.size).toBeGreaterThan(4);
        for (let i = 1; i < heights.length; i += 1) {
            expect(heights[i]).toBeLessThanOrEqual(heights[i - 1] + 1e-9);
        }
        expect(Math.max(...heights)).toBeLessThanOrEqual(
            FULL_SCALE_LOUD + 1e-9,
        );
    });

    it('puts a point’s own value at the middle of the span it covers', () => {
        // A hair-thin column centred on the loud point's MIDDLE. A point
        // summarizes a whole span, so that moment is the one place the
        // interpolation must return the point's value undiluted; anchoring the
        // ramp at the point's leading edge instead would return the average of
        // the loud point and its quiet neighbour here, and slide the whole
        // drawing half a point away from the playhead.
        const { columns } = record({
            width: 1,
            startTime: 0.5045,
            endTime: 0.5055,
        });

        expect(amplitude(columns[0])).toBeCloseTo(FULL_SCALE_LOUD, 3);
    });

    it('stretches the peaks onto the duration the caller works in', () => {
        // The fixture's own peaks duration is one second; a browser reporting
        // two (the LAME-padding disagreement, exaggerated) must move the loud
        // point to the middle of the drawing, not to a quarter of the way in.
        const { columns } = record({
            width: 100,
            startTime: 0,
            endTime: 2,
            duration: 2,
        });
        const loudest = columns.reduce((best, column) =>
            column.height > best.height ? column : best,
        );

        expect(loudest.x).toBe(50);
    });

    it('leaves columns past the end of the recording blank', () => {
        const { columns } = record({ width: 4, startTime: 0, endTime: 2 });
        expect(columns).toHaveLength(2);
    });

    it('draws the playhead inside the drawn range and nowhere else', () => {
        expect(record({ width: 100, playhead: 0.5 }).playheads).toEqual([50]);
        expect(record({ width: 100, playhead: 5 }).playheads).toEqual([]);
        expect(
            record({ width: 100, startTime: 0.5, endTime: 1, playhead: 0.1 })
                .playheads,
        ).toEqual([]);
    });

    it('draws nothing into a surface with no area or no time', () => {
        expect(record({ width: 0 }).columns).toHaveLength(0);
        expect(record({ width: 10, endTime: 0 }).columns).toHaveLength(0);
    });
});
