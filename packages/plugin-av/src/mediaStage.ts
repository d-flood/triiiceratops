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
import type { CompanionImage } from './companionCanvases';
import { warnAboutUnloadableCaptionTrack } from './degradation';
import type { HlsAttachment } from './hls/index';
import { hasNativeHlsSupport, isHlsSource, loadHls } from './hlsLink';
import type { AvSource } from './sources';
import {
    clipRect,
    laneFraction,
    stageLanes,
    type StageLanes,
    type StageLayoutKind,
} from './stageLayout';
import type { Peaks } from './waveform/peaks';
import type { VisibleBox, WaveformSurface } from './waveform/surface';
import type { WaveformModule } from './waveformLink';

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
     * The canvas's timeline reached its end.
     *
     * This is the seam `auto-advance` listens on, at the canvas-timeline level
     * rather than on a raw element: today one body fills the canvas and the
     * element's own `ended` is that end, and when ticket 18 sequences a composed
     * canvas the sequencer reaching its last segment fires this instead.
     *
     * It is not the only place that assumes one element's clock, though it is
     * the only END of one: `temporalOffsets.ts` waits on `readyState` /
     * `loadedmetadata` for "the canvas timeline is ready", which for a composed
     * canvas is not one element's metadata either. Both have to move together
     * when the sequencer lands.
     *
     * It fires only for playback that actually ran off the end — assigning
     * `currentTime` on a paused element does not end it — which is what makes
     * continuing into the next canvas reader-initiated rather than autoplay.
     */
    readonly onTimelineEnd?: () => void;
}

export interface MediaStage {
    readonly canvasId: string;
    /** The positioned box, to be appended to the plugin's overlay layer. */
    readonly root: HTMLElement;
    readonly media: HTMLMediaElement;
    /** Whether the stream failed and the stage shows the "can't play" treatment. */
    readonly unplayable: boolean;
    /**
     * Place the stage over a projected canvas rect, or hide it when there is
     * none. `visible` is the overlay container's own box: the stage is clipped
     * to it, so an overhanging projection neither draws nor takes pointer
     * events outside the container, and the waveform surface is clipped to it
     * so its backing store stays viewport-sized at any zoom.
     */
    place(rect: StageRect | null, visible: VisibleBox): void;
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
     * The caption tracks that LOADED — never the ones authored. A track the
     * browser refused (a dead URL, a server that grants no CORS) is not on
     * offer, because a control that selects it would do nothing.
     */
    readonly captionTracks: readonly CaptionTrack[];
    /** The showing track's URL, or `null` for off — which is where it starts. */
    readonly activeCaptionTrack: string | null;
    /** Show one loaded track, or `null` to show none. */
    setCaptionTrack(url: string | null): void;
    /**
     * The timeline lane — the waveform's drawing surface hangs inside it, and
     * `null` on a layout that has no timeline lane (video).
     */
    readonly timelineLane: HTMLElement | null;
    /**
     * Adopt resolved peaks for this canvas. Builds the drawing surface on the
     * first call; a layout with no timeline lane (video) keeps the data for the
     * scrubber strip and draws nothing here.
     */
    adoptWaveform(module: WaveformModule, peaks: Peaks): void;
    /**
     * Redraw the waveform and its playhead. Cheap and idempotent when there is
     * no waveform, because it is called on the playback frame cadence.
     */
    paintWaveform(): void;
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

/**
 * The stage's clip, as an `inset()` in the root's own coordinates — `'none'`
 * when the whole projection is inside the container.
 *
 * `clip-path` rather than a smaller box: the box IS the projection (the lanes
 * divide the canvas, and the waveform's geometry is measured against it), and
 * clipping takes the overhang out of hit testing as well as out of the picture,
 * which shrinking the box would only do by restretching the layout.
 */
function clipPathFor(rect: StageRect, shown: StageRect): string {
    const top = shown.top - rect.top;
    const left = shown.left - rect.left;
    const right = rect.width - (left + shown.width);
    const bottom = rect.height - (top + shown.height);
    if (top <= 0 && left <= 0 && right <= 0 && bottom <= 0) return 'none';
    return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
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

    if (!isHlsSource(source) || hasNativeHlsSupport(media)) {
        media.src = source.url;
    } else {
        void loadHls()
            .then((module) => {
                // The stage may have been torn down while the chunk was in flight;
                // attaching now would leave a player buffering into detached DOM.
                if (destroyed) return;
                hlsAttachment =
                    module?.attachHlsStream(media, source.url, onError) ?? null;
                // No chunk, or no Media Source Extensions to run it with. This
                // canvas cannot play here — which is one stage's treatment, not an
                // activation failure and not a `pluginerror` (user story 27).
                if (!hlsAttachment) onError();
            })
            .catch(() => {
                // Anything the chunk itself threw on the way to a player — a
                // constructor or an `attachMedia` that did not like this element.
                // Same outcome as no chunk at all: one stage's treatment.
                if (!destroyed) onError();
            });
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
        The layer is transparent to pointer events; the lanes opt back in. A tap
        on the visual lane toggles playback — the universal convention, and it
        must reach whatever is SHOWING there, which for a sound recording is the
        accompanying still rather than the media element.
    */
    const unbindTaps = onLaneTap(root, (lane, event) => {
        if (lane === timelineLane) onTimelineTap(event);
        else toggle();
    });

    /**
     * The waveform's drawing surface, built only once peaks have arrived — a
     * canvas nobody can draw into is DOM that costs memory and says nothing.
     * Video layouts never build one: their waveform data goes to the scrubber
     * strip instead (SPEC — "Rendering: stage layout").
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

    /** The last placement, so a late-arriving waveform can be drawn at once. */
    let placement: { lane: StageRect; visible: VisibleBox } | null = null;

    /**
     * The caption tracks, attached as native `<track>` children.
     *
     * Only on a video stage. An `<audio>` element has no rendering area, so the
     * cues of a track attached to one are parsed and never drawn — a toggle
     * over it would be visible and do nothing, which is the state user story 46
     * exists to forbid. A sound recording's transcript is a panel, and the SPEC
     * fences that out of this release.
     */
    const authoredCaptions =
        source.kind === 'video' ? (options.captions ?? []) : [];
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
    const loadedCaptions = (): CaptionTrack[] =>
        settledCaptions.filter(
            (track): track is CaptionTrack => track !== null,
        );
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
     * of user story 46 reached through the ordinary path, so it is dropped like
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

    /** Show the selected track and hide every other loaded one. */
    function applyCaptionModes(): void {
        for (const entry of captionElements) {
            setTrackMode(
                entry.element,
                entry.caption.url === activeCaption ? 'showing' : 'hidden',
            );
        }
    }

    return {
        canvasId,
        root,
        media,
        get unplayable(): boolean {
            return unplayable;
        },
        timelineLane: options.layout === 'video' ? null : timelineLane,
        adoptWaveform(module: WaveformModule, peaks: Peaks): void {
            if (options.layout === 'video') return;
            // The surface factory comes from the loaded chunk rather than from
            // an import here: it is waveform code, and an import would pull it
            // into the entry alongside the parsers it is useless without.
            waveform ??= module.createWaveformSurface(
                timelineLane,
                timelineDuration,
            );
            waveform.setPeaks(peaks);
            if (placement) waveform.place(placement.lane, placement.visible);
            waveform.paint(media.currentTime);
        },
        paintWaveform(): void {
            waveform?.paint(media.currentTime);
        },
        place(rect: StageRect | null, visible: VisibleBox): void {
            // What of the projection is inside the container. A stage whose
            // rect overhangs stays the size of its rect — the lanes divide the
            // canvas, not the viewport — and is CLIPPED to this instead, which
            // takes the overhanging part out of hit testing as well as out of
            // the picture (see `clipRect`). Without that, an audio canvas's
            // lane, which fills its whole rect, reaches over the columns beside
            // the container and swallows taps aimed at the chrome there.
            const shown = rect ? clipRect(rect, visible) : null;
            root.hidden = shown === null;
            if (!rect || !shown) {
                placement = null;
                waveform?.place(null, { width: 0, height: 0 });
                return;
            }
            root.style.left = `${rect.left}px`;
            root.style.top = `${rect.top}px`;
            root.style.width = `${rect.width}px`;
            root.style.height = `${rect.height}px`;
            root.style.clipPath = clipPathFor(rect, shown);

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

            if (lanes.timeline) {
                // The surface clips against the CONTAINER's box, so the lane
                // goes back into container coordinates the root already carries.
                placement = {
                    lane: {
                        ...lanes.timeline,
                        left: rect.left + lanes.timeline.left,
                        top: rect.top + lanes.timeline.top,
                    },
                    visible,
                };
                waveform?.place(placement.lane, placement.visible);
                waveform?.paint(media.currentTime);
            }
        },
        setCannotPlayMessage(message: string): void {
            unplayableNotice.textContent = message;
        },
        setGlyphVisible(visible: boolean): void {
            glyph.hidden = !visible || unplayable;
        },
        toggle,
        get captionTracks(): readonly CaptionTrack[] {
            return loadedCaptions();
        },
        get activeCaptionTrack(): string | null {
            return activeCaption;
        },
        setCaptionTrack(url: string | null): void {
            // A track that did not load cannot be selected, whoever asks: the
            // one guarantee this feature makes is that turning captions on
            // produces captions.
            activeCaption =
                url !== null &&
                loadedCaptions().some((caption) => caption.url === url)
                    ? url
                    : null;
            applyCaptionModes();
        },
        destroy(): void {
            destroyed = true;
            // Before the element is emptied: hls.js owns the `MediaSource`
            // attached to it and must be the one to detach it.
            hlsAttachment?.destroy();
            hlsAttachment = null;
            media.removeEventListener('error', onError);
            media.removeEventListener('play', onPlay);
            media.removeEventListener('pause', onPause);
            media.removeEventListener('ended', onEnded);
            for (const entry of captionElements) entry.detach();
            unbindTaps();
            waveform?.destroy();
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
