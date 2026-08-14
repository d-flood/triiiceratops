/**
 * The media-backed implementation of {@link AVState}: one published state over
 * whichever media element the current canvas's stage holds.
 *
 * Kept out of `avState.ts` so the module a host's `getAVState` import reaches
 * carries the CONTRACT and nothing else — the port, the factory and their types
 * are this package's business, and a d.ts rollup publishes every declaration in
 * a reachable module.
 */

import type { AVState } from './avState';

/** Below this `readyState` a playing element has nothing to play (spec name: `HAVE_FUTURE_DATA`). */
const HAVE_FUTURE_DATA = 3;

/** The media AVState's commands currently address. */
export interface AvCommandTarget {
    readonly canvasId: string;
    readonly media: HTMLMediaElement;
    /**
     * The canvas's own declared duration, or `null` when it declares none. The
     * canvas timeline is what AVState publishes, and the manifest states its
     * length before any media has loaded — without this, `duration` is `null`
     * from mount until `loadedmetadata`, and everything drawing a scrubber has
     * no range for that window.
     */
    readonly canvasDuration: number | null;
}

/** What AVState needs of the activation around it. */
export interface AvStatePort {
    /**
     * The current canvas's media, or `null` when the current canvas is not one
     * this plugin claimed. Resolved LIVE at every command and every sync rather
     * than cached, so a command issued in the same tick as a canvas change
     * addresses the canvas the caller just selected.
     */
    currentTarget(): AvCommandTarget | null;
    /**
     * Refuse a command through the plugin error channel's `command` phase — the
     * documented answer to "play the video on a canvas that has none".
     */
    refuse(error: Error, retry: () => void): void;
}

/** A published AVState plus the activation-facing handles it must not expose. */
export interface AvStatePublication {
    readonly state: AVState;
    /**
     * Re-resolve the target and republish the observable members. Call it
     * whenever the current canvas or the set of staged canvases may have moved;
     * media events drive it from the inside.
     */
    sync(): void;
    destroy(): void;
}

function clamp(value: number, min: number, max: number): number {
    // NaN sits nowhere on the range, so it takes the floor. The infinities do
    // sit on it: `Math.min`/`Math.max` land them on the ceiling and the floor
    // respectively, which is what a caller asking to seek to the end means.
    if (Number.isNaN(value)) return min;
    return Math.min(Math.max(value, min), max);
}

/**
 * The canvas timeline's length: the element's own duration once it has one,
 * and the canvas's declared duration until then.
 *
 * The element leads because it is what playback and seeking are actually bound
 * to under this release's identity mapping — a manifest that rounds its
 * `duration` must not make `seek(duration)` unreachable or overshoot the end.
 * The manifest fills the window before `loadedmetadata`, where the element
 * reports `NaN`.
 */
function durationOf(target: AvCommandTarget | null): number | null {
    if (!target) return null;
    if (Number.isFinite(target.media.duration)) return target.media.duration;
    return target.canvasDuration;
}

/**
 * Media events that can move an observable member. Those in
 * {@link FRAME_EVENTS} additionally drive the finer cadence, which is what a
 * host scrubber follows.
 */
const MEDIA_EVENTS = [
    'play',
    'pause',
    'ended',
    'playing',
    'waiting',
    'stalled',
    'canplay',
    'durationchange',
    'loadedmetadata',
    'emptied',
    'error',
    'volumechange',
    'seeked',
    'timeupdate',
] as const;

/**
 * The events that also fire the finer cadence. `pause` and `ended` are in the
 * set because the rAF loop stops with playback: without a closing tick a host
 * scrubber would rest wherever the last `timeupdate` left it, up to a quarter
 * second behind the position the media actually stopped at.
 */
const FRAME_EVENTS = new Set<string>([
    'timeupdate',
    'seeked',
    'pause',
    'ended',
]);

export function createAvState(port: AvStatePort): AvStatePublication {
    const listeners = new Set<() => void>();
    const frameListeners = new Set<() => void>();

    let attached: HTMLMediaElement | null = null;
    let paused = true;
    let duration: number | null = null;
    let buffering = false;
    let activeMediaCanvasId: string | null = null;

    let notifyQueued = false;
    let frameHandle: number | null = null;
    let destroyed = false;

    function notify(): void {
        // Batched and payload-free, exactly as ViewerState's own notification
        // is: a burst of media events costs subscribers one wake-up.
        if (notifyQueued || listeners.size === 0) return;
        notifyQueued = true;
        queueMicrotask(() => {
            notifyQueued = false;
            if (destroyed) return;
            for (const listener of [...listeners]) listener();
        });
    }

    function notifyFrame(): void {
        for (const listener of [...frameListeners]) listener();
    }

    function tickFrames(): void {
        frameHandle = null;
        notifyFrame();
        scheduleFrames();
    }

    /**
     * Keep the finer cadence running while something is playing and someone is
     * listening. `timeupdate` alone fires about four times a second, which reads
     * as a stuttering playhead; the loop stops the moment playback does, so an
     * idle viewer runs none of it.
     */
    function scheduleFrames(): void {
        if (destroyed || frameHandle !== null) return;
        if (frameListeners.size === 0) return;
        if (!attached || attached.paused) return;
        if (typeof requestAnimationFrame !== 'function') return;
        frameHandle = requestAnimationFrame(tickFrames);
    }

    function onMediaEvent(event: Event): void {
        if (FRAME_EVENTS.has(event.type)) notifyFrame();
        sync();
    }

    function attach(media: HTMLMediaElement | null): void {
        if (media === attached) return;
        for (const type of MEDIA_EVENTS)
            attached?.removeEventListener(type, onMediaEvent);
        attached = media;
        for (const type of MEDIA_EVENTS)
            attached?.addEventListener(type, onMediaEvent);
    }

    function sync(): void {
        if (destroyed) return;
        const target = port.currentTarget();
        attach(target?.media ?? null);

        const nextPaused = target ? target.media.paused : true;
        const nextDuration = durationOf(target);
        // Derived from the element rather than latched off `waiting`/`playing`:
        // a stall is "meant to be playing, has nothing to play", and the element
        // answers that at any moment.
        const nextBuffering = target
            ? !target.media.paused && target.media.readyState < HAVE_FUTURE_DATA
            : false;
        const nextActive = target?.canvasId ?? null;

        const changed =
            nextPaused !== paused ||
            nextDuration !== duration ||
            nextBuffering !== buffering ||
            nextActive !== activeMediaCanvasId;

        paused = nextPaused;
        duration = nextDuration;
        buffering = nextBuffering;
        activeMediaCanvasId = nextActive;

        if (changed) notify();
        scheduleFrames();
    }

    /**
     * Run `perform` against the current canvas's media, or refuse the command.
     * `retry` re-issues the command itself, so a host that recovers (navigating
     * to an AV canvas) can act on the report.
     */
    function command(
        name: string,
        perform: (media: HTMLMediaElement, target: AvCommandTarget) => void,
        retry: () => void,
    ): void {
        const target = port.currentTarget();
        if (!target) {
            port.refuse(
                new Error(
                    `[triiiceratops] plugin-av: ${name}() refused — the current canvas plays no time-based media this plugin has claimed.`,
                ),
                retry,
            );
            return;
        }
        perform(target.media, target);
        sync();
    }

    const state: AVState = {
        stateInventory: {
            play: 'command',
            pause: 'command',
            seek: 'command',
            setMuted: 'command',
            setVolume: 'command',
            paused: 'observable',
            duration: 'observable',
            buffering: 'observable',
            activeMediaCanvasId: 'observable',
            currentTime: 'queryOnly',
        },

        play(): void {
            command(
                'play',
                (media) => {
                    // An autoplay policy rejects with a promise, but a detached
                    // or unsupported element can throw synchronously. Either
                    // way the element stays paused, `paused` stays true, and the
                    // host sees a state — not an exception it must catch.
                    try {
                        void Promise.resolve(media.play()).catch(() => sync());
                    } catch {
                        sync();
                    }
                },
                () => state.play(),
            );
        },

        pause(): void {
            command(
                'pause',
                (media) => media.pause(),
                () => state.pause(),
            );
        },

        seek(seconds: number): void {
            command(
                'seek',
                (media, target) => {
                    const end = durationOf(target);
                    const position = clamp(
                        seconds,
                        0,
                        end ?? Number.POSITIVE_INFINITY,
                    );
                    // `currentTime` is a restricted double: assigning a
                    // non-finite value throws. That is reachable when the
                    // element has reported no duration, so there is no ceiling
                    // to bring `seek(Infinity)` back down to.
                    if (!Number.isFinite(position)) return;
                    media.currentTime = position;
                    // The playhead moved without waiting for `seeked`, which
                    // some elements defer until data arrives.
                    notifyFrame();
                },
                () => state.seek(seconds),
            );
        },

        setMuted(muted: boolean): void {
            command(
                'setMuted',
                (media) => {
                    media.muted = muted;
                },
                () => state.setMuted(muted),
            );
        },

        setVolume(volume: number): void {
            command(
                'setVolume',
                (media) => {
                    media.volume = clamp(volume, 0, 1);
                },
                () => state.setVolume(volume),
            );
        },

        get paused(): boolean {
            return paused;
        },
        get duration(): number | null {
            return duration;
        },
        get buffering(): boolean {
            return buffering;
        },
        get activeMediaCanvasId(): string | null {
            return activeMediaCanvasId;
        },
        get currentTime(): number {
            const target = port.currentTarget();
            return target ? target.media.currentTime : 0;
        },

        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        subscribeFrame(listener: () => void): () => void {
            frameListeners.add(listener);
            scheduleFrames();
            return () => frameListeners.delete(listener);
        },
    };

    sync();

    return {
        state,
        sync,
        destroy(): void {
            destroyed = true;
            attach(null);
            if (
                frameHandle !== null &&
                typeof cancelAnimationFrame === 'function'
            )
                cancelAnimationFrame(frameHandle);
            frameHandle = null;
            listeners.clear();
            frameListeners.clear();
        },
    };
}
