/**
 * The activation's media manager: which canvases are this plugin's, the stage
 * each one gets, and where that stage sits on screen.
 *
 * Three jobs, deliberately in one place because they share one lifecycle:
 *
 * - **Scanning and claiming.** Every canvas is scanned on mount and again on
 *   every manifest change; the ones core cannot paint at all are claimed, which
 *   suppresses the unsupported presentation and leaves a clean box to render
 *   into. Which canvases those are is core's own question, asked through core's
 *   own classifier.
 * - **Staging.** One stage per claimed canvas, all of them inside ONE overlay
 *   layer. A canvas maps to a *source provider* rather than to a body: a canvas
 *   one body fills plays that body, and a temporally composed one gets a
 *   sequencer over the same stage. The stage itself knows neither case apart.
 * - **Placing.** Every stage is projected from canvas space on every frame the
 *   viewport moves, which is what makes the media track pan and zoom.
 */

import type { PluginContext } from '@triiiceratops/plugin-sdk';
import {
    getPaintingAnnotations,
    isImageBody,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
    type ChoiceSelection,
    type CompanionPhase,
} from 'triiiceratops';

import type { AVState } from './avState';
import { createAvState } from './avPlayback';
import {
    endOfTimelineAction,
    playlistBehaviors,
    readBehaviors,
    type PlaylistBehaviors,
} from './behaviors';
import { captionTracksForCanvas, type CaptionTrack } from './captions';
import {
    warnAboutCanvasRepeat,
    warnAboutDegradation,
    warnAboutUnreadableWaveform,
} from './degradation';
import { createPlayabilityProbe, selectSource } from './formats';
import { TRANSPORT_ICONS } from './icons';
import {
    createMediaStage,
    type MediaStage,
    type StageRect,
} from './mediaStage';
import { reportAvCommandError } from './reportError';
import type { CanvasSequencer } from './sequencer/index';
import { loadSequencer } from './sequencerLink';
import { scanCanvasForAv, type AvCanvasScan } from './sources';
import { stageLayoutKind } from './stageLayout';
import { createOffsetSeeker } from './temporalOffsets';
import {
    captionOptions,
    elementSpans,
    formatMediaTime,
    fractionToTime,
} from './transport';
import {
    createAudioPrefs,
    createTransport,
    type TransportLabels,
} from './transport.svelte';
import { type TextTranscript, textTranscriptFor } from './renderingTranscript';
import { loadTranscript } from './transcriptLink';
import type { VisibleBox } from './waveform/surface';
import { loadPeaks, waveformUrlFor } from './waveformLink';

export interface AvStageManager {
    /**
     * Where the panel wants its transcript rendered, or `null` when the panel
     * is gone. The manager owns the lazy chunk's lifecycle from here, because a
     * Svelte `$effect` would compile to a runtime helper core's curated shared
     * runtime does not publish.
     */
    setTranscriptHost(host: HTMLElement | null): void;
    /**
     * The published playback state (ADR 0018). The plugin's own UI commands
     * playback through this same object a host reaches by
     * `getPluginState('av')`, so there is one contract rather than two.
     */
    readonly avState: AVState;
    /** Release the claims, the layer, the subscriptions, and the media. */
    destroy(): void;
}

/** One live stage, plus the claim that entitles this plugin to draw it. */
interface StageEntry {
    readonly stage: MediaStage;
    readonly scan: AvCanvasScan;
    readonly release: () => void;
    /** This canvas's own `behavior` terms — `auto-advance` is read off them. */
    readonly behaviors: readonly string[];
    /**
     * The whole recording drawn once as a picture, for the scrubber's strip —
     * `null` until (or unless) waveform data resolves for this canvas.
     */
    strip: string | null;
    /**
     * The canvas timeline of a temporally composed canvas, once its chunk has
     * arrived. `null` for every canvas one body fills, and that is what makes
     * the mapping the identity there with no added behaviour.
     */
    sequencer: CanvasSequencer | null;
    /**
     * The untimed transcript this canvas links, or `null` for none. Resolved
     * once at claim time rather than re-derived per read: what a canvas links
     * cannot change without a restage.
     */
    readonly textTranscript: TextTranscript | null;
}

/**
 * Whether the canvas carries a companion Canvas under `property` that core will
 * paint — the whole of what the plugin needs to know to set a phase.
 *
 * Core reads the vocabulary, resolves the picture and sizes every request, so
 * nothing here inspects an image service or builds a URL: a companion is on the
 * same tier ladder as any other canvas precisely because this plugin has no
 * opinion about it (SPEC — "The plugin, reduced").
 *
 * A `true` answer has to mean core WILL paint, because the layout decision and
 * the paint decision have to agree: yielding the rect to a picture that never
 * arrives leaves the reader a blank stage, where the honest fallback is the
 * treatment the canvas would have had with no companion at all (SPEC —
 * "Degradation and honesty"). So each of core's own refusals is asked here:
 *
 * - a value that is not an object, or that carries no `items` holding a
 *   non-empty AnnotationPage, is **absent**. `items` and nothing else: core
 *   reaches a companion through that one spelling, so a v2 `images` or a
 *   3.0-beta `content` companion is absent to it however paintable it looks;
 * - a canvas with no id resolves to no images at all;
 * - a companion core cannot paint — a Text or Video body, and for a Choice the
 *   **selected** alternative rather than any of them — is refused by core's own
 *   classifier, asked with the same selection core resolves with;
 * - an image body with no id and no service resolves to nothing requestable.
 */
function paintsCompanion(
    selection: ChoiceSelection,
    canvas: unknown,
    property: string,
): boolean {
    const companion = (canvas as Record<string, unknown> | null | undefined)?.[
        property
    ];
    if (!companion || typeof companion !== 'object') return false;

    const pages = (companion as { items?: unknown }).items;
    if (
        !Array.isArray(pages) ||
        !pages.some(
            (page) =>
                Array.isArray((page as { items?: unknown } | null)?.items) &&
                (page as { items: unknown[] }).items.length > 0,
        )
    )
        return false;
    if (!canvasIdOf(companion)) return false;
    if (isUnsupportedCanvasFor(selection, companion)) return false;

    for (const annotation of getPaintingAnnotations(companion)) {
        for (const body of paintingBodyAlternatives(annotation)) {
            if (!isImageBody(body)) continue;
            const record = body as Record<string, unknown>;
            const id = record.id ?? record['@id'];
            if (typeof id === 'string' && id !== '') return true;
        }
    }
    return false;
}

function canvasIdOf(canvas: unknown): string {
    const record = (canvas ?? {}) as Record<string, unknown>;
    const id = record.id ?? record['@id'];
    return typeof id === 'string' ? id : '';
}

/**
 * @param errorNode the fallback DOM node refused commands are reported on. The
 * report bubbles (composed) to the viewer root's `pluginerror` channel, so it
 * only carries from a node that is in the viewer: the overlay-layer container
 * is preferred for exactly that reason (see `errorTarget`), and this is what is
 * left when no layer is mounted.
 */
export function createAvStageManager(
    context: PluginContext,
    errorNode: EventTarget,
): AvStageManager {
    const { viewerState } = context;

    // Deliberately non-reactive: the stages ARE the DOM, and nothing renders
    // from this ledger — `publishViews` is a pulse, not a snapshot.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const entries = new Map<string, StageEntry>();
    let layer: HTMLElement | null = null;

    /**
     * Where a refused command is dispatched. It must be a node that is IN the
     * viewer, because the report reaches the host by bubbling to the viewer
     * root: the plugin's mount container is only re-parented into the viewer
     * while the plugin's surface is open, so reporting there would silence every
     * refusal a host provokes with the panel closed. The overlay-layer container
     * is in the viewer's stage for as long as the activation lives.
     */
    function errorTarget(): EventTarget {
        return layer?.isConnected ? layer : errorNode;
    }

    // Commands address the CURRENT canvas's media, resolved live: `viewerState`
    // reads are synchronous even though its notifications are batched, so a
    // caller that navigates and commands in one tick reaches the canvas it just
    // selected rather than the one it left.
    /** The stage AVState addresses: the current canvas's, when it has one. */
    function currentEntry(): StageEntry | null {
        const entry = viewerState.canvasId
            ? entries.get(viewerState.canvasId)
            : undefined;
        return entry ?? null;
    }

    const publication = createAvState({
        currentTarget: () => {
            const entry = currentEntry();
            return entry
                ? {
                      canvasId: entry.stage.canvasId,
                      media: entry.stage.media,
                      canvasDuration: entry.scan.duration,
                      timeline: entry.sequencer,
                  }
                : null;
        },
        refuse: (error, retry) =>
            reportAvCommandError(errorTarget(), error, retry),
    });

    const prefs = createAudioPrefs();
    const canPlay = createPlayabilityProbe();

    function transportLabels(): TransportLabels {
        const { t } = context.locale;
        return {
            transport: t('av_transport'),
            play: t('av_play'),
            pause: t('av_pause'),
            seek: t('av_seek'),
            mute: t('av_mute'),
            unmute: t('av_unmute'),
            volume: t('av_volume'),
            elapsed: t('av_elapsed'),
            duration: t('av_duration'),
            captions: t('av_captions'),
            captionsOff: t('av_captions_off'),
            captionsTrack: t('av_captions_track'),
            transcript: t('av_transcript'),
        };
    }

    /**
     * ONE transport, driving whichever claimed canvas is current.
     *
     * One rather than one per stage, because AVState addresses the current
     * canvas's media and nothing else — multi-target addressing is a documented
     * future extension. A second transport over a canvas AVState cannot reach
     * would be chrome that reports the wrong canvas's playhead and commands the
     * wrong canvas's media, which is worse than no chrome. Every other visible
     * stage gets the play-state glyph instead.
     *
     * It builds no DOM: core renders it in the control bar from the view model
     * below (see `registerTransportChrome`).
     */
    const transport = createTransport({
        avState: publication.state,
        currentMedia: () => currentEntry()?.stage.media ?? null,
        // The element's buffered ranges are in the ACTIVE SEGMENT's clock; the
        // scrubber spans the whole canvas. The sequencer does that mapping
        // because only it knows the window to clamp against, and what crosses
        // back is canvas-time seconds rather than anything naming a segment.
        bufferedSpans: (ranges) => {
            const sequencer = currentEntry()?.sequencer;
            return sequencer
                ? sequencer.bufferedSpans(ranges)
                : elementSpans(ranges);
        },
        prefs,
        labels: transportLabels,
        peaksStrip: () => currentEntry()?.strip ?? null,
        // Read off the stage each time rather than mirrored here: the loaded
        // set is decided asynchronously, per element, as each track's fetch
        // settles.
        captions: () => {
            const stage = currentEntry()?.stage;
            return {
                // Only where the element can paint them. An audio stage
                // attaches its tracks for the transcript panel to read, and
                // offering a toggle over them would be the dead control user
                // story 46 forbids.
                tracks: stage?.rendersCaptions ? stage.captionTracks : [],
                active: stage?.activeCaptionTrack ?? null,
            };
        },
        setCaptionTrack: (id) => {
            currentEntry()?.stage.setCaptionTrack(id);
            // The transcript reads the SELECTED track, and a paused canvas is
            // running no frame cadence to notice on its own.
            publishViews();
        },
        hasTranscript: transcriptAvailable,
        // The panel's open state belongs to core, which owns the chrome that
        // opens it; `context.surface` is this plugin's live projection of it.
        panelOpen: () => context.surface.isOpen,
        setPanelOpen: (open) => {
            if (open) context.surface.open();
            else context.surface.close();
        },
        t: (key, params) => context.locale.t(key, params),
    });

    /** The registration's dispose while chrome is registered, `null` otherwise. */
    let releaseTransport: (() => void) | null = null;

    /**
     * Register playback chrome while this manifest has a claimed canvas, and
     * release it when it has none.
     *
     * Scoped to the MANIFEST rather than to the current canvas: navigating to an
     * image page inside an album is the transient case the view's `present`
     * flag covers, and deregistering per page would churn core's render site
     * for a state that is expected. A manifest this plugin claims nothing in
     * registers nothing at all, so a viewer of page images renders exactly the
     * chrome it renders today.
     */
    function syncTransportRegistration(): void {
        if (entries.size > 0) {
            releaseTransport ??= viewerState.registerTransportChrome({
                // The prefix is the id the viewer knows this plugin by.
                id: `${context.surface.id}:transport`,
                icons: TRANSPORT_ICONS,
                view: transport.view,
                port: transport.port,
                subscribe: transport.subscribe,
            });
            return;
        }
        releaseTransport?.();
        releaseTransport = null;
    }

    let transcriptHost: HTMLElement | null = null;
    let transcriptPanel: { refresh(): void; destroy(): void } | null = null;
    /** Which canvas the mounted panel was built for, or `null` for no panel. */
    let transcriptKey: string | null = null;
    /** Discriminates an in-flight chunk load from the mount that superseded it. */
    let transcriptToken = 0;

    /**
     * The track the transcript reads for the current canvas, or `null` when
     * this canvas offers no transcript at all.
     *
     * The stage's LOADED set, so a refused track and one that carries no cues
     * are both already gone: `null` here is the no-dead-control rule (user
     * story 46), and it is why a canvas with no VTT gets no entry rather than
     * an empty one.
     *
     * It follows the caption selection where there is one, and otherwise reads
     * the first loaded track — which is the state every sound recording is
     * permanently in, having no captions toggle to select with. The panel says
     * which track it is reading either way, so "the first one" is never a
     * silent choice.
     */
    function transcriptTrack(): CaptionTrack | null {
        const stage = currentEntry()?.stage;
        if (!stage) return null;

        const tracks = stage.captionTracks;
        return (
            tracks.find((track) => track.url === stage.activeCaptionTrack) ??
            tracks[0] ??
            null
        );
    }

    /**
     * Whether the current canvas offers a transcript in either shape.
     *
     * What the control-bar button is rendered on, and deliberately independent
     * of the panel: the host node only exists while the panel is OPEN, so a
     * check that consulted it would hide the very button that opens it.
     *
     * Not a `$derived`: the loaded caption set settles per track fetch, off
     * nobody's reactive graph, and the transport already re-reads its whole view
     * on the playback cadence.
     */
    function transcriptAvailable(): boolean {
        const entry = currentEntry();
        if (!entry) return false;
        return transcriptTrack() !== null || entry.textTranscript !== null;
    }

    /**
     * The live text track the transcript reads, the canvas time its cues must
     * be shifted by, and what to call it.
     *
     * Read on the frame cadence, and all three of them for the same reason: on
     * a temporally composed canvas a segment seam re-windows the eligible
     * tracks (ticket 18), so the track, its shift and its name all change
     * together at the seam. A panel told only the track would go on naming the
     * previous segment's while the cues changed underneath the label.
     *
     * The shift is derived rather than asked of the sequencer: AVState reports
     * the playhead in CANVAS time and the element reports it in the active
     * segment's own clock, so their difference IS that segment's start. It is
     * exactly `0` wherever the timeline is the identity, so no rounding stands
     * between an ordinary canvas and its own cue times.
     */
    function transcriptSource(): {
        track: TextTrack | null;
        offset: number;
        label: string;
    } {
        const entry = currentEntry();
        const track = transcriptTrack();
        if (!entry || !track) return { track: null, offset: 0, label: '' };
        return {
            track: entry.stage.captionTextTrack(track.url),
            offset: entry.sequencer
                ? publication.state.currentTime - entry.stage.media.currentTime
                : 0,
            label: captionOptions(
                [track],
                context.locale.t('av_captions_track'),
            )[0].label,
        };
    }

    /**
     * Bring the transcript panel into line with the canvas, the track and the
     * host.
     *
     * Called from `publishViews`, so on every playback notification: the key
     * comparison is what keeps a panel that is already right from being torn
     * down and rebuilt several times a second.
     *
     * The key is the CANVAS, deliberately not the track. Which track is read
     * changes without the canvas changing — a caption selection, a segment
     * seam re-windowing the eligible set — and tearing the panel down for that
     * would scroll a reader back to the top and drop their keyboard focus to
     * `<body>`. The panel follows the track through `transcriptSource`
     * instead, and `refresh` is what reaches it while playback is paused and
     * the frame cadence is therefore stopped.
     */
    function syncTranscript(): void {
        const host = transcriptHost;
        const track = transcriptTrack();
        // Timed text wins where a canvas offers both. It is navigable, it
        // follows the playhead, and it is the shape the IIIF transcript
        // meta-recipe means for display alongside playback; the linked file is
        // the same words with none of that, so it fills the gap rather than
        // competing for the panel.
        const text = track ? null : (currentEntry()?.textTranscript ?? null);
        // The KIND is part of the key, not just the canvas. Caption tracks
        // settle on the network, so a canvas that links both mounts the file
        // first and must hand over to the cue list the moment the VTT parses.
        const key =
            host && (track || text)
                ? `${viewerState.canvasId}\n${track ? 'cues' : 'text'}`
                : null;
        if (key === transcriptKey) {
            transcriptPanel?.refresh();
            return;
        }

        transcriptKey = key;
        transcriptToken += 1;
        transcriptPanel?.destroy();
        transcriptPanel = null;
        if (!host || !key) return;

        const token = transcriptToken;
        void loadTranscript().then((module) => {
            if (token !== transcriptToken || !module) return;
            transcriptPanel = text
                ? module.createTextTranscriptPanel(host, {
                      url: text.url,
                      label: text.label,
                      styles: context.styles,
                      t: context.locale.t,
                  })
                : module.createTranscriptPanel(host, {
                      avState: publication.state,
                      source: transcriptSource,
                      formatTime: formatMediaTime,
                      styles: context.styles,
                      t: context.locale.t,
                  });
        });
    }

    function publishViews(): void {
        publication.sync();
        syncTranscript();
    }

    /**
     * The stage's box in the overlay container's coordinates, or `null` when it
     * cannot be placed.
     *
     * The container's origin IS `canvasToScreen`'s origin (a published
     * contract), so a projected point needs no rect correction.
     *
     * The extent comes from `canvasSize` rather than from the manifest's
     * declared dimensions, because a duration-only audio canvas declares none
     * and is laid out anyway — from its siblings' median. Core's own ladder is
     * what `canvasToScreen` divides by, so asking it is the only way to project
     * the box the viewer is actually drawing rather than one this plugin made
     * up. `null` — a canvas the mounted renderer does not lay out, which in
     * `individuals` mode is every canvas but the current one — hides the stage
     * while its media stays operable.
     */
    function rectFor(scan: AvCanvasScan): StageRect | null {
        const size = viewerState.canvasSize(scan.canvasId);
        if (!size) return null;

        const topLeft = viewerState.canvasToScreen(
            { x: 0, y: 0 },
            scan.canvasId,
        );
        const bottomRight = viewerState.canvasToScreen(
            { x: size.width, y: size.height },
            scan.canvasId,
        );
        if (!topLeft || !bottomRight) return null;

        return {
            left: topLeft.x,
            top: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
        };
    }

    /**
     * The overlay container's own box — the area a reader can actually see.
     * The waveform surfaces clip against it so their backing stores stay
     * viewport-sized however far the canvas is zoomed in.
     */
    function visibleBox(): VisibleBox {
        // The container core hands a plugin is `display: contents` and has no
        // box of its own — the wrapper it sits in is what the stages' absolute
        // geometry is measured against. Walk up to whatever actually has one
        // rather than naming core's element, which is core's to rename.
        let node: HTMLElement | null = layer;
        while (node && node.clientWidth === 0 && node.clientHeight === 0)
            node = node.parentElement;
        return {
            width: node?.clientWidth ?? 0,
            height: node?.clientHeight ?? 0,
        };
    }

    function placeAll(): void {
        const current = currentEntry();
        const visible = visibleBox();

        for (const entry of entries.values()) {
            entry.stage.place(rectFor(entry.scan), visible);
            // The glyph says which recordings are playing among the claimed
            // canvases the bar is NOT driving. The canvas the bar does drive
            // needs none: its play state is in the bar.
            entry.stage.setGlyphVisible(entry !== current);
        }
    }

    /**
     * Which rendition of a set of alternatives to attach: the reader's explicit
     * pick if there is one, and otherwise the first this browser can play.
     * Per canvas, because a Choice is selected on the canvas.
     */
    function sourceFor(
        canvasId: string,
        alternatives: AvCanvasScan['placements'][number]['alternatives'],
    ) {
        return selectSource(
            alternatives,
            viewerState.getSelectedChoice(canvasId),
            canPlay,
        );
    }

    /**
     * The source a canvas is first staged with: its first placement's.
     *
     * Right for a canvas one body fills, and right enough for a composed one —
     * the sequencer corrects it to segment 0 when its chunk arrives, which
     * matters only for a manifest whose annotations are authored out of time
     * order.
     */
    function initialSourceFor(scan: AvCanvasScan) {
        return sourceFor(scan.canvasId, scan.placements[0].alternatives);
    }

    /**
     * Carry a changed selection to the stages that are already up. The stage
     * keeps the reader's place across the swap, so a rendition change mid-play
     * resumes where it was rather than restarting — and on a composed canvas
     * the sequencer re-selects the segment that is PLAYING rather than the
     * first one.
     */
    function applySelections(): void {
        for (const entry of entries.values()) {
            if (entry.sequencer) {
                entry.sequencer.reselect();
                continue;
            }
            const source = initialSourceFor(entry.scan);
            if (source) entry.stage.setSource(source);
        }
        publishViews();
    }

    /** Whether `auto-advance` governs this canvas — its own term, or the manifest's. */
    function autoAdvances(
        canvasId: string,
        manifest: PlaylistBehaviors,
    ): boolean {
        if (manifest.autoAdvance) return true;
        return (
            entries.get(canvasId)?.behaviors.includes('auto-advance') ?? false
        );
    }

    /**
     * Take the playlist step the decision asked for: move the viewer, then start
     * the canvas it arrived at from the beginning.
     *
     * Continuing to play across the boundary is not autoplay — this only runs
     * because the reader pressed play and playback ran off the end. From the
     * beginning because the arrived-at media may be resting where an earlier
     * pass through the playlist left it.
     */
    function continuePlayback(action: 'advance' | 'restart'): void {
        if (action === 'advance') viewerState.nextCanvas();
        else {
            const first = canvasIdOf(viewerState.canvases[0]);
            if (!first) return;
            viewerState.setCanvas(first);
        }

        // Silence rather than a refusal when the canvas arrived at is not this
        // plugin's: advancing into an image page is a complete playlist step,
        // not a failed command.
        publication.sync();
        const arrived = currentEntry();
        if (!arrived) return;
        // Before playing, not after: the transport carries the reader's mute
        // and volume to a newly-current element on its own refresh, which is a
        // microtask away — and an element that starts unmuted because of it is
        // one a browser's autoplay policy may simply refuse.
        prefs.applyTo(arrived.stage.media);
        publication.state.seek(0);
        publication.state.play();
    }

    /**
     * The end of a claimed canvas's timeline, on the canvas the viewer is
     * showing: `auto-advance` moves on, and `repeat` — the manifest's, alongside
     * `auto-advance` — wraps back to the first canvas rather than stopping.
     */
    function onTimelineEnd(canvasId: string): void {
        if (viewerState.canvasId !== canvasId) return;

        const manifest = playlistBehaviors(viewerState.manifestEntry?.json);
        const action = endOfTimelineAction(
            autoAdvances(canvasId, manifest),
            manifest.repeat,
            viewerState.hasNext,
        );
        if (action !== 'stop') continuePlayback(action);
    }

    function cannotPlayMessage(): string {
        return context.locale.t('av_cannot_play');
    }

    function addStage(scan: AvCanvasScan, canvas: unknown): void {
        // Before the claim, so a canvas nothing can be attached for is not
        // claimed and left without a stage — which would suppress the
        // unsupported presentation and put nothing in its place.
        const source = initialSourceFor(scan);
        if (!source) return;

        // `context.surface.id` — the id this viewer knows the plugin by. A claim
        // under any other name is refused, and it is what releases the claim if
        // this activation goes away without releasing it itself.
        const release = viewerState.claimCanvas(
            scan.canvasId,
            context.surface.id,
        );
        // A refused claim still returns a release — an inert one. Staging anyway
        // would draw over an unsupported-content placard this plugin never
        // suppressed, which is the failure the claim seam exists to prevent.
        if (
            viewerState.claimedCanvases.get(scan.canvasId) !==
            context.surface.id
        )
            return;

        const rect = rectFor(scan);

        // By what is painted in the rect PERMANENTLY: the accompanying canvas
        // outlives playback, so it is what decides whether this plugin draws
        // lanes at all. A canvas core paints one into gets none — only a tap
        // target and the glyph.
        const layout = stageLayoutKind(
            scan.width !== null && scan.height !== null,
            paintsCompanion(viewerState, canvas, 'accompanyingCanvas'),
        );

        /*
            The companion phase is the whole of what this plugin says about the
            picture: which of the canvas's own Presentation 3 properties core
            should render right now. Core reads the vocabulary and resolves it
            through its ordinary image pipeline, so a placeholder deep-zooms
            like any other canvas rather than being one fixed-size still.

            A phase is set only where the stage leaves core's painting visible,
            so the two can never disagree. Nothing of the plugin's is over the
            rect while a placeholder shows: the media element is invisible for
            exactly that long, and the `audio` layout's opaque timeline lane —
            which would otherwise cover the still — stands down for it and
            takes the rect back on the first play. A canvas laid out at the
            still's aspect keeps that rect through the handover, because a
            reflow at the moment playback starts is what story 10 forbids.
        */
        const showsPlaceholder = paintsCompanion(
            viewerState,
            canvas,
            'placeholderCanvas',
        );
        const setPhase = (phase: CompanionPhase): void =>
            viewerState.setCompanionPhase(
                scan.canvasId,
                context.surface.id,
                phase,
            );

        if (showsPlaceholder) setPhase('placeholder');
        else if (layout === 'audio-with-image') setPhase('accompanying');

        const stage = createMediaStage({
            canvasId: scan.canvasId,
            source,
            layout,
            awaitsFirstPlay: showsPlaceholder,
            // The rect is the same across every phase (core decides it once,
            // from the accompanying canvas ahead of the placeholder), so the
            // handover moves nothing under the reader. An explicit `'none'`
            // rather than no phase at all is what keeps that true: a released
            // phase would hand the canvas back its own geometry.
            onFirstPlay: showsPlaceholder
                ? () =>
                      setPhase(
                          layout === 'audio-with-image'
                              ? 'accompanying'
                              : 'none',
                      )
                : undefined,
            duration: scan.duration,
            cannotPlayMessage: cannotPlayMessage(),
            captions: captionTracksForCanvas(canvas),
            // A track settling changes whether there is a toggle at all, and
            // that is not playback state, so no AVState cadence would ever
            // pull the transport forward on its own.
            onCaptionTracksChange: () => {
                transport.refresh();
                // A track settles on the network's schedule, long after the
                // panel rendered: this is the only thing that can bring a
                // transcript in for it.
                publishViews();
            },
            onPlayStateChange: publishViews,
            // Through AVState, never into the element: a tap is the same seek a
            // host issues, clamped and refused by the same rules.
            //
            // Only for the canvas AVState is addressing. A tap on another
            // claimed canvas's lane would otherwise move THIS canvas's playhead
            // to a position read off a different canvas's timeline — the same
            // reason there is one transport rather than one per stage.
            onSeekFraction: (fraction) => {
                const { activeMediaCanvasId, duration } = publication.state;
                if (activeMediaCanvasId !== scan.canvasId) return;
                const seconds = fractionToTime(fraction, duration);
                if (seconds !== null) publication.state.seek(seconds);
            },
            // The END of one element's playback. Where the canvas timeline is
            // the identity mapping that IS its end; where a sequencer is
            // playing, it is the end of a segment, and only the sequencer can
            // tell the last one from the rest.
            onTimelineEnd: () => {
                const sequencer = entries.get(scan.canvasId)?.sequencer;
                if (sequencer) sequencer.segmentEnded();
                else onTimelineEnd(scan.canvasId);
            },
        });
        prefs.applyTo(stage.media);
        stage.place(rect, visibleBox());
        layer?.append(stage.root);
        const entry: StageEntry = {
            stage,
            scan,
            release,
            behaviors: readBehaviors(canvas),
            strip: null,
            sequencer: null,
            textTranscript: textTranscriptFor(canvas),
        };
        entries.set(scan.canvasId, entry);
        attachWaveform(entry, canvas);
        if (scan.temporallyComposed) attachSequencer(entry, canvas);
    }

    /**
     * Give a temporally composed canvas its canvas timeline.
     *
     * Fire-and-forget, and lazily loaded: `temporallyComposed` is the whole of
     * what the entry has to know, and everything that knows what a segment IS
     * lives in the chunk. A chunk that will not load leaves the canvas playing
     * its first body — degraded, never failed.
     */
    function attachSequencer(entry: StageEntry, canvas: unknown): void {
        const { canvasId } = entry.scan;
        // Fixed at claim time: which annotation a track was authored on cannot
        // change without a restage, so the per-annotation URL sets are built
        // once rather than re-derived from the raw canvas JSON at every seam.
        const tracks = captionTracksForCanvas(canvas);
        const byAnnotation: string[][] = [];
        const eligibleCaptions = (annotation: number): string[] =>
            (byAnnotation[annotation] ??= tracks
                .filter(
                    (track) =>
                        track.annotation === null ||
                        track.annotation === annotation,
                )
                .map((track) => track.url));

        void loadSequencer().then((module) => {
            // The canvas may have been restaged while the chunk was in flight.
            if (!module || entries.get(canvasId) !== entry) return;

            entry.sequencer = module.createCanvasSequencer({
                placements: entry.scan.placements,
                canvasDuration: entry.scan.duration,
                media: () => entry.stage.media,
                attached: () => entry.stage.source,
                select: (alternatives) => sourceFor(canvasId, alternatives),
                attach: (source, offset, play) =>
                    entry.stage.setSource(source, { at: offset, play }),
                // A caption track belongs to the body it was authored on, so
                // only the playing segment's may show. The sequencer names the
                // painting annotation and nothing about segments crosses.
                onSegment: (annotation) => {
                    entry.stage.setEligibleCaptions(
                        eligibleCaptions(annotation),
                    );
                    transport.refresh();
                    // The seam re-windows the eligible tracks, so the
                    // transcript is reading a different one from this moment.
                    // Tied to the seam itself rather than left to whichever
                    // media event the swap happens to raise next, so the
                    // re-source is ordered with the change that caused it.
                    publishViews();
                },
                onEnd: () => onTimelineEnd(canvasId),
            });

            // The timeline's duration is the canvas's, not the first segment's,
            // and nothing about a chunk arriving is a media event.
            publication.sync();
            transport.refresh();
            // A deep link into this canvas has been waiting for exactly this:
            // until the map existed there was nothing that could place a time
            // past the first body's own duration.
            offsets.retry();
        });
    }

    /**
     * Resolve this canvas's waveform data, if it links any, and give it to the
     * stage and to the scrubber.
     *
     * Fire-and-forget: a waveform is an enhancement over a lane that already
     * seeks, so nothing waits for it and nothing fails without it. The
     * `await import()` inside `loadPeaks` is what keeps every byte of parsing
     * and rendering off a page whose manifests link none.
     *
     * **Never on a temporally composed canvas** (spec fence, ticket 18). Any
     * waveform a canvas links describes ONE body, while the lane there spans
     * the whole work: peaks drawn across it would be a picture of act one
     * stretched over the opera. The lane still seeks in canvas time.
     */
    function attachWaveform(entry: StageEntry, canvas: unknown): void {
        if (entry.scan.temporallyComposed) return;

        const url = waveformUrlFor(canvas);
        if (!url) return;

        void loadPeaks(url).then((loaded) => {
            // The canvas may have gone, or been restaged, while this was in
            // flight; adopting into a destroyed stage would draw into detached
            // DOM and leak the peaks with it.
            if (!loaded || entries.get(entry.scan.canvasId) !== entry) {
                if (!loaded) warnAboutUnreadableWaveform(url);
                return;
            }
            entry.stage.adoptWaveform(loaded.module, loaded.peaks);
            entry.strip = loaded.module.renderPeaksStrip(loaded.peaks);
            // The strip is not playback state, so nothing about AVState changed
            // and no cadence will pull the transport forward on its own.
            transport.refresh();
            publishViews();
        });
    }

    function removeStage(canvasId: string): void {
        const entry = entries.get(canvasId);
        if (!entry) return;
        entries.delete(canvasId);
        entry.sequencer?.destroy();
        entry.stage.destroy();
        entry.release();
    }

    /**
     * Rescan the manifest: warn about everything degraded, claim and stage
     * everything claimable, and drop the stages of canvases that have gone.
     */
    function sync(): void {
        // Function-local temporary, built and discarded inside one diff.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const wanted = new Map<
            string,
            { scan: AvCanvasScan; canvas: unknown }
        >();

        for (const canvas of viewerState.canvases) {
            // Ahead of the AV scan: `repeat` is misplaced on ANY canvas, and a
            // curator who put it on a page of images needs telling as much as
            // one who put it on a recording.
            warnAboutCanvasRepeat(canvas);

            const scan = scanCanvasForAv(canvas);
            if (!scan) continue;

            warnAboutDegradation(canvas, scan);
            // A canvas with even one image body is core's to paint: there is no
            // unsupported presentation to suppress, so there is nothing to claim.
            // Every canvas core cannot paint is claimable, dimensions or not:
            // core lays a duration-only canvas out from its siblings, and
            // `canvasSize` reports the box it gave it. Nothing here has to
            // decide whether a canvas can be projected — `rectFor` answers
            // `null` when it cannot, and an unplaced stage hides.
            // Asked with the reader's selection, the same one the renderer
            // classifies with: a mixed Choice is core's canvas while its image
            // alternative is selected and this plugin's while its media one is.
            if (isUnsupportedCanvasFor(viewerState, canvas))
                wanted.set(scan.canvasId, { scan, canvas });
        }

        for (const canvasId of [...entries.keys()]) {
            if (!wanted.has(canvasId)) removeStage(canvasId);
        }
        for (const [canvasId, found] of wanted) {
            if (!entries.has(canvasId)) addStage(found.scan, found.canvas);
        }

        syncTransportRegistration();
        publishViews();
    }

    const releaseLayer = viewerState.registerOverlayLayer({
        // The prefix is the id the viewer knows this plugin by — never a literal.
        id: `${context.surface.id}:av-stages`,
        mount: (container: HTMLElement) => {
            layer = container;
            for (const entry of entries.values())
                container.append(entry.stage.root);
            placeAll();
            return () => {
                for (const entry of entries.values()) entry.stage.root.remove();
                layer = null;
            };
        },
    });

    // A manifest change rebuilds the canvas list; nothing else here cares which
    // canvas is current, so the canvas ids ARE the scan's input and its trigger.
    const canvasKey = context.selectors.select((state) =>
        state.canvases.map((canvas) => canvasIdOf(canvas)).join('\n'),
    );
    const stopRescan = canvasKey.subscribe(() => sync());

    // Which canvas is current decides which media AVState commands, so a
    // navigation republishes `activeMediaCanvasId` and the facts beside it.
    const stopCurrent = context.selectors
        .select((state) => state.canvasId)
        .subscribe(() => {
            publication.sync();
            // Which stage wears the play-state glyph follows the selection,
            // rather than waiting for the next viewport frame.
            placeAll();
            // A navigation onto or off a claimed canvas flips the view's
            // `present`, and no AVState cadence runs on a paused canvas to
            // carry it to the bar.
            transport.refresh();
        });

    // The reader's Choice picks, read through core's own selection state rather
    // than mirrored here: `selectChoice` is the command a host already has
    // for an image Choice, and a media Choice must answer to the same one.
    //
    // Keyed over every canvas rather than every staged one, because a selection
    // can change which canvases are staged at all: a mixed Choice is core's to
    // paint while its image alternative is selected and this plugin's while its
    // media one is, so `sync` runs before the swaps.
    const stopChoices = context.selectors
        .select((state) =>
            state.canvases
                .map((canvas) => {
                    const id = canvasIdOf(canvas);
                    return `${id}\t${state.getSelectedChoice(id) ?? ''}`;
                })
                .join('\n'),
        )
        .subscribe(() => {
            sync();
            applySelections();
        });

    const offsets = createOffsetSeeker({
        mediaFor: (canvasId) => entries.get(canvasId)?.stage.media ?? null,
        // A composed canvas's timeline is its segment map: it can place every
        // second of the canvas the moment the sequencer exists, and which
        // element to load is what resolving the offset ANSWERS. Until the chunk
        // lands there is no timeline to place an offset against — and the
        // element that IS attached is the first body, whose duration would
        // clamp a deep link into act two down to the end of act one.
        timelineReadiness: (canvasId) => {
            const entry = entries.get(canvasId);
            if (entry?.sequencer) return 'ready';
            return entry?.scan.temporallyComposed ? 'pending' : 'element';
        },
        // The same path a host's `seek` takes, so an offset is clamped and
        // refused by the same rules. Only ever for the canvas the viewer is on:
        // a held offset can come due after the reader has navigated away, and
        // AVState addresses the current canvas alone.
        seek: (canvasId, seconds) => {
            if (viewerState.canvasId === canvasId)
                publication.state.seek(seconds);
        },
    });

    // The offset is a fact about the navigation that just happened, replaced
    // whole (or nulled) by the next one — so a new one supersedes a held one and
    // a navigation carrying no time drops it. Selected by identity: core
    // reassigns the object per navigation, so re-entering the same chapter seeks
    // again rather than being memoized away.
    const stopOffsets = context.selectors
        .select((state) => state.temporalOffset)
        .subscribe((offset) => offsets.apply(offset));

    // `frame` means "the image moved" — the cadence that keeps the media inside
    // the canvas rect through a pan or a zoom.
    const stopFrames = viewerState.subscribeFrame(placeAll);

    /**
     * The playhead's cadence: AVState's own frame notification, which runs while
     * something is playing and stops when nothing is.
     *
     * Each lane paints its OWN element's `currentTime` rather than AVState's.
     * AVState addresses the current canvas alone, so every other claimed
     * canvas's lane would otherwise draw a playhead taken from a recording it is
     * not showing — the same "chrome that lies" the single transport avoids.
     */
    const stopPlayheads = publication.state.subscribeFrame(() => {
        for (const entry of entries.values()) entry.stage.paintWaveform();
    });

    const stopLocale = context.locale.subscribe(() => {
        const message = cannotPlayMessage();
        for (const entry of entries.values()) {
            entry.stage.setCannotPlayMessage(message);
        }
        transport.retranslate();
    });

    sync();
    // A selector notifies on change and not on subscription, so an offset the
    // viewer already carries — a manifest `start`, or a content state, resolved
    // before this activation mounted — has to be picked up once by hand.
    offsets.apply(viewerState.temporalOffset);

    return {
        setTranscriptHost(host: HTMLElement | null): void {
            transcriptHost = host;
            syncTranscript();
        },
        avState: publication.state,
        destroy(): void {
            transcriptPanel?.destroy();
            transcriptPanel = null;
            transcriptToken += 1;
            publication.destroy();
            stopCurrent();
            stopRescan();
            stopChoices();
            stopOffsets();
            offsets.destroy();
            stopFrames();
            stopPlayheads();
            stopLocale();
            releaseTransport?.();
            releaseTransport = null;
            transport.destroy();
            for (const canvasId of [...entries.keys()]) removeStage(canvasId);
            releaseLayer();
            publishViews();
        },
    };
}
