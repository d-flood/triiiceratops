/**
 * The **transport chrome** this plugin registers: the view model core reads on
 * its own cadence, the command port every control goes through, and the
 * activation-wide audio preferences behind the volume and mute values.
 *
 * There is no DOM here and no component. Core owns the controls, their layout
 * and their keyboard behaviour (CONTEXT.md **Transport chrome**); this module
 * owns the facts they render, which are AVState's plus the handful of things
 * beside it that are not playback state — the buffered ranges, the waveform
 * strip, and which text tracks actually loaded.
 *
 * Times crossing to core are FRACTIONS of the canvas timeline, never seconds:
 * core knows no clock. `seek` converts back at this boundary, and the seek-step
 * policy stays here, on the view.
 */

import type { AVState } from './avState';
import type { CaptionTrack } from './captions';
import {
    type BufferedSpan,
    bufferedSpans,
    captionOptions,
    elementSpans,
    formatMediaTime,
    fractionToTime,
    SEEK_STEP_LARGE,
    SEEK_STEP_SMALL,
    timeFraction,
    type TimeSpan,
    volumeIsSettable,
} from './transport';

/** Every string the transport shows or announces, in the active locale. */
export interface TransportLabels {
    readonly transport: string;
    readonly play: string;
    readonly pause: string;
    readonly seek: string;
    readonly mute: string;
    readonly unmute: string;
    readonly volume: string;
    readonly elapsed: string;
    readonly duration: string;
    readonly captions: string;
    readonly captionsOff: string;
    /** The generic name for a track that declares neither label nor language. */
    readonly captionsTrack: string;
}

/**
 * The view model, in this plugin's own vocabulary.
 *
 * Structurally core's `TransportChromeView` with two differences that are this
 * side's business: captions are named captions rather than "alternative text
 * tracks", and the labels are this plugin's catalog keys. {@link Transport.view}
 * is where the two meet.
 */
export interface TransportView {
    /** A current canvas this activation has claimed. `false` renders nothing. */
    present: boolean;
    paused: boolean;
    duration: number | null;
    currentTime: number;
    /** `currentTime` as `0..1` of the duration — the scrubber's own coordinate. */
    fraction: number;
    buffered: BufferedSpan[];
    muted: boolean;
    volume: number;
    /** False where programmatic volume is read-only (iOS): the slider hides. */
    volumeSettable: boolean;
    /**
     * The scrubber's `aria-valuetext`: the playhead as a localized clock
     * reading, because "127" is not a position a listener can place. It lives
     * on the view model rather than being formatted by the render site so that
     * a locale change re-announces it even on a paused canvas, where no clock
     * tick would otherwise recompute it.
     */
    position: string;
    /**
     * The whole recording drawn once as a picture, for the scrubber's static
     * strip, or `null` when this canvas links no waveform data. It is how
     * waveform data reaches a video canvas, which gets no timeline lane in v1.
     */
    peaksStrip: string | null;
    /** Only tracks that LOADED, so a control over them can never be inert. */
    captionOptions: { id: string; label: string }[];
    /** The showing track's id, or `null` for off. */
    activeCaption: string | null;
    labels: TransportLabels;
}

/**
 * Volume and mute as the reader last set them, for as long as the plugin is
 * active on this viewer.
 *
 * Per activation rather than per canvas: a reader who turned the sound down on
 * track one meant the recording, not that canvas, so every stage this
 * activation builds opens at these values.
 */
export interface AudioPrefs {
    readonly volume: number;
    readonly muted: boolean;
    set(volume: number, muted: boolean): void;
    /** Bring an element — newly built, or newly addressed — to the remembered settings. */
    applyTo(media: HTMLMediaElement): void;
}

export function createAudioPrefs(): AudioPrefs {
    let volume = $state(1);
    let muted = $state(false);

    return {
        get volume(): number {
            return volume;
        },
        get muted(): boolean {
            return muted;
        },
        set(nextVolume: number, nextMuted: boolean): void {
            volume = Math.min(Math.max(nextVolume, 0), 1);
            muted = nextMuted;
        },
        applyTo(media: HTMLMediaElement): void {
            media.volume = volume;
            media.muted = muted;
        },
    };
}

export interface TransportOptions {
    readonly avState: AVState;
    /**
     * The element AVState currently addresses, or `null`. Read for `buffered`
     * and for the one-off volume-settability probe, and for nothing else: what
     * a network has fetched is not playback state and has no AVState member,
     * and inventing one for a progress bar would put a fact hosts cannot act on
     * into a command contract.
     */
    currentMedia(): HTMLMediaElement | null;
    /**
     * That element's buffered ranges as CANVAS-time spans, so they land where
     * they belong on a scrubber that spans the whole canvas. Omitted wherever
     * the canvas timeline is the element's own clock, which is
     * {@link elementSpans}.
     */
    bufferedSpans?(ranges: TimeRanges | null | undefined): readonly TimeSpan[];
    readonly prefs: AudioPrefs;
    labels(): TransportLabels;
    /** The current canvas's scrubber strip as a data URL, or `null`. */
    peaksStrip(): string | null;
    /**
     * The current canvas's loaded caption tracks and the showing one. Read off
     * the stage rather than off AVState: which text track is rendering is a
     * property of one element's own display, not published playback state, and
     * inventing an AVState member for it would put a fact hosts have no reason
     * to command into the command contract.
     */
    captions(): { tracks: readonly CaptionTrack[]; active: string | null };
    /** Show one caption track on the current canvas, or `null` for off. */
    setCaptionTrack(id: string | null): void;
    t(key: string, params?: Record<string, string | number>): string;
}

/** The playback commands core's controls reach. Everything is an AVState command. */
export interface TransportPort {
    toggle(): void;
    /** Seek to a fraction `0..1` of the canvas timeline. */
    seek(fraction: number): void;
    setMuted(muted: boolean): void;
    setVolume(volume: number): void;
    setTrack(id: string | null): void;
}

export interface Transport {
    /**
     * The chrome as core reads it. Shaped to core's `TransportChromeView` —
     * kept structural rather than typed against the import so this module's own
     * tests need no core.
     */
    view(): {
        present: boolean;
        paused: boolean;
        duration: number | null;
        currentTime: number;
        fraction: number;
        buffered: readonly { start: number; end: number }[];
        muted: boolean;
        volume: number;
        volumeSettable: boolean;
        positionText: string;
        elapsedText: string;
        durationText: string;
        strip: string | null;
        tracks: readonly { id: string; label: string }[];
        activeTrack: string | null;
        stepSmall: number;
        stepLarge: number;
        labels: {
            transport: string;
            play: string;
            pause: string;
            elapsed: string;
            seek: string;
            duration: string;
            mute: string;
            unmute: string;
            volume: string;
            tracks: string;
            tracksOff: string;
        };
    };
    readonly port: TransportPort;
    /** Core's re-read cadence: AVState's two, handed over. Returns an unsubscribe. */
    subscribe(onChange: () => void): () => void;
    /**
     * Re-read the view model now. AVState's own cadences cover everything that
     * is playback state; this is for the facts beside it that change on nobody's
     * clock — the scrubber's waveform strip arriving from the network.
     */
    refresh(): void;
    /** Re-read the labels after a locale change. */
    retranslate(): void;
    destroy(): void;
}

export function createTransport(options: TransportOptions): Transport {
    const { avState, prefs } = options;

    const view = $state<TransportView>({
        present: false,
        paused: true,
        duration: null,
        currentTime: 0,
        fraction: 0,
        buffered: [],
        muted: prefs.muted,
        volume: prefs.volume,
        volumeSettable: true,
        position: '',
        peaksStrip: null,
        captionOptions: [],
        activeCaption: null,
        labels: options.labels(),
    });

    // Probing costs a write and a read on the element, so it is done once per
    // element rather than once per frame.
    let probed: HTMLMediaElement | null = null;

    /**
     * Who core tells when to re-read: one callback, the render site's.
     *
     * Deliberately non-reactive. Nothing on this side renders from the set —
     * the signal is the callback, which core turns into its own state write.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const listeners = new Set<() => void>();

    function announce(): void {
        for (const listener of [...listeners]) listener();
    }

    /** The playhead as the announced clock reading, in the active locale. */
    function positionText(): string {
        return options.t('av_position', {
            current: formatMediaTime(view.currentTime, view.duration),
            total: formatMediaTime(view.duration, view.duration),
        });
    }

    function refresh(): void {
        const media = options.currentMedia();
        if (media && media !== probed) {
            probed = media;
            view.volumeSettable = volumeIsSettable(media);
            // Volume and mute are remembered per activation, not per canvas,
            // and every stage is built up front — so the moment a navigation
            // brings a new element under this chrome is the moment it has to be
            // brought to the reader's settings.
            prefs.applyTo(media);
        }

        // No current claimed canvas is the transient case a navigation to an
        // image page puts the chrome in. It stays REGISTERED and renders
        // nothing, rather than deregistering and re-registering per page.
        view.present = media !== null;
        view.paused = avState.paused;
        view.duration = avState.duration;
        view.currentTime = avState.currentTime;
        view.fraction = timeFraction(view.currentTime, view.duration);
        view.buffered = bufferedSpans(
            (options.bufferedSpans ?? elementSpans)(media?.buffered),
            view.duration,
        );
        view.muted = prefs.muted;
        view.volume = prefs.volume;
        view.position = positionText();
        view.peaksStrip = options.peaksStrip();

        const captions = options.captions();
        view.captionOptions = captionOptions(
            captions.tracks,
            view.labels.captionsTrack,
        );
        view.activeCaption = captions.active;

        announce();
    }

    const port: TransportPort = {
        toggle(): void {
            if (view.paused) avState.play();
            else avState.pause();
        },
        seek(fraction: number): void {
            // Core's coordinate is the scrubber's; the canvas timeline's is
            // seconds. The conversion lives here because core knows no clock.
            const seconds = fractionToTime(fraction, view.duration);
            if (seconds === null) return;
            avState.seek(seconds);
            // AVState notifies on its own cadence; pulling the view forward now
            // keeps a keyboard-repeat seek from lagging a frame behind the key.
            refresh();
        },
        setMuted(muted: boolean): void {
            prefs.set(prefs.volume, muted);
            avState.setMuted(muted);
            refresh();
        },
        setTrack(id: string | null): void {
            options.setCaptionTrack(id);
            refresh();
        },
        setVolume(volume: number): void {
            // Moving the slider off zero is how a reader unmutes without
            // finding the mute button — the universal convention.
            prefs.set(volume, volume === 0 ? prefs.muted : false);
            avState.setVolume(prefs.volume);
            avState.setMuted(prefs.muted);
            refresh();
        },
    };

    const stopState = avState.subscribe(refresh);
    const stopFrames = avState.subscribeFrame(refresh);
    refresh();

    return {
        view() {
            const { labels } = view;
            return {
                present: view.present,
                paused: view.paused,
                duration: view.duration,
                currentTime: view.currentTime,
                fraction: view.fraction,
                buffered: view.buffered,
                muted: view.muted,
                volume: view.volume,
                volumeSettable: view.volumeSettable,
                positionText: view.position,
                elapsedText: formatMediaTime(view.currentTime, view.duration),
                durationText: formatMediaTime(view.duration, view.duration),
                strip: view.peaksStrip,
                tracks: view.captionOptions,
                activeTrack: view.activeCaption,
                stepSmall: SEEK_STEP_SMALL,
                stepLarge: SEEK_STEP_LARGE,
                labels: {
                    transport: labels.transport,
                    play: labels.play,
                    pause: labels.pause,
                    elapsed: labels.elapsed,
                    seek: labels.seek,
                    duration: labels.duration,
                    mute: labels.mute,
                    unmute: labels.unmute,
                    volume: labels.volume,
                    tracks: labels.captions,
                    tracksOff: labels.captionsOff,
                },
            };
        },
        port,
        subscribe(onChange: () => void): () => void {
            listeners.add(onChange);
            return () => {
                listeners.delete(onChange);
            };
        },
        refresh,
        retranslate(): void {
            view.labels = options.labels();
            view.position = positionText();
            // The generic track name is localized, so a locale change has to
            // rebuild the options a nameless track is listed under.
            refresh();
        },
        destroy(): void {
            stopState();
            stopFrames();
            listeners.clear();
        },
    };
}
