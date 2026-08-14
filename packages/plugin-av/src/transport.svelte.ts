/**
 * The transport's host: the positioned box the component is mounted into, the
 * view model it renders from, and the activation-wide audio preferences.
 *
 * The split is the same one the stage makes and for the same reason. Placement
 * runs on every frame the viewport moves and is written straight to the
 * wrapper's style; everything a reader can see inside it is Svelte, driven from
 * a `$state` view model this module keeps in step with AVState's two cadences.
 *
 * The box is a SIBLING of the stage, not a child, because its size is in screen
 * pixels and the stage's is in projected canvas pixels: only the box's `x` and
 * `width` follow the projection, so the controls stay the same size at every
 * zoom (user story 9).
 */

import { mount, unmount } from 'svelte';

import type { AVState } from './avState';
import type { StageRect } from './mediaStage';
import TransportControls from './Transport.svelte';
import {
    type BufferedSpan,
    bufferedSpans,
    fitsTransport,
    formatMediaTime,
    timeFraction,
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
}

/** What the component renders. Every member is published playback state. */
export interface TransportView {
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
     * on the view model rather than being formatted in the component so that a
     * locale change re-announces it even on a paused canvas, where no clock
     * tick would otherwise recompute it.
     */
    position: string;
    labels: TransportLabels;
}

/** What the component may do. Everything is an AVState command. */
export interface TransportPort {
    /** Play if paused, pause if playing. */
    toggle(): void;
    seek(seconds: number): void;
    setMuted(muted: boolean): void;
    setVolume(volume: number): void;
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
    readonly prefs: AudioPrefs;
    labels(): TransportLabels;
    t(key: string, params?: Record<string, string | number>): string;
}

export interface Transport {
    /** The positioned box, to be appended to the plugin's overlay layer. */
    readonly root: HTMLElement;
    /**
     * Anchor the transport to a projected canvas rect, or hide it when there is
     * none. Answers whether it is showing, which is the question the stage's
     * play-state glyph is the other half of.
     */
    place(rect: StageRect | null): boolean;
    /** Re-read the labels after a locale change. */
    retranslate(): void;
    destroy(): void;
}

export function createTransport(options: TransportOptions): Transport {
    const { avState, prefs } = options;

    const root = document.createElement('div');
    root.className = 'tri-av-transport-anchor';
    root.dataset.testid = 'av-transport-anchor';
    root.hidden = true;

    const view = $state<TransportView>({
        paused: true,
        duration: null,
        currentTime: 0,
        fraction: 0,
        buffered: [],
        muted: prefs.muted,
        volume: prefs.volume,
        volumeSettable: true,
        position: '',
        labels: options.labels(),
    });

    // Probing costs a write and a read on the element, so it is done once per
    // element rather than once per frame.
    let probed: HTMLMediaElement | null = null;

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

        view.paused = avState.paused;
        view.duration = avState.duration;
        view.currentTime = avState.currentTime;
        view.fraction = timeFraction(view.currentTime, view.duration);
        view.buffered = bufferedSpans(media?.buffered, view.duration);
        view.muted = prefs.muted;
        view.volume = prefs.volume;
        view.position = positionText();
    }

    const port: TransportPort = {
        toggle(): void {
            if (view.paused) avState.play();
            else avState.pause();
        },
        seek(seconds: number): void {
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
        setVolume(volume: number): void {
            // Moving the slider off zero is how a reader unmutes without
            // finding the mute button — the universal convention.
            prefs.set(volume, volume === 0 ? prefs.muted : false);
            avState.setVolume(prefs.volume);
            avState.setMuted(prefs.muted);
            refresh();
        },
    };

    const app = mount(TransportControls, {
        target: root,
        props: { view, port },
    });

    const stopState = avState.subscribe(refresh);
    const stopFrames = avState.subscribeFrame(refresh);
    refresh();

    return {
        root,
        place(rect: StageRect | null): boolean {
            const showing = rect !== null && fitsTransport(rect.width);
            root.hidden = !showing;
            if (!showing) return false;

            root.style.left = `${rect.left}px`;
            root.style.width = `${rect.width}px`;
            // The rect's BOTTOM edge: the box is laid out upwards from there by
            // its own height, which is in screen pixels and therefore unknown
            // here. CSS does the subtraction (see `translate` in styles.ts).
            root.style.top = `${rect.top + rect.height}px`;
            return true;
        },
        retranslate(): void {
            view.labels = options.labels();
            view.position = positionText();
        },
        destroy(): void {
            stopState();
            stopFrames();
            void unmount(app);
            root.remove();
        },
    };
}
