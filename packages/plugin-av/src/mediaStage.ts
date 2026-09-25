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

import type { CaptionTrack } from './captions';
import { warnAboutUnloadableCaptionTrack } from './degradation';
import { formatMediaTime } from './transport';
import type { HlsAttachment } from './hls/index';
import { hasNativeHlsSupport, isHlsSource, loadHls } from './hlsLink';
import type { AvSource } from './sources';
import {
    laneFraction,
    stageClip,
    stageFill,
    type StageLayoutKind,
} from './stageLayout';
import type { VisibleBox } from './timeline/lane';
import type { Peaks } from './timeline/peaks';
import type { RulerSurface } from './timeline/ruler';
import type { WaveformSurface } from './timeline/surface';
import type { TimelineModule } from './timelineLink';

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
    /**
     * Whether core is painting this canvas's `placeholderCanvas` into the rect
     * until playback begins.
     *
     * The stage then has to stay out of the picture for exactly that long: core
     * cannot paint behind an opaque media element, so the element is invisible
     * — laid out and free to decode, but drawing nothing — the stage's own
     * background is transparent, and an `audio` stage's opaque timeline lane
     * gives way to a bare tap target, until there is a first frame to hand the
     * rect to.
     */
    readonly awaitsFirstPlay?: boolean;
    /**
     * The element has taken the rect: playback has begun AND there is data for
     * the current position, so the element is drawing a picture rather than its
     * own black. The caller's cue to move the companion phase off the
     * placeholder; doing it in that order is what keeps a frame from being
     * drawn with neither picture in it.
     */
    readonly onFirstPlay?: () => void;
    /**
     * The canvas's declared duration, which gives the timeline lane a length
     * before the element reports one of its own.
     */
    readonly duration?: number | null;
    /** Localized "this cannot be played here" copy. */
    readonly cannotPlayMessage: string;
    /**
     * The canvas's WebVTT tracks, as authored. Every one is attached and
     * loaded; only the ones that actually produced cues are offered.
     */
    readonly captions?: readonly CaptionTrack[];
    /**
     * A track finished loading or failed, so the set on offer has changed. It
     * is what tells the transport whether to render a toggle at all.
     */
    readonly onCaptionTracksChange?: () => void;
    /** Called whenever the element starts or stops playing. */
    readonly onPlayStateChange: (paused: boolean) => void;
    /**
     * A tap at fraction `0..1` across the timeline lane — the timeline
     * projection. The stage reports the position and nothing else: what it
     * means in seconds, and whether it is honoured, is AVState's to decide.
     */
    readonly onSeekFraction?: (fraction: number) => void;
    /**
     * The element reached the end of what it was playing.
     *
     * For a canvas one body fills — the identity mapping — that IS the end of
     * the canvas timeline, and this is the seam `auto-advance` listens on. For
     * a temporally composed canvas it is the end of a SEGMENT, and the
     * activation hands it to the sequencer instead, which crosses the seam and
     * reports the timeline's end only from the last one. The stage itself knows
     * neither case apart, which is what keeps segments out of it.
     *
     * It fires only for playback that actually ran off the end — assigning
     * `currentTime` on a paused element does not end it — which is what makes
     * continuing into the next canvas reader-initiated rather than autoplay.
     */
    readonly onTimelineEnd?: () => void;
}

/** Where a swapped-in source starts, in its OWN clock, and whether it plays. */
export interface SourceResume {
    readonly at: number;
    readonly play: boolean;
}

/**
 * A little more than the chrome's own height, so a caption clears the bar
 * rather than resting on it. A percentage of the picture, like the lift it is
 * added to.
 */
const CAPTION_GAP_PERCENT = 2;

/**
 * The most of the picture a lift may take. A short canvas under a wrapped
 * two-row bar would otherwise push its captions off the top, which is the
 * obscured caption again with the other edge doing it.
 */
const MAX_CAPTION_LIFT_PERCENT = 40;

export interface MediaStage {
    readonly canvasId: string;
    /** The alternative currently attached — what a swap is compared against. */
    readonly source: AvSource;
    /**
     * Attach a different rendition of the same canvas, preserving the reader's
     * place: the playhead and the paused state are captured before the old
     * source is detached and restored once the new one reports metadata.
     *
     * The ELEMENT is not rebuilt, so a Choice mixing a video rendition with an
     * audio-only one keeps whichever element the first selection built (and an
     * `<audio>` playing a video source plays its soundtrack). Rebuilding the
     * stage would throw away the position this exists to keep, and no vendored
     * recipe offers a Choice across media kinds.
     *
     * `resume` overrides both halves of that capture, and is how the sequencer
     * crosses a **segment seam**: the new source is a different body, so where
     * the reader was in the OLD one means nothing, and playback has to continue
     * across a boundary the element reached by ending.
     */
    setSource(source: AvSource, resume?: SourceResume): void;
    /** The positioned box, to be appended to the plugin's overlay layer. */
    readonly root: HTMLElement;
    readonly media: HTMLMediaElement;
    /**
     * Place the stage over a projected canvas rect, or hide it when there is
     * none. `visible` is the overlay container's own box: the stage is clipped
     * to it, so an overhanging projection neither draws nor takes pointer
     * events outside the container, and the waveform surface is clipped to it
     * so its backing store stays viewport-sized at any zoom.
     */
    place(rect: StageRect | null, visible: VisibleBox): void;
    /**
     * How many pixels of the overlay container's BOTTOM core's control bar is
     * covering right now (`ViewerState.chromeInset`), so the captions this
     * stage shows can be kept out from under it.
     *
     * Only the bottom edge, because only the bottom edge can be in the way: an
     * auto-placed WebVTT cue lands at the foot of the picture, so a bar
     * anchored to the top is beside the captions rather than over them.
     */
    setChromeBottom(pixels: number): void;
    /** Retranslate the "can't play" treatment after a locale change. */
    setCannotPlayMessage(message: string): void;
    /**
     * Show or hide the decorative play-state glyph — what a claimed canvas the
     * control bar's transport is NOT driving shows instead, so a reader with
     * several recordings on screen can tell which ones are playing.
     */
    setGlyphVisible(visible: boolean): void;
    /**
     * The caption tracks that LOADED — never the ones authored. A track the
     * browser refused (a dead URL, a server that grants no CORS) is not on
     * offer, because a control that selects it would do nothing.
     */
    readonly captionTracks: readonly CaptionTrack[];
    /**
     * Whether this stage's element can PAINT a showing track's cues — true for
     * `<video>`, false for `<audio>`, which has no rendering area at all.
     *
     * Tracks are attached either way, because the transcript panel reads their
     * parsed cues; what an `<audio>` stage must never grow is a captions
     * toggle, which would be visible and do nothing.
     */
    readonly rendersCaptions: boolean;
    /**
     * The live `TextTrack` behind one loaded caption track, for reading its
     * cues — the transcript panel's source. `null` when the URL is not one of
     * this stage's, or where there is no `TextTrack` implementation (jsdom).
     */
    captionTextTrack(url: string): TextTrack | null;
    /** The showing track's URL, or `null` for off — which is where it starts. */
    readonly activeCaptionTrack: string | null;
    /** Show one loaded track, or `null` to show none. */
    setCaptionTrack(url: string | null): void;
    /**
     * Narrow the tracks on offer to the ones authored beside the body that is
     * playing right now, by URL — `null` for "every one this canvas carries",
     * which is the state of a canvas that is not temporally composed.
     *
     * A track belongs to the body it was authored on, so on a composed canvas
     * one segment's captions must not caption its neighbour. A showing track
     * that falls out of the set is turned off with it.
     */
    setEligibleCaptions(urls: readonly string[] | null): void;
    /**
     * Adopt resolved peaks for this canvas. Builds the drawing surface on the
     * first call; a layout with no timeline lane keeps the data for the
     * scrubber strip and draws nothing here.
     */
    adoptWaveform(module: TimelineModule, peaks: Peaks): void;
    /**
     * Adopt the loaded timeline chunk and draw the ruler with it. Ignored by a
     * layout with no lane, and by one whose waveform already got there: the
     * waveform graduates the same window and says more.
     */
    adoptRuler(module: TimelineModule): void;
    /**
     * Redraw whatever graduates this lane — the waveform, or the ruler a lane
     * with no peaks draws instead — and its playhead. Cheap and idempotent when
     * the layout has neither, because it is called on the playback frame
     * cadence.
     */
    paintTimeline(): void;
    destroy(): void;
}

/**
 * How far a pointer may travel between going down and coming up and still be a
 * tap rather than a drag, in screen pixels.
 */
const TAP_SLOP_PX = 6;

/**
 * `HTMLMediaElement.HAVE_CURRENT_DATA`: there is data for the current playback
 * position — a frame to show. Written out because the constant is on the
 * interface rather than in the global scope this bundle can name.
 */
const HAVE_CURRENT_DATA = 2;

/**
 * Act on a tap on a stage target — either lane, or the tap target over a
 * companion core paints — and let a drag pan the viewer instead.
 *
 * Two things the obvious `click` listener does not do.
 *
 * A drag produces a click too, which is how a pan across an audio canvas came
 * to seek it: the timeline lane fills the whole rect of a canvas that has no
 * picture. Only a pointer that barely moved is a tap, and the pointer-up is
 * heard on the window because by then it belongs to the renderer.
 *
 * And the gesture has to REACH the renderer. The plugin's overlay layer is a
 * SIBLING of the renderer's surface, so a target that takes pointer events
 * swallows the drag that would have panned the image — bubbling cannot carry
 * it across. The target therefore goes transparent for one hit test and the
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
            '.tri-av-lane-visual, .tri-av-lane-timeline, .tri-av-tap',
        );
        // Primary button only: a right-click is the browser's, not a tap.
        if (!lane || event.button !== 0) return;
        start = { x: event.clientX, y: event.clientY, lane };

        const scope = root.getRootNode() as Document | ShadowRoot;
        // jsdom has no hit testing, and a detached stage has nothing under it.
        if (typeof scope.elementFromPoint !== 'function') return;
        // The TARGET is what has to go transparent: `pointer-events: none` on
        // an ancestor does not cover a descendant that declares `auto` itself,
        // and the lanes and the tap target are the only things in the stage
        // that do.
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
 * One bad stream costs one canvas, never the session.
 */
export function createMediaStage(options: MediaStageOptions): MediaStage {
    const { canvasId, source } = options;

    /**
     * Whether core is painting a companion Canvas into this rect. The stage
     * then belongs to the renderer: it draws no lanes, and every layer of it
     * that could cover the picture — the stage's own background, the element
     * decoding the sound — has to stay out of the way. The plugin's overlay
     * sits above the renderer's canvas at `z-index: 40`, so anything opaque
     * here renders the companion correctly and shows a black rect (ADR 0016).
     */
    const corePaints = options.layout === 'audio-with-image';

    /**
     * Whether core is painting the placeholder right now — true until the first
     * `play`, and only where the caller asked for it. Its own class rather than
     * the `hidden` attribute, which already means "unplayable" on the media
     * element and carries `display: none`: taking the element out of layout
     * before it has been asked to decode anything is not what this needs.
     */
    let awaitingPlay = options.awaitsFirstPlay === true;

    /**
     * Which lanes the stage draws **right now**, which is not always the
     * layout it keeps.
     *
     * The `audio` layout's timeline lane is opaque and fills the rect, so a
     * stage waiting on its first play would cover the very still core is
     * painting there. It takes the companion layout — no lanes, a tap target —
     * for exactly that long and falls back to its own on the first play. Every
     * other layout already leaves core's painting visible: the `video` lane is
     * transparent and holds the element, which `tri-av-unplayed` hides.
     */
    const laneLayout = (): StageLayoutKind =>
        awaitingPlay && options.layout === 'audio'
            ? 'audio-with-image'
            : options.layout;

    const root = document.createElement('div');
    root.className = 'tri-av-stage';
    if (corePaints) root.classList.add('tri-av-painted');
    if (awaitingPlay) root.classList.add('tri-av-unplayed');
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
    // A `<track>` is only fetched at all when the element is in CORS mode; without
    // this the browser refuses a cross-origin VTT before consulting any header, and
    // every Cookbook caption recipe is cross-origin. `anonymous` rather than
    // `use-credentials`: a public viewer sends no credentials to third-party media.
    media.crossOrigin = 'anonymous';
    if (source.kind === 'video') {
        // Set as an attribute rather than through the property so the markup is
        // what an iOS WebKit that predates the property sees too.
        media.setAttribute('playsinline', '');
    }

    /**
     * The lanes. Both are created whatever the layout — the ones this layout
     * does not have simply never get placed — so the DOM shape is one shape and
     * a surface can be found whether or not it is on screen yet.
     *
     * The visual lane holds the picture where the picture is the plugin's: the
     * video element. An `<audio>` element renders nothing without `controls`,
     * so it stays a child of the root rather than occupying a lane it would
     * only make empty.
     */
    const visualLane = document.createElement('div');
    visualLane.className = 'tri-av-lane-visual';
    visualLane.dataset.testid = 'av-visual-lane';
    visualLane.hidden = true;

    const timelineLane = document.createElement('div');
    timelineLane.className = 'tri-av-lane-timeline';
    timelineLane.dataset.testid = 'av-timeline-lane';
    timelineLane.hidden = true;

    // By layout, not by element: a `<video>` attached to a duration-only canvas
    // has no picture to show, and putting it in the visual lane would cover
    // whatever does.
    if (options.layout === 'video') visualLane.append(media);
    else root.append(media);

    root.append(visualLane, timelineLane);

    /**
     * The tap target over a companion core paints: the whole rect, transparent,
     * and the ONLY thing the plugin puts over the picture.
     *
     * It is a target rather than a lane because it divides nothing and shows
     * nothing; it hands a drag down to the renderer by the same route the lanes
     * do, so panning and zooming the score are the renderer's as usual.
     *
     * A stage that only borrows that layout until its first play hides this
     * again when its own lanes come back, because the lanes take their own taps
     * and a target left over them would swallow every seek.
     */
    const tapTarget =
        laneLayout() === 'audio-with-image'
            ? document.createElement('div')
            : null;
    if (tapTarget) {
        tapTarget.className = 'tri-av-tap';
        tapTarget.dataset.testid = 'av-tap';
        root.append(tapTarget);
    }

    const unplayableNotice = document.createElement('div');
    unplayableNotice.className = 'tri-av-unplayable';
    unplayableNotice.dataset.testid = 'av-cannot-play';
    unplayableNotice.setAttribute('role', 'status');
    unplayableNotice.textContent = options.cannotPlayMessage;
    unplayableNotice.hidden = true;
    root.append(unplayableNotice);

    /**
     * The play-state glyph. `aria-hidden` because it is a
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
        // A stage still waiting for a first frame stays waiting: there will
        // never be one now, and core's still is the only picture this canvas
        // has. It is not stuck hidden — the stage is transparent while the
        // still shows, and the notice above says why nothing plays.
    };
    /**
     * The element takes the rect, and only then is the phase handed back — in
     * that order, so no frame is drawn with neither picture in it.
     */
    const reveal = (): void => {
        if (!awaitingPlay) return;
        awaitingPlay = false;
        media.removeEventListener('loadeddata', reveal);
        media.removeEventListener('playing', reveal);
        root.classList.remove('tri-av-unplayed');
        // The lanes this stage stayed out of the rect for are its own again.
        if (lastPlace) place(lastPlace.rect, lastPlace.visible);
        options.onFirstPlay?.();
    };
    const onPlay = (): void => {
        // `play` fires when playback is ASKED for, not when there is a picture
        // to show: the element's own background is opaque black, so revealing
        // it here blacks the still out for the whole buffering interval — the
        // entire interval, on the MSE path, where nothing is buffered until
        // after `play()`. The still stands until there is a
        // frame to replace it with, and `readyState` is checked first because
        // an already-buffered element may fire neither event again.
        if (awaitingPlay) {
            if (media.readyState >= HAVE_CURRENT_DATA) reveal();
            else {
                media.addEventListener('loadeddata', reveal);
                media.addEventListener('playing', reveal);
            }
        }
        paintGlyph();
        options.onPlayStateChange(false);
    };
    const onPause = (): void => {
        paintGlyph();
        options.onPlayStateChange(true);
    };

    const onEnded = (): void => {
        onPause();
        options.onTimelineEnd?.();
    };

    media.addEventListener('error', onError);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);

    /**
     * The stream, attached after the listeners rather than before them: an HLS
     * stage can be declared unplayable from inside the loader below, and the
     * `error` path it shares must already be wired when that happens.
     *
     * A progressive file is an `src` assignment and nothing more. HLS is one
     * too wherever the platform decodes it — Safari and every iOS browser —
     * and only otherwise costs a chunk (`hlsLink.ts` carries the reasoning).
     */
    let hlsAttachment: HlsAttachment | null = null;
    let destroyed = false;
    let current = source;
    /** Where the reader was, held from the first unrestored swap onward. */
    let pendingCapture: { at: number; wasPlaying: boolean } | null = null;

    function attach(next: AvSource): void {
        if (!isHlsSource(next) || hasNativeHlsSupport(media)) {
            media.src = next.url;
            return;
        }

        void loadHls()
            .then((module) => {
                // The stage may have been torn down, or swapped to another
                // rendition, while the chunk was in flight; attaching now would
                // leave a player buffering into detached DOM or over a source
                // nobody asked for any more.
                if (destroyed || current !== next) return;
                hlsAttachment =
                    module?.attachHlsStream(media, next.url, onError) ?? null;
                // No chunk, or no Media Source Extensions to run it with. This
                // canvas cannot play here — which is one stage's treatment, not an
                // activation failure and not a `pluginerror`.
                if (!hlsAttachment) onError();
            })
            .catch(() => {
                // Anything the chunk itself threw on the way to a player — a
                // constructor or an `attachMedia` that did not like this element.
                // Same outcome as no chunk at all: one stage's treatment.
                if (!destroyed && current === next) onError();
            });
    }

    attach(source);

    /**
     * Swap the rendition without losing the reader's place.
     *
     * Both halves of the position are captured BEFORE anything is detached:
     * emptying the element resets `currentTime` to 0 and fires `pause`, so a
     * capture taken afterwards records the swap's own side effects rather than
     * where the reader was. They are restored on `loadedmetadata`, the first
     * moment the new source has a timeline to seek within — assigning
     * `currentTime` before it is silently dropped.
     *
     * A swap that supersedes one whose restore has not run yet inherits that
     * capture instead of taking its own. The earlier swap already emptied the
     * element, so a fresh reading here would record 0 and paused — the previous
     * swap's own side effects — and drop a reader five seconds in back to the
     * top of the recording.
     */
    function setSource(next: AvSource, resume?: SourceResume): void {
        if (destroyed || (!resume && next.url === current.url)) return;

        const capture = resume
            ? { at: resume.at, wasPlaying: resume.play }
            : (pendingCapture ?? {
                  at: media.currentTime,
                  wasPlaying: !media.paused,
              });
        // A stated resume is not a capture to be inherited: the next swap wants
        // where the reader IS, not where a seam put them.
        pendingCapture = resume ? null : capture;
        current = next;

        hlsAttachment?.destroy();
        hlsAttachment = null;
        media.pause();
        media.removeAttribute('src');
        media.load();

        // The old rendition's failure is not the new one's: a stage that showed
        // the treatment can play again.
        unplayable = false;
        unplayableNotice.hidden = true;
        media.hidden = false;

        media.addEventListener(
            'loadedmetadata',
            () => {
                if (destroyed || current !== next) return;
                pendingCapture = null;
                media.currentTime = Number.isFinite(media.duration)
                    ? Math.min(capture.at, media.duration)
                    : capture.at;
                // An autoplay policy rejects with a promise, never a throw, and
                // a refusal here leaves the element paused — which the transport
                // already shows.
                if (capture.wasPlaying)
                    void Promise.resolve(media.play()).catch(() => {});
            },
            { once: true },
        );

        attach(next);
    }

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
        The layer is transparent to pointer events; the lanes and the tap target
        opt back in. A tap anywhere but the timeline lane toggles playback — the
        universal convention, and it must reach whatever is SHOWING there, which
        for a sound recording with a companion is core's painting rather than
        any element of this plugin's.
    */
    const unbindTaps = onLaneTap(root, (lane, event) => {
        if (lane === timelineLane) onTimelineTap(event);
        else toggle();
    });

    /**
     * The waveform's drawing surface, built only once peaks have arrived — a
     * canvas nobody can draw into is DOM that costs memory and says nothing.
     * Only the `audio` layout builds one: every other layout's waveform data
     * goes to the scrubber strip instead.
     */
    let waveform: WaveformSurface | null = null;

    /**
     * The lane's timeline length. The element leads once it reports one — it is
     * what a seek is actually bound to — and the manifest's declared duration
     * fills the window before `loadedmetadata`, the same rule `AVState.duration`
     * follows.
     */
    const timelineDuration = (): number | null => {
        const reported = media.duration;
        if (Number.isFinite(reported) && reported > 0) return reported;
        return options.duration ?? null;
    };

    /**
     * The ruler's surface, built when the timeline chunk arrives — which for a
     * bare audio canvas is unconditional, since the graduations are the only
     * thing there is to look at. Its own field rather than the waveform's,
     * because the two can both be resolved and only one of them draws.
     */
    let ruler: RulerSurface | null = null;

    /** The last placement, so a late-arriving waveform can be drawn at once. */
    let placement: { lane: StageRect; visible: VisibleBox } | null = null;
    /**
     * The last projection, so the stage can re-place itself off the reader's
     * cadence: the lanes change at the first play, which is not a frame the
     * viewport moved in and so brings no placement of its own.
     */
    let lastPlace: { rect: StageRect | null; visible: VisibleBox } | null =
        null;

    function place(rect: StageRect | null, visible: VisibleBox): void {
        lastPlace = { rect, visible };
        // A stage whose rect overhangs the container stays the size of its
        // rect — it is the canvas's projection, not a box in the viewport — and
        // is CLIPPED to what falls inside, which takes the overhanging part out
        // of hit testing as well as out of the picture (see `stageClip`).
        // Without that, an audio canvas's timeline, which fills its whole rect,
        // reaches over the columns beside the container and swallows taps
        // aimed at the chrome there.
        const clip = rect ? stageClip(rect, visible) : null;
        root.hidden = clip === null || clip.hidden;
        if (!rect || !clip || clip.hidden) {
            placement = null;
            waveform?.place(null, { width: 0, height: 0 });
            ruler?.place(null, { width: 0, height: 0 });
            return;
        }
        root.style.left = `${rect.left}px`;
        root.style.top = `${rect.top}px`;
        root.style.width = `${rect.width}px`;
        root.style.height = `${rect.height}px`;
        root.style.clipPath = clip.clipPath;

        // Whatever fills the rect fills all of it, in the ROOT's own
        // coordinates — the root already carries the projection.
        const current = laneLayout();
        const fill = stageFill(current);
        const box = { left: 0, top: 0, width: rect.width, height: rect.height };
        placeLane(visualLane, fill === 'visual' ? box : null);
        placeLane(timelineLane, fill === 'timeline' ? box : null);
        // The picture just changed size or moved under the bar, so how much of
        // it the bar covers has changed with it.
        liftCaptionCues();
        if (tapTarget) tapTarget.hidden = current !== 'audio-with-image';

        // The surface clips against the CONTAINER's box, and the lane fills the
        // rect, so in container coordinates the lane IS the rect.
        placement = fill === 'timeline' ? { lane: rect, visible } : null;
        if (placement) {
            waveform?.place(placement.lane, placement.visible);
            waveform?.paint(media.currentTime);
            // Painted here as well as on the playback cadence: a lane that is
            // paused gets no frames from AVState, and a ruler that only drew
            // while something was playing would be blank on arrival.
            ruler?.place(placement.lane, rulerVisible(placement.visible));
            ruler?.paint(media.currentTime);
        } else {
            ruler?.place(null, { width: 0, height: 0 });
        }
    }

    /**
     * The caption tracks, attached as native `<track>` children — on every
     * stage, audio included.
     *
     * An `<audio>` element has no rendering area, so cues attached to one are
     * parsed and never drawn. Parsed is the point: `hidden` tracks expose
     * `track.cues`, and that is where the transcript panel reads a sound
     * recording's words from. What such a stage does NOT get is the captions
     * toggle — a control that could only ever paint nothing —
     * which `rendersCaptions` below is what says.
     */
    const authoredCaptions = options.captions ?? [];
    /**
     * Whether a showing track's cues have somewhere to be drawn.
     *
     * A `<video>` alone is not enough: on an `audio-with-image` stage the rect
     * belongs to the companion core paints, and the element is hidden behind it
     * — so a `Sound` body formatted `video/mp4` decodes through a `<video>` that
     * paints no cues, and a toggle over it would be the dead control.
     */
    const rendersCaptions =
        source.kind === 'video' && options.layout !== 'audio-with-image';
    /**
     * The tracks that have settled, held **at their authored index** with the
     * unsettled and the dropped left as holes.
     *
     * By index rather than in arrival order because the tracks settle when the
     * network says so: pushing would list the languages in whatever sequence
     * the responses came back in, which differs between loads and defeats the
     * manifest order `captionTracksForCanvas` takes care to preserve.
     */
    const settledCaptions: (CaptionTrack | null)[] = authoredCaptions.map(
        () => null,
    );
    /** The tracks the playing body carries — `null` while every one qualifies. */
    let eligibleCaptions: ReadonlySet<string> | null = null;
    /**
     * The filtered result, held until one of its two inputs actually moves.
     *
     * The transport reads this on the frame cadence and decides whether to
     * rebuild its caption options from the array's identity, so filtering afresh
     * per read would both repeat the work and defeat that check. Only a track
     * settling into the set and an eligibility change can alter the answer, so
     * those two are where it is dropped.
     */
    let captionCache: CaptionTrack[] | null = null;
    const loadedCaptions = (): CaptionTrack[] =>
        (captionCache ??= settledCaptions.filter(
            (track): track is CaptionTrack =>
                track !== null &&
                (eligibleCaptions === null || eligibleCaptions.has(track.url)),
        ));
    let activeCaption: string | null = null;

    /**
     * jsdom implements the `<track>` ELEMENT but not the `TextTrack` behind it,
     * so the mode is written through a guard rather than a bare assignment.
     */
    function setTrackMode(
        element: HTMLTrackElement,
        mode: TextTrackMode,
    ): void {
        const textTrack = element.track as TextTrack | undefined;
        if (textTrack) textTrack.mode = mode;
    }

    /**
     * Whether a track the browser reports as loaded actually carries cues.
     *
     * A syntactically valid VTT with no cues in it loads perfectly: the `load`
     * event fires, `readyState` reaches `LOADED`, and selecting the track
     * produces nothing whatever. That is the visible-control-that-does-nothing
     * reached through the ordinary path, so it is dropped like
     * a refused one. `undefined` cues means no `TextTrack` implementation to ask
     * (jsdom), not an empty one, and is not grounds to drop anything.
     */
    function hasNoCues(element: HTMLTrackElement): boolean {
        const cues = (element.track as TextTrack | undefined)?.cues;
        return cues !== undefined && cues !== null && cues.length === 0;
    }

    /**
     * Attach one track and start it loading.
     *
     * `hidden`, not `disabled`: a disabled track is never fetched, so a file
     * the server will refuse would sit there looking fine until a reader turned
     * captions on and met nothing. `hidden` parses the cues without showing
     * them, which is what makes "off by default" and "the toggle is only
     * offered for tracks that work" the same state rather than opposite ones.
     */
    const captionElements = authoredCaptions.map((caption, index) => {
        const element = document.createElement('track');
        element.kind = 'captions';
        element.src = caption.url;
        if (caption.language) element.srclang = caption.language;
        if (caption.label) element.label = caption.label;
        media.append(element);

        const detach = (): void => {
            element.removeEventListener('load', onLoad);
            element.removeEventListener('error', onFailure);
        };
        /** A track that survived: offered, at the position it was authored in. */
        const keep = (): void => {
            detach();
            settledCaptions[index] = caption;
            captionCache = null;
            // The cues exist only now, so a track that loads while it is
            // already the showing one has never been lifted.
            liftCaptionCues();
            options.onCaptionTracksChange?.();
        };
        /** A track that cannot caption anything: dropped, with one warning. */
        const drop = (): void => {
            detach();
            warnAboutUnloadableCaptionTrack(caption.url);
            options.onCaptionTracksChange?.();
        };
        // A response can still arrive for a stage nobody is looking at any
        // more; it must not resurrect one.
        const onLoad = (): void => {
            if (destroyed) return;
            if (hasNoCues(element)) drop();
            else keep();
        };
        const onFailure = (): void => {
            if (destroyed) return;
            drop();
        };
        element.addEventListener('load', onLoad);
        element.addEventListener('error', onFailure);

        setTrackMode(element, 'hidden');
        return { element, caption, detach };
    });

    /**
     * Show one loaded, eligible track and hide the rest. A track that did not
     * load, or that the playing body does not carry, cannot be selected
     * whoever asks: the one guarantee this feature makes is that turning
     * captions on produces captions.
     */
    function selectCaptionTrack(url: string | null): void {
        activeCaption =
            url !== null && loadedCaptions().some((track) => track.url === url)
                ? url
                : null;
        applyCaptionModes();
    }

    /** Show the selected track and hide every other loaded one. */
    function applyCaptionModes(): void {
        for (const entry of captionElements) {
            setTrackMode(
                entry.element,
                entry.caption.url === activeCaption ? 'showing' : 'hidden',
            );
        }
        liftCaptionCues();
    }

    /**
     * The cues whose placement this stage has taken over.
     *
     * Held so an authored placement is never overwritten and an adopted one can
     * be put back: once a cue has been lifted its `line` is no longer `'auto'`,
     * so the "did the curator place this?" test can only be asked once. A weak
     * set because the cues belong to the track element, which outlives nothing
     * here and may be dropped at any time.
     */
    const liftedCues = new WeakSet<TextTrackCue>();
    /** Pixels of the container's bottom edge core's chrome is covering. */
    let chromeBottom = 0;

    /**
     * How much of THIS stage's picture the chrome is covering, in pixels of the
     * stage's own box.
     *
     * The chrome band is stated against the overlay container, and the stage's
     * rect is in that container's coordinates, so the overlap is arithmetic. A
     * stage the bar does not reach — a small canvas high in a tall viewer —
     * answers zero and keeps its captions where the browser puts them.
     */
    /**
     * The box the RULER clips against: the container's, with the chrome band
     * taken off the bottom.
     *
     * The ruler draws along the FOOT of its surface — the baseline, the ticks
     * and the clock labels all measure up from it — because that is where a
     * reader of any ruler looks for them. A lane fills its canvas's whole rect,
     * and on a bare audio canvas that rect runs to the bottom of the viewer,
     * which is exactly where the control bar sits: clipped only against the
     * container, every graduation would be drawn underneath the bar and the
     * lane would read as the empty rectangle the ruler exists to replace. It is
     * the same answer the captions get a few lines below — theirs through
     * WebVTT's own `line`, because a cue box is painted in the user agent's
     * shadow DOM and cannot be clipped from here.
     *
     * The waveform is deliberately NOT shortened: it is drawn about a centre
     * line rather than off a baseline, so the bar crosses it without hiding
     * anything it says, and a lane world's waveform fills the viewer top to
     * bottom (`av-waveform.spec.ts`).
     *
     * Only the height moves. The time window is read off the left and right
     * edges, so a shorter surface graduates the same span of the recording.
     */
    function rulerVisible(visible: VisibleBox): VisibleBox {
        if (chromeBottom <= 0) return visible;
        return {
            width: visible.width,
            height: Math.max(0, visible.height - chromeBottom),
        };
    }

    function chromeOverPicture(): number {
        const rect = lastPlace?.rect;
        const visible = lastPlace?.visible;
        if (!rect || !visible || chromeBottom <= 0) return 0;
        const bandTop = visible.height - chromeBottom;
        const overlap = rect.top + rect.height - bandTop;
        return Math.max(0, Math.min(overlap, rect.height));
    }

    /**
     * Lift the showing track's cues clear of the chrome, and put them back down
     * when it goes.
     *
     * WebVTT's own positioning, not CSS: a cue box is painted inside the user
     * agent's shadow DOM, where no stylesheet of ours reaches and no
     * measurement of ours can look. `line` with `snapToLines` off is a
     * percentage of the picture's height and `lineAlign: 'end'` measures it
     * from the cue's own bottom, which together say exactly "leave this much
     * of the foot of the picture clear" however many lines the cue runs to.
     *
     * Only cues the WebVTT file left unplaced. A cue that names its own `line`
     * is a curator positioning a caption against the picture — a sign, a
     * speaker, a corner the shot leaves empty — and moving it would be this
     * viewer overruling the material. Such a cue is also unlikely to be at the
     * foot of the picture, which is the only place the bar can reach.
     */
    function liftCaptionCues(): void {
        if (!rendersCaptions) return;
        const showing = captionElements.find(
            (entry) => entry.caption.url === activeCaption,
        );
        const cues = (showing?.element.track as TextTrack | undefined)?.cues;
        if (!cues) return;

        const height = lastPlace?.rect?.height ?? 0;
        const clear =
            height > 0
                ? Math.min(
                      (chromeOverPicture() / height) * 100 +
                          CAPTION_GAP_PERCENT,
                      MAX_CAPTION_LIFT_PERCENT,
                  )
                : 0;

        // Indexed rather than iterated: `TextTrackCueList` is a legacy platform
        // object with a length and an indexed getter, and not every engine has
        // since given it a `Symbol.iterator`.
        const covered = chromeOverPicture() > 0;
        for (let at = 0; at < cues.length; at += 1) {
            const cue = cues[at];
            if (!cue) continue;
            const placed = cue as VTTCue;
            if (!covered) {
                if (!liftedCues.delete(cue)) continue;
                placed.snapToLines = true;
                placed.line = 'auto';
                continue;
            }
            if (!liftedCues.has(cue) && placed.line !== 'auto') continue;
            liftedCues.add(cue);
            placed.snapToLines = false;
            placed.lineAlign = 'end';
            placed.line = 100 - clear;
        }
    }

    return {
        canvasId,
        root,
        media,
        get source(): AvSource {
            return current;
        },
        setSource,
        adoptWaveform(module: TimelineModule, peaks: Peaks): void {
            // Only the `audio` layout has a timeline lane to draw into. Every
            // other layout's peaks go to the scrubber strip in the control bar
            // instead, which is the caller's own path.
            if (options.layout !== 'audio') return;
            // The surface factory comes from the loaded chunk rather than from
            // an import here: it is waveform code, and an import would pull it
            // into the entry alongside the parsers it is useless without.
            waveform ??= module.createWaveformSurface(
                timelineLane,
                timelineDuration,
            );
            // The waveform graduates the same window and says more about the
            // recording, so the ruler stands down rather than showing through
            // — and `waveform` being set is what stops `adoptRuler` building
            // one afterwards, whichever of the two resolves first.
            ruler?.yieldToWaveform();
            ruler = null;
            waveform.setPeaks(peaks);
            if (placement) {
                waveform.place(placement.lane, placement.visible);
            }
            waveform.paint(media.currentTime);
        },
        adoptRuler(module: TimelineModule): void {
            // Only the `audio` layout has a lane to graduate, and only a canvas
            // with no waveform needs graduating: everything else reaches the
            // timeline through the control bar's scrubber.
            if (options.layout !== 'audio' || waveform || ruler) return;
            // The factory comes from the loaded chunk rather than from an
            // import here, and the clock goes the other way: the chunk is built
            // self-contained, so it takes no value out of the eager graph.
            ruler = module.createRulerSurface(
                timelineLane,
                timelineDuration,
                formatMediaTime,
            );
            if (placement) {
                ruler.place(placement.lane, rulerVisible(placement.visible));
                ruler.paint(media.currentTime);
            }
        },
        paintTimeline(): void {
            waveform?.paint(media.currentTime);
            ruler?.paint(media.currentTime);
        },
        place,
        setChromeBottom(pixels: number): void {
            const next = Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
            if (next === chromeBottom) return;
            chromeBottom = next;
            liftCaptionCues();
            // The ruler is clipped against the band, so a bar that changed
            // height without the stage moving would leave it at the old one.
            if (placement) {
                ruler?.place(placement.lane, rulerVisible(placement.visible));
                ruler?.paint(media.currentTime);
            }
        },
        setCannotPlayMessage(message: string): void {
            unplayableNotice.textContent = message;
        },
        setGlyphVisible(visible: boolean): void {
            glyph.hidden = !visible || unplayable;
        },
        get captionTracks(): readonly CaptionTrack[] {
            return loadedCaptions();
        },
        rendersCaptions,
        captionTextTrack(url: string): TextTrack | null {
            const entry = captionElements.find(
                (candidate) => candidate.caption.url === url,
            );
            return (entry?.element.track as TextTrack | undefined) ?? null;
        },
        get activeCaptionTrack(): string | null {
            return activeCaption;
        },
        setCaptionTrack: selectCaptionTrack,
        setEligibleCaptions(urls: readonly string[] | null): void {
            eligibleCaptions = urls === null ? null : new Set(urls);
            captionCache = null;
            // Re-selecting the showing track drops it if the new body does not
            // carry it, by the same "cannot select what is not on offer" rule.
            selectCaptionTrack(activeCaption);
        },
        destroy(): void {
            destroyed = true;
            // Before the element is emptied: hls.js owns the `MediaSource`
            // attached to it and must be the one to detach it.
            hlsAttachment?.destroy();
            hlsAttachment = null;
            media.removeEventListener('error', onError);
            media.removeEventListener('loadeddata', reveal);
            media.removeEventListener('playing', reveal);
            media.removeEventListener('play', onPlay);
            media.removeEventListener('pause', onPause);
            media.removeEventListener('ended', onEnded);
            for (const entry of captionElements) entry.detach();
            unbindTaps();
            waveform?.destroy();
            ruler?.destroy();
            media.pause();
            // Drop the source before detaching so the browser stops any
            // transfer still in flight for a canvas nobody is looking at any
            // more.
            media.removeAttribute('src');
            media.load();
            root.remove();
        },
    };
}
