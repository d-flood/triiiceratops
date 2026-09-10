/**
 * The ruler's arithmetic: which round interval graduates a window, what each
 * tick reads, and where the marks land.
 *
 * Asserted against a recording context rather than against pixels, for the
 * reason `render.test.ts` gives: jsdom has no 2D context, and what is
 * under test is the geometry rather than the rasterization.
 */

import { describe, expect, it } from 'vitest';

import { formatMediaTime } from '../transport';
import {
    chooseTickStep,
    drawRuler,
    formatTickLabel,
    type RulerView,
} from './ruler';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Label {
    text: string;
    x: number;
    align: CanvasTextAlign;
}

/** The height a lane needs before the ruler draws ticks and labels at all. */
const TALL = 200;

const VIEW: RulerView = {
    width: 1000,
    height: TALL,
    startTime: 0,
    endTime: 60,
    duration: 60,
    playhead: 0,
    fillColor: 'blue',
    inkColor: 'white',
    clock: formatMediaTime,
};

/**
 * The marks a view draws, split by what they are. The baseline, the ticks and
 * the playhead are all `fillRect`s and are told apart by their box: the
 * playhead spans the full height, the baseline the full width, and a tick is
 * one of the two tick lengths rising off the bottom.
 */
function record(overrides: Partial<RulerView> = {}): {
    fills: Rect[];
    labels: Label[];
    ticks: (length: number) => number[];
    playheads: number[];
} {
    const view = { ...VIEW, ...overrides };
    const fills: Rect[] = [];
    const labels: Label[] = [];
    let align: CanvasTextAlign = 'start';

    const ctx = {
        globalAlpha: 1,
        fillStyle: '',
        font: '',
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        get textAlign(): CanvasTextAlign {
            return align;
        },
        set textAlign(next: CanvasTextAlign) {
            align = next;
        },
        clearRect: () => {},
        fillRect: (x: number, y: number, width: number, height: number) => {
            fills.push({ x, y, width, height });
        },
        fillText: (text: string, x: number) => {
            labels.push({ text, x, align });
        },
        // A plausible monospace-ish measurement; only the edge anchoring reads it.
        measureText: (text: string) => ({ width: text.length * 6 }),
    } as unknown as CanvasRenderingContext2D;

    drawRuler(ctx, view);

    return {
        fills,
        labels,
        ticks: (length: number) =>
            fills
                .filter(
                    (rect) =>
                        rect.width === 1 &&
                        rect.height === length &&
                        rect.height !== view.height,
                )
                .map((rect) => rect.x),
        playheads: fills
            .filter((rect) => rect.width === 1 && rect.height === view.height)
            .map((rect) => rect.x),
    };
}

describe('chooseTickStep', () => {
    it('graduates a window at a round interval', () => {
        // A minute across a thousand pixels: seconds are far too dense for a
        // clock reading, ten of them is the shortest round interval that fits.
        expect(chooseTickStep(60, 1000)?.major).toBe(10);
    });

    it('leaves every labelled tick room for its reading', () => {
        for (const seconds of [3, 20, 60, 600, 3600, 7200]) {
            const step = chooseTickStep(seconds, 900)!;
            expect((step.major / seconds) * 900).toBeGreaterThanOrEqual(88);
        }
    });

    it('steps down the ladder as the reader zooms in', () => {
        const wide = chooseTickStep(3600, 1000)!.major;
        const closer = chooseTickStep(360, 1000)!.major;
        const closest = chooseTickStep(36, 1000)!.major;
        expect(wide).toBeGreaterThan(closer);
        expect(closer).toBeGreaterThan(closest);
    });

    it('subdivides at a round step too', () => {
        // The reason the subdivision is tabulated rather than divided out: a
        // quarter minute subdivides into fives, a minute into fifteens.
        expect(chooseTickStep(150, 1000)).toEqual({ major: 15, minor: 5 });
        expect(chooseTickStep(600, 1000)).toEqual({ major: 60, minor: 15 });
    });

    it('keeps a very long recording on whole hours', () => {
        // Past the ladder's last rung, which doubling reaches — never some
        // remainder of the recording's own length.
        const step = chooseTickStep(60 * 60 * 40, 1000)!;
        expect(step.major % 3600).toBe(0);
    });

    it('graduates nothing it cannot measure', () => {
        expect(chooseTickStep(0, 1000)).toBeNull();
        expect(chooseTickStep(60, 0)).toBeNull();
        expect(chooseTickStep(Number.POSITIVE_INFINITY, 1000)).toBeNull();
    });
});

describe('formatTickLabel', () => {
    it('reads as a clock at a second and above', () => {
        expect(formatTickLabel(75, 5, 300, formatMediaTime)).toBe('1:15');
        expect(formatTickLabel(3661, 900, 7200, formatMediaTime)).toBe(
            '1:01:01',
        );
    });

    it('takes the hour shape from the recording, not the tick', () => {
        // The same instant of a ninety-minute tape and of a four-minute one.
        expect(formatTickLabel(12, 5, 5400, formatMediaTime)).toBe('0:00:12');
        expect(formatTickLabel(12, 5, 240, formatMediaTime)).toBe('0:12');
    });

    it('reads to the interval below a second, so no two ticks agree', () => {
        expect(formatTickLabel(1.5, 0.5, 10, formatMediaTime)).toBe('0:01.5');
        expect(formatTickLabel(2.25, 0.25, 10, formatMediaTime)).toBe(
            '0:02.25',
        );
        expect(formatTickLabel(0.3, 0.1, 10, formatMediaTime)).toBe('0:00.3');
    });

    it('rounds once, so a tick left short by floating point still reads true', () => {
        expect(formatTickLabel(1.9999999, 0.5, 10, formatMediaTime)).toBe(
            '0:02.0',
        );
    });
});

describe('drawRuler', () => {
    it('strikes ticks on the recording, not on the edge of the window', () => {
        // The same recording panned by half a tick. Graduations that were
        // measured from the window's left edge would sit at the same pixels in
        // both, and the whole ruler would crawl under a panning reader.
        const at = (startTime: number) =>
            record({ startTime, endTime: startTime + 60 }).ticks(11);

        // A 60 s window over 1000 px graduates at 10 s, which is 167 px.
        expect(at(0)).toEqual([0, 167, 333, 500, 667, 833, 1000]);

        // Panned by a quarter of that interval, the first tick is still the
        // recording's own 10 s mark and has moved with the recording. An
        // edge-anchored ruler would put a tick back at zero.
        const panned = at(2.5);
        expect(panned).not.toContain(0);
        expect(panned[0]).toBe(Math.round((10 - 2.5) * (1000 / 60)));
    });

    it('fills only as far as the playhead', () => {
        const { fills } = record({ playhead: 15 });
        const span = fills.find((rect) => rect.x === 0 && rect.y === 0)!;
        expect(span.width).toBeCloseTo(250, 5);
        expect(span.height).toBe(TALL);
    });

    it('fills the whole window when the playhead is past its right edge', () => {
        const { fills } = record({ startTime: 10, endTime: 20, playhead: 45 });
        const span = fills.find((rect) => rect.x === 0 && rect.y === 0)!;
        expect(span.width).toBe(VIEW.width);
    });

    it('draws no playhead for a moment outside the window', () => {
        expect(
            record({ startTime: 10, endTime: 20, playhead: 45 }).playheads,
        ).toHaveLength(0);
        expect(
            record({ startTime: 10, endTime: 20, playhead: 15 }).playheads,
        ).toHaveLength(1);
    });

    it('anchors the first and last labels inside the surface', () => {
        const { labels } = record();
        expect(labels[0].align).toBe('left');
        expect(labels[labels.length - 1].align).toBe('right');
        expect(
            labels.slice(1, -1).every((label) => label.align === 'center'),
        ).toBe(true);
    });

    it('drops the labels, then the ticks, as the lane loses height', () => {
        expect(record({ height: 200 }).labels.length).toBeGreaterThan(0);

        const short = record({ height: 30 });
        expect(short.labels).toHaveLength(0);
        expect(short.ticks(11).length).toBeGreaterThan(0);

        // A sliver keeps what fits: the played span and the playhead.
        const sliver = record({ height: 12, playhead: 15 });
        expect(sliver.ticks(11)).toHaveLength(0);
        expect(sliver.playheads).toHaveLength(1);
        expect(sliver.fills.some((rect) => rect.x === 0 && rect.y === 0)).toBe(
            true,
        );
    });

    it('draws nothing over a window with no extent', () => {
        expect(record({ startTime: 5, endTime: 5 }).fills).toHaveLength(0);
        expect(record({ width: 0 }).fills).toHaveLength(0);
    });
});
