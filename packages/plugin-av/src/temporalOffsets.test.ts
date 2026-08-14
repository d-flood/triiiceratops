/**
 * Temporal offsets and playlist behaviors: the two halves of "the manifest said
 * when", plus the decision `auto-advance` and `repeat` make between them.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    endOfTimelineAction,
    playlistBehaviors,
    readBehaviors,
} from './behaviors';
import { warnAboutCanvasRepeat } from './degradation';
import { createOffsetSeeker } from './temporalOffsets';

/** An element whose readiness the test controls. */
function media(readyState: number): HTMLMediaElement {
    const element = document.createElement('audio');
    Object.defineProperty(element, 'readyState', {
        configurable: true,
        get: () => readyState,
    });
    return element;
}

function seekerOver(
    elements: Record<string, HTMLMediaElement>,
    seek: (canvasId: string, seconds: number) => void,
) {
    return createOffsetSeeker({
        mediaFor: (canvasId) => elements[canvasId] ?? null,
        seek,
    });
}

describe('temporal offsets', () => {
    it('seeks straight away when the media already has its metadata', () => {
        const seek = vi.fn();
        const seeker = seekerOver({ 'canvas/1': media(1) }, seek);

        seeker.apply({ canvasId: 'canvas/1', seconds: 12 });

        expect(seek).toHaveBeenCalledWith('canvas/1', 12);
    });

    it('holds an offset for media that is not ready, and applies it at readiness', () => {
        const seek = vi.fn();
        const element = media(0);
        const seeker = seekerOver({ 'canvas/1': element }, seek);

        seeker.apply({ canvasId: 'canvas/1', seconds: 7 });
        expect(seek).not.toHaveBeenCalled();

        element.dispatchEvent(new Event('loadedmetadata'));

        expect(seek).toHaveBeenCalledExactlyOnceWith('canvas/1', 7);
    });

    it('replaces a held offset with a newer one rather than queueing behind it', () => {
        const seek = vi.fn();
        const element = media(0);
        const seeker = seekerOver({ 'canvas/1': element }, seek);

        seeker.apply({ canvasId: 'canvas/1', seconds: 7 });
        seeker.apply({ canvasId: 'canvas/1', seconds: 19 });
        element.dispatchEvent(new Event('loadedmetadata'));

        expect(seek).toHaveBeenCalledExactlyOnceWith('canvas/1', 19);
    });

    it('drops a held offset when a navigation carries no time', () => {
        const seek = vi.fn();
        const element = media(0);
        const seeker = seekerOver({ 'canvas/1': element }, seek);

        seeker.apply({ canvasId: 'canvas/1', seconds: 7 });
        seeker.apply(null);
        element.dispatchEvent(new Event('loadedmetadata'));

        expect(seek).not.toHaveBeenCalled();
    });

    it('ignores an offset for a canvas this plugin has no stage for', () => {
        const seek = vi.fn();
        const seeker = seekerOver({}, seek);

        seeker.apply({ canvasId: 'canvas/absent', seconds: 3 });

        expect(seek).not.toHaveBeenCalled();
    });

    it('stops holding when destroyed', () => {
        const seek = vi.fn();
        const element = media(0);
        const seeker = seekerOver({ 'canvas/1': element }, seek);

        seeker.apply({ canvasId: 'canvas/1', seconds: 7 });
        seeker.destroy();
        element.dispatchEvent(new Event('loadedmetadata'));

        expect(seek).not.toHaveBeenCalled();
    });
});

describe('playlist behaviors', () => {
    it('reads a single term and a list alike', () => {
        expect(readBehaviors({ behavior: 'auto-advance' })).toEqual([
            'auto-advance',
        ]);
        expect(readBehaviors({ behavior: ['auto-advance', 'repeat'] })).toEqual(
            ['auto-advance', 'repeat'],
        );
        expect(readBehaviors({})).toEqual([]);
        expect(readBehaviors(null)).toEqual([]);
    });

    it('advances to the next canvas under auto-advance', () => {
        const { autoAdvance, repeat } = playlistBehaviors({
            behavior: ['auto-advance'],
        });
        expect(endOfTimelineAction(autoAdvance, repeat, true)).toBe('advance');
        expect(endOfTimelineAction(autoAdvance, repeat, false)).toBe('stop');
    });

    it('returns to the first canvas when repeat accompanies auto-advance', () => {
        const { autoAdvance, repeat } = playlistBehaviors({
            behavior: ['auto-advance', 'repeat'],
        });
        expect(endOfTimelineAction(autoAdvance, repeat, false)).toBe('restart');
        // Not a loop of the canvas that ended: with somewhere to go, it goes.
        expect(endOfTimelineAction(autoAdvance, repeat, true)).toBe('advance');
    });

    it('is inert when repeat stands without auto-advance', () => {
        const { autoAdvance, repeat } = playlistBehaviors({
            behavior: ['repeat'],
        });
        expect(repeat).toBe(true);
        expect(endOfTimelineAction(autoAdvance, repeat, false)).toBe('stop');
        expect(endOfTimelineAction(autoAdvance, repeat, true)).toBe('stop');
    });

    it('ignores repeat on a Canvas, with one warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const canvas = { id: 'canvas/1', behavior: ['repeat'] };

        warnAboutCanvasRepeat(canvas);
        warnAboutCanvasRepeat(canvas);

        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0][0]).toContain('canvas/1');
        expect(warn.mock.calls[0][0]).toContain('`repeat`');

        // The canvas's own auto-advance is still honoured; only repeat is not.
        warnAboutCanvasRepeat({ id: 'canvas/2', behavior: ['auto-advance'] });
        expect(warn).toHaveBeenCalledOnce();

        warn.mockRestore();
    });
});
