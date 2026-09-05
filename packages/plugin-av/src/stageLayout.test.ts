/**
 * The stage layout's arithmetic: which lanes a canvas gets, where they sit in
 * its rect, and where along the timeline lane a tap falls.
 */

import { describe, expect, it } from 'vitest';

import {
    laneFraction,
    stageClip,
    stageLanes,
    stageLayoutKind,
} from './stageLayout';

const RECT = { left: 10, top: 20, width: 640, height: 400 };

describe('stage layout', () => {
    describe('which layout a canvas gets', () => {
        it('gives video the visual lane and no timeline lane', () => {
            expect(stageLayoutKind(true, false)).toBe('video');
            // A canvas whose picture is the element keeps the rect whatever it
            // carries: the element covers it, so a companion painted behind it
            // would cost tiles at every zoom and show nobody anything. The
            // companion phase is set from this decision, so it is not asked for
            // either.
            expect(stageLayoutKind(true, true)).toBe('video');
        });

        it('yields the rect where core paints a companion, and keeps it otherwise', () => {
            expect(stageLayoutKind(false, false)).toBe('audio');
            expect(stageLayoutKind(false, true)).toBe('audio-with-image');
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

        /*
            The rect belongs to the renderer where core paints a companion. A
            lane of any height would sit above the renderer's canvas and hide
            part of the picture — and the quarter-rect timeline strip this
            layout used to get was the last piece of transport-era canvas real
            estate, now that the transport lives in the control bar.
        */
        it('leaves the whole rect to core where core paints a companion', () => {
            expect(stageLanes(RECT, 'audio-with-image')).toEqual({
                visual: null,
                timeline: null,
            });
        });
    });

    describe('clipping a projection to the container', () => {
        const VISIBLE = { width: 480, height: 600 };

        it('clips a rect that is already inside not at all', () => {
            const inside = { left: 10, top: 20, width: 100, height: 100 };

            expect(stageClip(inside, VISIBLE)).toEqual({
                hidden: false,
                clipPath: 'none',
            });
        });

        // The reader-facing case: a canvas fitted to the viewer's height
        // overhangs a narrower container on both sides, and an audio canvas's
        // lane fills its whole rect — so the overhang is a pointer target
        // sitting over whatever chrome is docked beside the container. The
        // insets are in the STAGE's coordinates, clockwise from the top.
        it('trims an overhang on every side', () => {
            expect(
                stageClip(
                    { left: -60, top: -10, width: 600, height: 620 },
                    VISIBLE,
                ),
            ).toEqual({
                hidden: false,
                clipPath: 'inset(10px 60px 10px 60px)',
            });
        });

        it('hides a rect entirely outside the container', () => {
            expect(
                stageClip(
                    { left: 500, top: 0, width: 100, height: 100 },
                    VISIBLE,
                ).hidden,
            ).toBe(true);
        });

        it('clips nothing against a container with no measured box', () => {
            expect(
                stageClip(
                    { left: -60, top: 0, width: 600, height: 600 },
                    { width: 0, height: 0 },
                ),
            ).toEqual({ hidden: false, clipPath: 'none' });
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
