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
 * The view model is held in core's vocabulary rather than this plugin's, so a
 * read is a shallow spread instead of a field-by-field copy through a renaming
 * layer. Captions are therefore "tracks" here, as they are to a core that models
 * no medium; `catalog.ts` is where they are captions again.
 *
 * Nothing here is reactive. Core reads through `$state.raw` and assigns the
 * result, so the signal core acts on is {@link Transport.subscribe}'s callback
 * and the identity of the object {@link Transport.view} hands back — never a
 * dependency taken on a field. `$state` would only buy a Proxy per playback
 * frame that nothing reads through.
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
    formatMediaTime,
    fractionToTime,
    SEEK_STEP_LARGE,
    SEEK_STEP_SMALL,
    timeFraction,
    type TimeSpan,
    volumeIsSettable,
} from './transport';

/**
 * Every string the transport shows or announces, in the active locale.
 *
 * Core's `TransportChromeLabels` keys, so the labels cross the seam by
 * reference, plus the one name core has no use for. The clock readings carry no
 * label: core's two spans are `aria-hidden`, because a `<span>` maps to role
 * `generic`, which prohibits an accessible name — the scrubber's
 * `aria-valuetext` announces the whole reading instead.
 */
export interface TransportLabels {
    readonly transport: string;
    readonly play: string;
    readonly pause: string;
    readonly seek: string;
    readonly mute: string;
    readonly unmute: string;
    readonly volume: string;
    readonly tracks: string;
    readonly tracksOff: string;
    readonly transcript: string;
    /**
     * The generic name for a track that declares neither label nor language.
     * Read here to build {@link TransportView.tracks} and never sent onward:
     * core renders the names, not the policy that chose them.
     */
    readonly trackFallback: string;
}

/**
 * The view model, shaped as core's `TransportChromeView`.
 *
 * Structural rather than typed against the import so this module's own tests
 * need no core — but it is the same contract, field for field, and must stay
 * that way: {@link Transport.view} hands a copy of this straight over.
 */
export interface TransportView {
    /** A current canvas this activation has claimed. `false` renders nothing. */
    present: boolean;
    paused: boolean;
    duration: number | null;
    currentTime: number;
    /** `currentTime` as `0..1` of the duration — the scrubber's own coordinate. */
    fraction: number;
    buffered: readonly BufferedSpan[];
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
    positionText: string;
    elapsedText: string;
    durationText: string;
    /**
     * The whole recording drawn once as a picture, for the scrubber's static
     * strip, or `null` when this canvas links no waveform data. It is how
     * waveform data reaches a video canvas, which gets no timeline lane in v1.
     */
    strip: string | null;
    /** Only tracks that LOADED, so a control over them can never be inert. */
    tracks: readonly { id: string; label: string }[];
    /** The showing track's id, or `null` for off. */
    activeTrack: string | null;
    /**
     * Whether this canvas offers a transcript — timed cues or a linked file.
     * False renders no control, so the button never appears over a recording
     * whose words are nowhere.
     */
    transcript: boolean;
    /** Whether the plugin's panel, where the transcript is read, is showing. */
    transcriptOpen: boolean;
    /** Seconds an arrow moves the playhead. */
    stepSmall: number;
    /** Seconds a page key moves the playhead. */
    stepLarge: number;
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
    let volume = 1;
    let muted = false;

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
     * they belong on a scrubber that spans the whole canvas. Wherever the canvas
     * timeline IS the element's own clock this is `elementSpans` — passed in
     * rather than defaulted to here, because which mapping applies is a property
     * of how the canvas was composed and only the caller knows it.
     */
    bufferedSpans(ranges: TimeRanges | null | undefined): readonly TimeSpan[];
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
    /**
     * Whether the current canvas offers a transcript at all. Read off the stage
     * manager rather than mirrored here: a canvas's caption tracks join the
     * loaded set as their fetches settle, so this answer changes after the
     * canvas is staged.
     */
    hasTranscript(): boolean;
    /** Whether the plugin's panel is showing. */
    panelOpen(): boolean;
    /** Show or hide the plugin's panel. */
    setPanelOpen(open: boolean): void;
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
    /** Show or hide the panel the transcript is read in. */
    setTranscript(open: boolean): void;
}

export interface Transport {
    /**
     * The chrome as core reads it: a COPY of the held state, never the state
     * object itself. Core keeps the result in `$state.raw` and `===`-compares
     * the assignment, so handing back the same reference twice would silently
     * stop every re-read from reaching the controls.
     */
    view(): TransportView;
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

    const state: TransportView = {
        present: false,
        paused: true,
        duration: null,
        currentTime: 0,
        fraction: 0,
        buffered: [],
        muted: prefs.muted,
        volume: prefs.volume,
        volumeSettable: true,
        positionText: '',
        elapsedText: '',
        durationText: '',
        strip: null,
        tracks: [],
        activeTrack: null,
        transcript: false,
        transcriptOpen: false,
        stepSmall: SEEK_STEP_SMALL,
        stepLarge: SEEK_STEP_LARGE,
        labels: options.labels(),
    };

    // Probing costs a write and a read on the element, so it is done once per
    // element rather than once per frame.
    let probed: HTMLMediaElement | null = null;

    /** Who core tells when to re-read: one callback, the render site's. */
    const listeners = new Set<() => void>();

    function announce(): void {
        for (const listener of [...listeners]) listener();
    }

    function refresh(): void {
        const media = options.currentMedia();
        if (media && media !== probed) {
            probed = media;
            state.volumeSettable = volumeIsSettable(media);
            // Volume and mute are remembered per activation, not per canvas,
            // and every stage is built up front — so the moment a navigation
            // brings a new element under this chrome is the moment it has to be
            // brought to the reader's settings.
            prefs.applyTo(media);
        }

        // No current claimed canvas is the transient case a navigation to an
        // image page puts the chrome in. It stays REGISTERED and renders
        // nothing, rather than deregistering and re-registering per page.
        state.present = media !== null;
        state.paused = avState.paused;
        state.duration = avState.duration;
        state.currentTime = avState.currentTime;
        state.fraction = timeFraction(state.currentTime, state.duration);
        state.buffered = bufferedSpans(
            options.bufferedSpans(media?.buffered),
            state.duration,
        );
        state.muted = prefs.muted;
        state.volume = prefs.volume;
        // The two clock readings and the announced position are one formatting
        // job rather than three: the announcement is built out of the readings.
        state.elapsedText = formatMediaTime(state.currentTime, state.duration);
        state.durationText = formatMediaTime(state.duration, state.duration);
        state.positionText = options.t('av_position', {
            current: state.elapsedText,
            total: state.durationText,
        });
        state.strip = options.peaksStrip();

        const captions = options.captions();
        state.tracks = captionOptions(
            captions.tracks,
            state.labels.trackFallback,
        );
        state.activeTrack = captions.active;

        state.transcript = options.hasTranscript();
        state.transcriptOpen = options.panelOpen();

        announce();
    }

    const port: TransportPort = {
        toggle(): void {
            if (state.paused) avState.play();
            else avState.pause();
        },
        seek(fraction: number): void {
            // Core's coordinate is the scrubber's; the canvas timeline's is
            // seconds. The conversion lives here because core knows no clock.
            const seconds = fractionToTime(fraction, state.duration);
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
        setTranscript(open: boolean): void {
            options.setPanelOpen(open);
            // The panel's open state is core's, not AVState's, so no playback
            // cadence will notice this on its own — least of all on the paused
            // canvas a reader is most likely to be reading the transcript of.
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
        view(): TransportView {
            return { ...state };
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
            state.labels = options.labels();
            // `refresh` is what rebuilds everything the locale reaches: the
            // options a nameless track is listed under, and the announced
            // position.
            refresh();
        },
        destroy(): void {
            stopState();
            stopFrames();
            listeners.clear();
        },
    };
}
