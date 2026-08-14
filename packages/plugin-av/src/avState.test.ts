/**
 * AVState's published contract: what a command does to the media, what a refused
 * command does to the host, and when a subscriber hears about a change.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    createAvState,
    type AvCommandTarget,
    type AvStatePort,
} from './avPlayback';
import { getAVState } from './avState';

/**
 * A media element with a writable `duration` and a `play()` a test can resolve
 * or reject. The DOM's own element exposes `duration` as a read-only getter and
 * decodes nothing under happy-dom, so the states worth asserting — a known
 * duration, an autoplay refusal — are unreachable through it.
 */
class FakeMedia extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = Number.NaN;
    muted = false;
    volume = 1;
    readyState = 0;
    /** What the next `play()` resolves — or rejects — with. */
    playResult: Promise<void> = Promise.resolve();

    play(): Promise<void> {
        return this.playResult.then(() => {
            this.paused = false;
            this.dispatchEvent(new Event('play'));
        });
    }

    pause(): void {
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
    }
}

function asMedia(fake: FakeMedia): HTMLMediaElement {
    return fake as unknown as HTMLMediaElement;
}

interface Refusal {
    readonly error: Error;
    readonly retry: () => void;
}

/** An AVState over one fake element, with the refusals it reported. */
function fixture(options: { target?: boolean } = {}) {
    const media = new FakeMedia();
    let target: AvCommandTarget | null =
        options.target === false
            ? null
            : {
                  canvasId: 'canvas/1',
                  media: asMedia(media),
                  canvasDuration: null,
              };
    const refusals: Refusal[] = [];

    const port: AvStatePort = {
        currentTarget: () => target,
        refuse: (error, retry) => refusals.push({ error, retry }),
    };

    const publication = createAvState(port);
    return {
        media,
        refusals,
        publication,
        state: publication.state,
        /** Move to a canvas this plugin has not claimed (or back). */
        setTarget(next: AvCommandTarget | null): void {
            target = next;
            publication.sync();
        },
    };
}

/** Let the batched notification microtask land. */
const flush = (): Promise<void> => Promise.resolve();

describe('AVState commands', () => {
    it('clamps a seek to [0, duration]', () => {
        const f = fixture();
        f.media.duration = 30;
        f.publication.sync();

        f.state.seek(12);
        expect(f.media.currentTime).toBe(12);

        f.state.seek(-5);
        expect(f.media.currentTime).toBe(0);

        f.state.seek(1_000);
        expect(f.media.currentTime).toBe(30);
    });

    // Before `loadedmetadata` there is no end to clamp against; a seek forward
    // must not be silently rewritten to 0.
    it('clamps only the floor while the duration is unknown', () => {
        const f = fixture();
        f.state.seek(9);
        expect(f.media.currentTime).toBe(9);
        expect(f.state.duration).toBeNull();
    });

    // Infinity is a position on the range, not garbage: "seek to the end" and
    // "full volume" are what it asks for. Only NaN, which sits nowhere on the
    // range at all, takes the floor.
    it('clamps a non-finite seek and volume to the nearer bound', () => {
        const f = fixture();
        f.media.duration = 30;
        f.publication.sync();

        f.state.seek(Number.POSITIVE_INFINITY);
        expect(f.media.currentTime).toBe(30);
        f.state.seek(Number.NEGATIVE_INFINITY);
        expect(f.media.currentTime).toBe(0);
        f.state.seek(Number.NaN);
        expect(f.media.currentTime).toBe(0);

        f.state.setVolume(Number.POSITIVE_INFINITY);
        expect(f.media.volume).toBe(1);
        f.state.setVolume(Number.NEGATIVE_INFINITY);
        expect(f.media.volume).toBe(0);
        f.state.setVolume(Number.NaN);
        expect(f.media.volume).toBe(0);
    });

    it('clamps volume to [0, 1] and sets muted', () => {
        const f = fixture();

        f.state.setVolume(2);
        expect(f.media.volume).toBe(1);
        f.state.setVolume(-1);
        expect(f.media.volume).toBe(0);
        f.state.setVolume(0.4);
        expect(f.media.volume).toBe(0.4);

        f.state.setMuted(true);
        expect(f.media.muted).toBe(true);
    });

    // The autoplay policy is a promise rejection, never a throw: a host that
    // called `play()` must see the refusal as state, not as an exception.
    it('resolves an autoplay rejection into state and throws nothing', async () => {
        const f = fixture();
        f.media.playResult = Promise.reject(new Error('NotAllowedError'));

        expect(() => f.state.play()).not.toThrow();

        await flush();
        await flush();
        expect(f.state.paused).toBe(true);
    });

    // Some elements throw from `play()` itself rather than rejecting. The
    // contract says "never throws toward the host", whichever way it fails.
    it('swallows a synchronous throw from play()', () => {
        const f = fixture();
        f.media.play = () => {
            throw new Error('InvalidStateError');
        };

        expect(() => f.state.play()).not.toThrow();
        expect(f.state.paused).toBe(true);
    });

    it('plays and pauses the current canvas’s media', async () => {
        const f = fixture();
        f.state.play();
        await flush();
        expect(f.media.paused).toBe(false);

        f.state.pause();
        expect(f.media.paused).toBe(true);
    });
});

describe('AVState on a canvas it has not claimed', () => {
    it('refuses every command through the command-phase error channel', () => {
        const f = fixture({ target: false });

        f.state.play();
        f.state.pause();
        f.state.seek(3);
        f.state.setMuted(true);
        f.state.setVolume(0.5);

        expect(f.refusals).toHaveLength(5);
        expect(f.refusals.map((r) => r.error.message)).toEqual([
            expect.stringContaining('play()'),
            expect.stringContaining('pause()'),
            expect.stringContaining('seek()'),
            expect.stringContaining('setMuted()'),
            expect.stringContaining('setVolume()'),
        ]);
        expect(f.state.activeMediaCanvasId).toBeNull();
    });

    // The report is actionable: retrying after navigating to an AV canvas is
    // what the host offers the reader.
    it('offers a retry that re-issues the command', () => {
        const f = fixture({ target: false });
        f.state.seek(4);

        const media = new FakeMedia();
        media.duration = 10;
        f.setTarget({
            canvasId: 'canvas/2',
            media: asMedia(media),
            canvasDuration: null,
        });

        f.refusals[0]!.retry();
        expect(media.currentTime).toBe(4);
    });
});

describe('AVState observable members', () => {
    it('wakes subscribers by the next flush when a member changes', async () => {
        const f = fixture();
        const woken = vi.fn();
        f.state.subscribe(woken);

        f.media.duration = 42;
        f.media.dispatchEvent(new Event('durationchange'));

        expect(
            woken,
            'notification is batched, never synchronous',
        ).not.toHaveBeenCalled();
        await flush();
        expect(woken).toHaveBeenCalledTimes(1);
        expect(f.state.duration).toBe(42);
    });

    it('batches a burst of media events into one notification', async () => {
        const f = fixture();
        const woken = vi.fn();
        f.state.subscribe(woken);

        f.media.duration = 5;
        f.media.dispatchEvent(new Event('durationchange'));
        f.media.paused = false;
        f.media.dispatchEvent(new Event('play'));

        await flush();
        expect(woken).toHaveBeenCalledTimes(1);
        expect(f.state.paused).toBe(false);
        expect(f.state.duration).toBe(5);
    });

    it('follows the current canvas through activeMediaCanvasId', async () => {
        const f = fixture();
        expect(f.state.activeMediaCanvasId).toBe('canvas/1');

        const woken = vi.fn();
        f.state.subscribe(woken);
        f.setTarget(null);

        await flush();
        expect(woken).toHaveBeenCalledTimes(1);
        expect(f.state.activeMediaCanvasId).toBeNull();
        expect(f.state.paused).toBe(true);
    });

    it('reports buffering only while a playing element has nothing to play', () => {
        const f = fixture();
        f.media.paused = false;
        f.media.readyState = 0;
        f.publication.sync();
        expect(f.state.buffering).toBe(true);

        f.media.readyState = 4;
        f.publication.sync();
        expect(f.state.buffering).toBe(false);
    });
});

describe('AVState query-only currentTime', () => {
    it('reads the playhead on demand rather than notifying', async () => {
        const f = fixture();
        const woken = vi.fn();
        f.state.subscribe(woken);

        f.media.currentTime = 7;
        expect(f.state.currentTime).toBe(7);

        await flush();
        expect(
            woken,
            'a moving playhead is not a state notification',
        ).not.toHaveBeenCalled();
    });

    it('ticks subscribeFrame on the media’s own timeupdate', () => {
        const f = fixture();
        const ticked = vi.fn();
        const stop = f.state.subscribeFrame(ticked);

        f.media.currentTime = 1;
        f.media.dispatchEvent(new Event('timeupdate'));
        expect(ticked).toHaveBeenCalledTimes(1);

        stop();
        f.media.dispatchEvent(new Event('timeupdate'));
        expect(ticked).toHaveBeenCalledTimes(1);
    });

    it('ticks subscribeFrame on a seek, without waiting for the element', () => {
        const f = fixture();
        const ticked = vi.fn();
        f.state.subscribeFrame(ticked);

        f.state.seek(2);
        expect(ticked).toHaveBeenCalled();
    });
});

describe('AVState lifecycle', () => {
    it('detaches from the media and drops its listeners on destroy', async () => {
        const f = fixture();
        const woken = vi.fn();
        f.state.subscribe(woken);

        f.publication.destroy();
        f.media.duration = 3;
        f.media.dispatchEvent(new Event('durationchange'));

        await flush();
        expect(woken).not.toHaveBeenCalled();
    });
});

describe('getAVState', () => {
    it('returns the state the viewer publishes under this plugin’s id', () => {
        const f = fixture();
        const seen: string[] = [];
        const viewerState = {
            getPluginState: (pluginId: string) => {
                seen.push(pluginId);
                return f.state;
            },
        };

        expect(getAVState(viewerState)).toBe(f.state);
        expect(seen).toEqual(['av']);
    });

    it('is null when the plugin is not active on this viewer', () => {
        expect(getAVState({ getPluginState: () => null })).toBeNull();
        // Something else published under the same id is not AVState either.
        expect(
            getAVState({ getPluginState: () => ({ open: true }) }),
        ).toBeNull();
    });
});
