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
 *   layer. A canvas maps to a *source provider* rather than to a body, so the
 *   canvas timeline can replace `placements[0]` without the stage changing.
 * - **Placing.** Every stage is projected from canvas space on every frame the
 *   viewport moves, which is what makes the media track pan and zoom.
 *
 * Authored as a runes module so the throwaway control panel can read the stage
 * list reactively without a second notification mechanism.
 */

import type { PluginContext } from '@triiiceratops/plugin-sdk';
import { isUnsupportedCanvas } from 'triiiceratops';

import type { AVState } from './avState';
import { createAvState } from './avPlayback';
import {
    endOfTimelineAction,
    playlistBehaviors,
    readBehaviors,
    type PlaylistBehaviors,
} from './behaviors';
import { captionTracksForCanvas } from './captions';
import {
    resolveAccompanyingImage,
    resolvePlaceholderImage,
} from './companionCanvases';
import {
    warnAboutCanvasRepeat,
    warnAboutDegradation,
    warnAboutUnreadableWaveform,
} from './degradation';
import {
    createMediaStage,
    type MediaStage,
    type StageRect,
} from './mediaStage';
import { reportAvCommandError } from './reportError';
import { scanCanvasForAv, type AvCanvasScan } from './sources';
import { stageLayoutKind } from './stageLayout';
import { createOffsetSeeker } from './temporalOffsets';
import { fractionToTime } from './transport';
import {
    createAudioPrefs,
    createTransport,
    type TransportLabels,
} from './transport.svelte';
import type { VisibleBox } from './waveform/surface';
import { loadPeaks, waveformUrlFor } from './waveformLink';

/** What the throwaway control panel renders one stage as. */
export interface AvStageView {
    readonly canvasId: string;
    /** Short, unlocalized identification for the throwaway control. */
    readonly label: string;
    readonly paused: boolean;
    readonly unplayable: boolean;
}

export interface AvStageManager {
    /** Every claimed canvas's stage, in layout order. Reactive. */
    readonly views: readonly AvStageView[];
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
}

/** The last path segment of a canvas id — enough to tell two stages apart. */
function shortLabel(canvasId: string): string {
    const trimmed = canvasId.replace(/[/#]+$/, '');
    const tail = trimmed.slice(trimmed.lastIndexOf('/') + 1);
    return tail || canvasId;
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

    // Deliberately non-reactive: the stages ARE the DOM, and what a component
    // renders from is the `views` snapshot published below, not this ledger.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const entries = new Map<string, StageEntry>();
    let views = $state.raw<AvStageView[]>([]);
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
                  }
                : null;
        },
        refuse: (error, retry) =>
            reportAvCommandError(errorTarget(), error, retry),
    });

    const prefs = createAudioPrefs();

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
        };
    }

    /**
     * ONE transport, anchored to whichever claimed canvas is current.
     *
     * One rather than one per stage, because AVState addresses the current
     * canvas's media and nothing else — multi-target addressing is a documented
     * future extension. A second transport over a canvas AVState cannot reach
     * would be chrome that reports the wrong canvas's playhead and commands the
     * wrong canvas's media, which is worse than no chrome. Every other visible
     * stage gets the play-state glyph instead.
     */
    const transport = createTransport({
        avState: publication.state,
        currentMedia: () => currentEntry()?.stage.media ?? null,
        prefs,
        labels: transportLabels,
        peaksStrip: () => currentEntry()?.strip ?? null,
        // Read off the stage each time rather than mirrored here: the loaded
        // set is decided asynchronously, per element, as each track's fetch
        // settles.
        captions: () => {
            const stage = currentEntry()?.stage;
            return {
                tracks: stage?.captionTracks ?? [],
                active: stage?.activeCaptionTrack ?? null,
            };
        },
        setCaptionTrack: (id) => currentEntry()?.stage.setCaptionTrack(id),
        t: (key, params) => context.locale.t(key, params),
    });

    function publishViews(): void {
        publication.sync();
        views = [...entries.values()].map((entry) => ({
            canvasId: entry.stage.canvasId,
            label: shortLabel(entry.stage.canvasId),
            paused: entry.stage.media.paused,
            unplayable: entry.stage.unplayable,
        }));
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
        let transportShowing = false;

        for (const entry of entries.values()) {
            const rect = rectFor(entry.scan);
            entry.stage.place(rect, visible);
            if (entry === current) transportShowing = transport.place(rect);
        }
        if (!current) transport.place(null);

        // The glyph is what a stage shows when no transport is over it —
        // because the canvas projects too narrow for one, or because the
        // transport belongs to a different canvas.
        for (const entry of entries.values()) {
            entry.stage.setGlyphVisible(entry !== current || !transportShowing);
        }
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

        const source = scan.placements[0].source;
        const rect = rectFor(scan);

        // Resolved here, requested by the stage once it has a lane to size the
        // request against: at claim time the renderer has usually not laid the
        // canvas out, and in `individuals` mode it never lays out any canvas
        // but the current one.
        const accompanying = resolveAccompanyingImage(canvas);
        const layout = stageLayoutKind(source.kind, accompanying !== null);

        const stage = createMediaStage({
            canvasId: scan.canvasId,
            source,
            layout,
            accompanying,
            placeholder: resolvePlaceholderImage(canvas),
            duration: scan.duration,
            cannotPlayMessage: cannotPlayMessage(),
            captions: captionTracksForCanvas(canvas),
            // A track settling changes whether there is a toggle at all, and
            // that is not playback state, so no AVState cadence would ever
            // pull the transport forward on its own.
            onCaptionTracksChange: () => transport.refresh(),
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
            onTimelineEnd: () => onTimelineEnd(scan.canvasId),
        });
        prefs.applyTo(stage.media);
        stage.place(rect, visibleBox());
        // Before the transport, which is appended last and must stay on top.
        layer?.insertBefore(stage.root, transport.root);
        const entry: StageEntry = {
            stage,
            scan,
            release,
            behaviors: readBehaviors(canvas),
            strip: null,
        };
        entries.set(scan.canvasId, entry);
        attachWaveform(entry, canvas);
    }

    /**
     * Resolve this canvas's waveform data, if it links any, and give it to the
     * stage and to the scrubber.
     *
     * Fire-and-forget: a waveform is an enhancement over a lane that already
     * seeks, so nothing waits for it and nothing fails without it. The
     * `await import()` inside `loadPeaks` is what keeps every byte of parsing
     * and rendering off a page whose manifests link none.
     */
    function attachWaveform(entry: StageEntry, canvas: unknown): void {
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
            if (isUnsupportedCanvas(canvas))
                wanted.set(scan.canvasId, { scan, canvas });
        }

        for (const canvasId of [...entries.keys()]) {
            if (!wanted.has(canvasId)) removeStage(canvasId);
        }
        for (const [canvasId, found] of wanted) {
            if (!entries.has(canvasId)) addStage(found.scan, found.canvas);
        }

        publishViews();
    }

    const releaseLayer = viewerState.registerOverlayLayer({
        // The prefix is the id the viewer knows this plugin by — never a literal.
        id: `${context.surface.id}:av-stages`,
        mount: (container: HTMLElement) => {
            layer = container;
            for (const entry of entries.values())
                container.append(entry.stage.root);
            // Last, so the chrome sits over every stage rather than under one.
            container.append(transport.root);
            placeAll();
            return () => {
                for (const entry of entries.values()) entry.stage.root.remove();
                transport.root.remove();
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
            // The transport is anchored to the current canvas, so it moves with
            // the selection rather than waiting for the next viewport frame.
            placeAll();
        });

    const offsets = createOffsetSeeker({
        mediaFor: (canvasId) => entries.get(canvasId)?.stage.media ?? null,
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
        get views(): readonly AvStageView[] {
            return views;
        },
        avState: publication.state,
        destroy(): void {
            publication.destroy();
            stopCurrent();
            stopRescan();
            stopOffsets();
            offsets.destroy();
            stopFrames();
            stopPlayheads();
            stopLocale();
            transport.destroy();
            for (const canvasId of [...entries.keys()]) removeStage(canvasId);
            releaseLayer();
            publishViews();
        },
    };
}
