/**
 * One claimed canvas's **stage**: the DOM box the plugin renders that canvas's
 * media into, and the media element inside it.
 *
 * DOM rather than painted pixels because a reader must be able to operate it
 * (ADR 0016), and imperative rather than Svelte because the box is repositioned
 * on every frame the viewport moves — a write that belongs in the same frame the
 * tiles are painted in, not on a reactive flush.
 *
 * The element never gets the native `controls` attribute: the transport is the
 * viewer's, so that it is themed, localized, keyboard-operable, and anchored the
 * same way on every canvas.
 */

import type { CompanionImage } from './companionCanvases';
import type { AvSource } from './sources';
import {
    laneFraction,
    stageLanes,
    type StageLanes,
    type StageLayoutKind,
} from './stageLayout';

/** Where a stage sits, in the overlay container's coordinates. */
export interface StageRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export interface MediaStageOptions {
    readonly canvasId: string;
    readonly source: AvSource;
    /** How the rect is divided into lanes — see {@link StageLayoutKind}. */
    readonly layout: StageLayoutKind;
    /** The `accompanyingCanvas` still shown in the visual lane, when there is one. */
    readonly accompanying?: CompanionImage | null;
    /** The `placeholderCanvas` still shown until first play, when there is one. */
    readonly placeholder?: CompanionImage | null;
    /** Localized "this cannot be played here" copy. */
    readonly cannotPlayMessage: string;
    /** Called whenever the element starts or stops playing. */
    readonly onPlayStateChange: (paused: boolean) => void;
    /**
     * A tap at fraction `0..1` across the timeline lane — the timeline
     * projection. The stage reports the position and nothing else: what it
     * means in seconds, and whether it is honoured, is AVState's to decide.
     */
    readonly onSeekFraction?: (fraction: number) => void;
}

export interface MediaStage {
    readonly canvasId: string;
    /** The positioned box, to be appended to the plugin's overlay layer. */
    readonly root: HTMLElement;
    readonly media: HTMLMediaElement;
    /** Whether the stream failed and the stage shows the "can't play" treatment. */
    readonly unplayable: boolean;
    /** Place the stage over a projected canvas rect, or hide it when there is none. */
    place(rect: StageRect | null): void;
    /** Retranslate the "can't play" treatment after a locale change. */
    setCannotPlayMessage(message: string): void;
    /**
     * Show or hide the decorative play-state glyph — what this canvas gets
     * instead of a transport when it projects too narrow for one.
     */
    setGlyphVisible(visible: boolean): void;
    /** Play if paused, pause if playing. */
    toggle(): void;
    /**
     * The timeline lane — ticket 10's drawing surface, and `null` on a layout
     * that has no timeline lane (video).
     */
    readonly timelineLane: HTMLElement | null;
    destroy(): void;
}

/**
 * How far a pointer may travel between going down and coming up and still be a
 * tap rather than a drag, in screen pixels.
 */
const TAP_SLOP_PX = 6;

/**
 * Act on a tap on either lane, and let a drag pan the viewer instead.
 *
 * Two things the obvious `click` listener does not do.
 *
 * A drag produces a click too, which is how a pan across an audio canvas came
 * to seek it: the timeline lane fills the whole rect of a canvas that has no
 * picture. Only a pointer that barely moved is a tap, and the pointer-up is
 * heard on the window because by then it belongs to the renderer.
 *
 * And the gesture has to REACH the renderer. The plugin's overlay layer is a
 * SIBLING of the renderer's surface, so a lane that takes pointer events
 * swallows the drag that would have panned the image — bubbling cannot carry
 * it across. The lane therefore goes transparent for one hit test and the
 * `pointerdown` is re-dispatched on what is below it, which is the renderer's
 * canvas; the renderer captures the pointer there, so every later move and the
 * up arrive without further help.
 */
function onLaneTap(
    root: HTMLElement,
    handler: (lane: HTMLElement, event: PointerEvent) => void,
): () => void {
    let start: { x: number; y: number; lane: HTMLElement } | null = null;

    const onDown = (event: PointerEvent): void => {
        const lane = (event.target as Element | null)?.closest<HTMLElement>(
            '.tri-av-lane-visual, .tri-av-lane-timeline',
        );
        // Primary button only: a right-click is the browser's, not a tap.
        if (!lane || event.button !== 0) return;
        start = { x: event.clientX, y: event.clientY, lane };

        const scope = root.getRootNode() as Document | ShadowRoot;
        // jsdom has no hit testing, and a detached stage has nothing under it.
        if (typeof scope.elementFromPoint !== 'function') return;
        // The LANE is what has to go transparent: `pointer-events: none` on an
        // ancestor does not cover a descendant that declares `auto` itself,
        // and the lane is the only thing in the stage that does.
        lane.style.pointerEvents = 'none';
        const under = scope.elementFromPoint(event.clientX, event.clientY);
        lane.style.pointerEvents = '';
        if (under && !root.contains(under)) {
            under.dispatchEvent(
                // Only what the renderer reads off a pointer-DOWN: the id it
                // captures with, and where the gesture started. Everything
                // after this is the pointer's own real events, delivered to
                // the capture element.
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                    clientY: event.clientY,
                }),
            );
        }
    };
    const onUp = (event: PointerEvent): void => {
        const from = start;
        start = null;
        if (!from) return;
        const moved = Math.hypot(
            event.clientX - from.x,
            event.clientY - from.y,
        );
        if (moved <= TAP_SLOP_PX) handler(from.lane, event);
    };
    const onCancel = (): void => {
        start = null;
    };

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
        root.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
    };
}

/** Write one lane's box onto its element, or take the lane off the stage. */
function placeLane(lane: HTMLElement, rect: StageRect | null): void {
    lane.hidden = rect === null;
    if (!rect) return;
    lane.style.left = `${rect.left}px`;
    lane.style.top = `${rect.top}px`;
    lane.style.width = `${rect.width}px`;
    lane.style.height = `${rect.height}px`;
}

/**
 * Build a stage for one source.
 *
 * A media-element `error` — a dead URL, a format the browser will not decode, a
 * blocked request — shows the localized treatment inside this stage and nothing
 * else: not the unsupported presentation (the canvas IS supported; this stream
 * is not), not an activation failure, and nothing on the plugin error channel.
 * One bad stream costs one canvas, never the session (user story 27).
 */
export function createMediaStage(options: MediaStageOptions): MediaStage {
    const { canvasId, source } = options;

    const root = document.createElement('div');
    root.className = 'tri-av-stage';
    root.dataset.testid = 'av-stage';
    root.dataset.canvasId = canvasId;

    const media = document.createElement(
        source.kind === 'audio' ? 'audio' : 'video',
    ) as HTMLMediaElement;
    media.className = 'tri-av-media';
    media.dataset.testid = 'av-media';
    // `metadata`, not `auto`: a manifest of twenty canvases must not pull twenty
    // media files down to show a first frame.
    media.preload = 'metadata';
    if (source.kind === 'video') {
        // Set as an attribute rather than through the property so the markup is
        // what an iOS WebKit that predates the property sees too (user story 23).
        media.setAttribute('playsinline', '');
    }
    media.src = source.url;

    /**
     * The lanes. Both are created whatever the layout — the ones this layout
     * does not have simply never get placed — so the DOM shape is one shape and
     * ticket 10 has a surface to find whether or not it is on screen yet.
     *
     * The visual lane holds the picture: the video element itself, or the
     * accompanying still beside a sound recording. An `<audio>` element renders
     * nothing without `controls`, so it stays a child of the root rather than
     * occupying a lane it would only make empty.
     */
    const visualLane = document.createElement('div');
    visualLane.className = 'tri-av-lane-visual';
    visualLane.dataset.testid = 'av-visual-lane';
    visualLane.hidden = true;

    const timelineLane = document.createElement('div');
    timelineLane.className = 'tri-av-lane-timeline';
    timelineLane.dataset.testid = 'av-timeline-lane';
    timelineLane.hidden = true;

    if (source.kind === 'video') visualLane.append(media);
    else root.append(media);

    const accompanying = options.accompanying ?? null;
    let accompanyingImage: HTMLImageElement | null = null;
    if (accompanying) {
        accompanyingImage = document.createElement('img');
        accompanyingImage.className = 'tri-av-accompanying';
        accompanyingImage.dataset.testid = 'av-accompanying';
        // Decorative here: the recording is the content, and the companion
        // canvas's own label is not this element's to announce.
        accompanyingImage.alt = '';
        accompanyingImage.decoding = 'async';
        visualLane.append(accompanyingImage);
    }

    root.append(visualLane, timelineLane);

    /**
     * The placeholder still, shown until playback first starts.
     *
     * A plain image URL on a video element becomes `poster`, so the browser
     * paints and clears it on the element's own schedule. Everything else — a
     * URL this plugin built off an image service, or any placeholder on an
     * audio canvas, which has no element to hang a poster on — is an overlay
     * over the whole rect that the first `play` removes.
     */
    const placeholder = options.placeholder ?? null;
    let placeholderOverlay: HTMLImageElement | null = null;
    if (placeholder && !(placeholder.plain && source.kind === 'video')) {
        placeholderOverlay = document.createElement('img');
        placeholderOverlay.className = 'tri-av-placeholder';
        placeholderOverlay.dataset.testid = 'av-placeholder';
        placeholderOverlay.alt = '';
        placeholderOverlay.decoding = 'async';
        root.append(placeholderOverlay);
    }

    /**
     * Both stills are requested at the size of the lane that will show them,
     * which nobody knows until the renderer has laid the canvas out — so the
     * request waits for the first placement rather than going out at claim
     * time against a rect that does not exist yet. It is made once and never
     * revised: re-requesting on a zoom is deliberately not in this release
     * (v1 — "sized to the visual lane's projected size").
     */
    let stillsRequested = false;
    const requestStills = (lanes: StageLanes, rect: StageRect): void => {
        if (stillsRequested) return;
        stillsRequested = true;

        if (accompanying && accompanyingImage) {
            accompanyingImage.src = accompanying.urlFor(
                lanes.visual?.width ?? rect.width,
            );
        }
        if (!placeholder) return;
        // The placeholder covers the whole stage, whatever the lanes do.
        const url = placeholder.urlFor(rect.width);
        if (placeholderOverlay) placeholderOverlay.src = url;
        else (media as HTMLVideoElement).poster = url;
    };

    const unplayableNotice = document.createElement('div');
    unplayableNotice.className = 'tri-av-unplayable';
    unplayableNotice.dataset.testid = 'av-cannot-play';
    unplayableNotice.setAttribute('role', 'status');
    unplayableNotice.textContent = options.cannotPlayMessage;
    unplayableNotice.hidden = true;
    root.append(unplayableNotice);

    /**
     * The play-state glyph of user story 26. `aria-hidden` because it is a
     * picture of state the transport and AVState both announce properly; a
     * second announcement of the same fact is noise to a screen reader.
     */
    const glyph = document.createElement('div');
    glyph.className = 'tri-av-glyph';
    glyph.dataset.testid = 'av-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '▶';
    glyph.hidden = true;
    root.append(glyph);

    let unplayable = false;

    const paintGlyph = (): void => {
        glyph.textContent = media.paused ? '▶' : '❚❚';
    };

    const onError = (): void => {
        unplayable = true;
        unplayableNotice.hidden = false;
        media.hidden = true;
        glyph.hidden = true;
    };
    const onPlay = (): void => {
        // The poster clears itself; an overlay does not, and this is the only
        // moment it should: "until playback begins", not "until metadata".
        if (placeholderOverlay) placeholderOverlay.remove();
        placeholderOverlay = null;
        paintGlyph();
        options.onPlayStateChange(false);
    };
    const onPause = (): void => {
        paintGlyph();
        options.onPlayStateChange(true);
    };

    media.addEventListener('error', onError);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onPause);

    const toggle = (): void => {
        if (unplayable) return;
        if (media.paused) {
            // An autoplay policy rejects with a promise, never a throw. It is
            // not a failure worth reporting: the element stays paused, which is
            // already the state the transport shows.
            void Promise.resolve(media.play()).catch(() => {});
        } else {
            media.pause();
        }
    };

    /**
     * A tap on the timeline lane is a seek at that fraction of the lane — the
     * timeline projection. It goes out as a fraction rather than as seconds so
     * the stage never has to hold a duration, and never seeks anything itself:
     * playback is commanded through AVState, by the same path a host uses.
     *
     * Measured off the lane's own box rather than off `offsetX`, which is
     * relative to whatever element the pointer landed on — a drawing surface
     * inside the lane would otherwise silently move the origin.
     */
    const onTimelineTap = (event: PointerEvent): void => {
        if (unplayable) return;
        const box = timelineLane.getBoundingClientRect();
        const fraction = laneFraction(event.clientX - box.left, box.width);
        if (fraction !== null) options.onSeekFraction?.(fraction);
    };
    /*
        The layer is transparent to pointer events; the lanes opt back in. A tap
        on the visual lane toggles playback — the universal convention, and it
        must reach whatever is SHOWING there, which for a sound recording is the
        accompanying still rather than the media element.
    */
    const unbindTaps = onLaneTap(root, (lane, event) => {
        if (lane === timelineLane) onTimelineTap(event);
        else toggle();
    });

    return {
        canvasId,
        root,
        media,
        get unplayable(): boolean {
            return unplayable;
        },
        timelineLane: options.layout === 'video' ? null : timelineLane,
        place(rect: StageRect | null): void {
            root.hidden = rect === null;
            if (!rect) return;
            root.style.left = `${rect.left}px`;
            root.style.top = `${rect.top}px`;
            root.style.width = `${rect.width}px`;
            root.style.height = `${rect.height}px`;

            // The lanes divide the rect in the ROOT's own coordinates, which
            // is why the split is computed from an origin-anchored copy: the
            // root already carries the projection.
            const lanes = stageLanes(
                { left: 0, top: 0, width: rect.width, height: rect.height },
                options.layout,
            );
            placeLane(visualLane, lanes.visual);
            placeLane(timelineLane, lanes.timeline);
            if (rect.width > 0) requestStills(lanes, rect);
        },
        setCannotPlayMessage(message: string): void {
            unplayableNotice.textContent = message;
        },
        setGlyphVisible(visible: boolean): void {
            glyph.hidden = !visible || unplayable;
        },
        toggle,
        destroy(): void {
            media.removeEventListener('error', onError);
            media.removeEventListener('play', onPlay);
            media.removeEventListener('pause', onPause);
            media.removeEventListener('ended', onPause);
            unbindTaps();
            media.pause();
            // Drop every source before detaching so the browser stops any
            // transfer still in flight for a canvas nobody is looking at any
            // more — the stills as much as the stream.
            media.removeAttribute('src');
            media.load();
            accompanyingImage?.removeAttribute('src');
            placeholderOverlay?.removeAttribute('src');
            root.remove();
        },
    };
}
