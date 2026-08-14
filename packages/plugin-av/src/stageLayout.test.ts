/**
 * The stage layout's arithmetic: which lanes a canvas gets, where they sit in
 * its rect, and where along the timeline lane a tap falls.
 */

import { describe, expect, it } from 'vitest';

import {
    laneFraction,
    stageLanes,
    stageLayoutKind,
    TIMELINE_LANE_FRACTION,
} from './stageLayout';

const RECT = { left: 10, top: 20, width: 640, height: 400 };

describe('stage layout', () => {
    describe('which layout a canvas gets', () => {
        it('gives video the visual lane and no timeline lane', () => {
            expect(stageLayoutKind('video', false)).toBe('video');
            // Waveform data on a video canvas belongs in the scrubber (v1), so
            // an accompanying image does not buy a video canvas a strip.
            expect(stageLayoutKind('video', true)).toBe('video');
        });

        it('gives audio a timeline lane, and a visual one only with an image', () => {
            expect(stageLayoutKind('audio', false)).toBe('audio');
            expect(stageLayoutKind('audio', true)).toBe('audio-with-image');
        });
    });

    describe('rect to lane rects', () => {
        it('fills the rect with the visual lane for video', () => {
            expect(stageLanes(RECT, 'video')).toEqual({
                visual: RECT,
                timeline: null,
            });
        });

        it('fills the rect with the timeline lane for audio alone', () => {
            expect(stageLanes(RECT, 'audio')).toEqual({
                visual: null,
                timeline: RECT,
            });
        });

        it('stacks the image above a strip, with no gap and nothing spilling', () => {
            const { visual, timeline } = stageLanes(RECT, 'audio-with-image');

            expect(visual).toEqual({
                left: 10,
                top: 20,
                width: 640,
                height: 300,
            });
            expect(timeline).toEqual({
                left: 10,
                top: 320,
                width: 640,
                height: 100,
            });
            // The two lanes are exactly the rect: they abut, and together they
            // cover it.
            expect(visual!.top + visual!.height).toBe(timeline!.top);
            expect(timeline!.top + timeline!.height).toBe(
                RECT.top + RECT.height,
            );
            expect(timeline!.height / RECT.height).toBeCloseTo(
                TIMELINE_LANE_FRACTION,
                12,
            );
        });

        /*
            The split is by fraction, not by a pixel height. The rect is a
            projection of canvas space, so a strip fixed in pixels would be a
            different share of the canvas at every zoom — the stack would stop
            zooming coherently, which is the whole reason the lanes are in
            canvas space.
        */
        it('keeps the same share of the rect at any zoom', () => {
            const zoomed = { left: 0, top: 0, width: 1280, height: 800 };
            const lanes = stageLanes(zoomed, 'audio-with-image');

            expect(lanes.timeline!.height / zoomed.height).toBeCloseTo(
                TIMELINE_LANE_FRACTION,
                12,
            );
        });
    });

    describe('the timeline projection', () => {
        it('maps a position across the lane to a fraction of it', () => {
            expect(laneFraction(0, 400)).toBe(0);
            expect(laneFraction(100, 400)).toBe(0.25);
            expect(laneFraction(400, 400)).toBe(1);
        });

        // A pointer event's offset can land a hair outside the box it was
        // dispatched on; that is a tap on the end, not a seek past it.
        it('clamps a position outside the lane', () => {
            expect(laneFraction(-3, 400)).toBe(0);
            expect(laneFraction(407, 400)).toBe(1);
        });

        it('refuses a lane with no width and a position that is not a number', () => {
            expect(laneFraction(10, 0)).toBeNull();
            expect(laneFraction(Number.NaN, 400)).toBeNull();
        });
    });
});
