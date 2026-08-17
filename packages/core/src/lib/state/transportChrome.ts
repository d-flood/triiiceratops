/**
 * The **transport chrome** registry: a view model of playback facts and a port
 * of playback commands, which a claimant of timed media registers and core
 * renders in its own control bar (CONTEXT.md **Transport chrome**).
 *
 * ## Deliberately not an AV seam
 *
 * Core learns about a thing that plays, pauses, seeks, may offer alternative
 * text tracks, and may offer a readable text of what it contains. It does not
 * learn about IIIF, media elements, time-based segments, or subtitle formats —
 * that vocabulary belongs to the claimant, and keeping it out is what makes the
 * seam serve a future medium (a 3D scene with a timeline, a synchronized
 * multi-track tool) without new core work.
 *
 * `transcript` is the one control here that commands something other than
 * playback: it asks the claimant to show its own reading surface, and where
 * that surface lives is the claimant's business entirely — core neither knows
 * nor asks. It earns a place beside the playback controls because a reader
 * looking for the words of a recording looks where the recording's controls
 * are, not in a plugin menu; and it is expressed as a two-state control rather
 * than a one-way "open" so the same button closes what it opened.
 *
 * Two consequences shape the contract below. `seek` takes a fraction of the
 * timeline rather than seconds, because core knows no clock; and every string
 * the chrome shows arrives on the view, localized by the claimant's own
 * catalog, because core has no words for a medium it does not model.
 *
 * ## What this module owns, and what it does not
 *
 * Only bookkeeping: which chrome is registered, and what happens when a
 * registration is refused. It is DOM-free and therefore unit-testable. The
 * controls, their layout and their keyboard behaviour belong to the render site
 * (`components/Transport.svelte`, inside `components/ViewerControls.svelte`);
 * the public registration surface belongs to
 * `ViewerState.registerTransportChrome`.
 *
 * ## Deliberately not the overlay-layer registry
 *
 * This is structurally `renderer/overlayLayers.ts` — the same ownership rule,
 * the same idempotent dispose, the same frozen snapshot — and that similarity
 * is intentional: one idiom to learn for both. It is nonetheless a **separate
 * module that does not import that one**, so a change to the DOM-container
 * lifecycle cannot ripple into a view-model registry, and vice versa. The small
 * overlap is duplicated on purpose; do not "de-duplicate" it by importing
 * across.
 *
 * **There is no `order` field, and adding one would be a mistake**, for the
 * reason the overlay-layer registry gives: cross-plugin ordering cannot be
 * coordinated. Here the question barely arises — at most one claimant drives
 * whatever the viewer is showing — so the slot holds one. If two registrations
 * are ever live, core renders the first and the second is inert, which is the
 * honest outcome for a slot that cannot hold two.
 */

import type { IconDescriptor } from '../types/plugin.js';

/** The pictures this medium's controls wear. */
export interface TransportChromeIcons {
    play: IconDescriptor;
    pause: IconDescriptor;
    mute: IconDescriptor;
    unmute: IconDescriptor;
    /** The alternative-text-track control. */
    tracks: IconDescriptor;
    /** The readable-text control. */
    transcript: IconDescriptor;
}

/** Every string the chrome shows or announces, in the claimant's locale. */
export interface TransportChromeLabels {
    /** Names the control group itself, so it is distinguishable from the navigation. */
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
    /** The "none" option of the track list. */
    tracksOff: string;
    /** Names the readable-text control, in both its states. */
    transcript: string;
}

/**
 * The playback facts the chrome renders, read on core's own cadence and never
 * held across a frame.
 */
export interface TransportChromeView {
    /** `false` renders no controls — no current target, or none claimed. */
    present: boolean;
    paused: boolean;
    duration: number | null;
    currentTime: number;
    /** `currentTime` as `0..1` of the duration — the scrubber's coordinate. */
    fraction: number;
    /** Buffered ranges as `0..1` spans of the whole timeline. */
    buffered: readonly { start: number; end: number }[];
    muted: boolean;
    volume: number;
    /** `false` where programmatic volume is read-only: the slider hides. */
    volumeSettable: boolean;
    /** The playhead as a localized clock reading, for `aria-valuetext`. */
    positionText: string;
    elapsedText: string;
    durationText: string;
    /** A picture of the whole recording behind the scrubber, or `null`. */
    strip: string | null;
    /** Alternative text tracks that loaded. Empty renders no control at all. */
    tracks: readonly { id: string; label: string }[];
    activeTrack: string | null;
    /**
     * Whether this target offers a readable text. `false` renders no control at
     * all — the same no-dead-control rule the empty `tracks` set follows.
     */
    transcript: boolean;
    /** Whether the claimant's reading surface is currently showing. */
    transcriptOpen: boolean;
    /** Seconds an arrow moves the playhead. The policy is the claimant's. */
    stepSmall: number;
    /** Seconds a page key moves the playhead. */
    stepLarge: number;
    labels: TransportChromeLabels;
}

/** Every control core renders is one of these. Core touches nothing else. */
export interface TransportChromePort {
    /** Play if paused, pause if playing. */
    toggle(): void;
    /** Seek to a fraction `0..1` of the timeline. */
    seek(fraction: number): void;
    setMuted(muted: boolean): void;
    setVolume(volume: number): void;
    /** Show one alternative text track, or `null` for none. */
    setTrack(id: string | null): void;
    /** Show or hide the claimant's readable text. */
    setTranscript(open: boolean): void;
}

/** Playback chrome, as a claimant registers it. */
export interface TransportChrome {
    /**
     * A stable identifier of the form `<pluginId>:<name>`, where the prefix must
     * name a plugin this viewer knows or the registration is refused (see
     * {@link createTransportChromeRegistry}'s `isKnownPlugin`). It is how a
     * refusal is reported, and it is what makes unregistering a plugin able to
     * release the chrome it forgot.
     */
    id: string;
    /**
     * Static for the activation. The pictures do not change with the playhead,
     * so re-reading them on every view read would be waste.
     */
    icons: TransportChromeIcons;
    /** Read on core's own cadence. Never held across a frame. */
    view(): TransportChromeView;
    port: TransportChromePort;
    /**
     * How core learns to re-read. The claimant already runs the cadences its
     * own published state runs on; this is how it hands them over. Returns an
     * unsubscribe.
     */
    subscribe(onChange: () => void): () => void;
}

/**
 * Chrome the registry accepted.
 *
 * A separate type from {@link TransportChrome} rather than an alias: what a
 * caller hands in and what the render site reads back are two contracts, and
 * the second may grow a field without that being a change to the first.
 */
export interface RegisteredTransportChrome {
    id: string;
    icons: TransportChromeIcons;
    view(): TransportChromeView;
    port: TransportChromePort;
    subscribe(onChange: () => void): () => void;
}

export interface TransportChromeRegistry {
    /**
     * Register chrome. Returns an idempotent dispose; a refused registration
     * returns a no-op one, so a caller never has to branch.
     */
    register(chrome: TransportChrome): () => void;
    /**
     * Dispose every registration whose id carries the `` `${pluginId}:` ``
     * prefix. The **backstop** for a plugin whose own teardown misses its
     * dispose, not the normal way to release chrome. Safe to call for a plugin
     * that registered nothing.
     */
    disposeOwnedBy(pluginId: string): void;
    /** Dispose everything, whoever owns it. `destroyAllPlugins`'s half. */
    disposeAll(): void;
    /**
     * The registrations, in registration order. A frozen snapshot rebuilt on
     * change, so the render site iterates a stable array rather than a live
     * collection it could mutate mid-render. Only the first is rendered.
     */
    readonly entries: readonly RegisteredTransportChrome[];
}

/** The registry behind `ViewerState.registerTransportChrome`. */
export function createTransportChromeRegistry(options?: {
    /** How the render site learns chrome arrived or left. */
    onChange?: () => void;
    /** Told why a registration was refused, for the developer's console. */
    onRefused?: (message: string) => void;
    /**
     * Whether `pluginId` names a plugin of this viewer. Viewer state answers
     * from plugin UI state, which is seeded before a plugin's `view.mount` runs
     * and is therefore already populated when the plugin registers from inside
     * it. Omitted, ids are not checked against any owner — the registry's own
     * unit tests have no viewer to ask.
     */
    isKnownPlugin?: (pluginId: string) => boolean;
}): TransportChromeRegistry {
    // A plain Set, deliberately not a `SvelteSet`: the reactive signal is the
    // `onChange` callback, which viewer state turns into exactly one state
    // write.
    const held = new Set<RegisteredTransportChrome>();
    let snapshot: readonly RegisteredTransportChrome[] = [];

    function rebuild(): void {
        snapshot = Object.freeze([...held]);
        options?.onChange?.();
    }

    function disposeWhere(matches: (id: string) => boolean): void {
        let removed = false;
        for (const entry of [...held]) {
            if (!matches(entry.id)) continue;
            held.delete(entry);
            removed = true;
        }
        if (removed) rebuild();
    }

    return {
        get entries() {
            return snapshot;
        },

        disposeOwnedBy(pluginId: string): void {
            const prefix = `${pluginId}:`;
            // The trailing colon is load-bearing: without it, unregistering
            // `notes` would also evict `notes-extra`'s chrome.
            disposeWhere((id) => id.startsWith(prefix));
        },

        disposeAll(): void {
            disposeWhere(() => true);
        },

        register(chrome: TransportChrome): () => void {
            const id = typeof chrome?.id === 'string' ? chrome.id.trim() : '';
            if (
                !id ||
                typeof chrome?.view !== 'function' ||
                typeof chrome?.subscribe !== 'function' ||
                !chrome?.port ||
                !chrome?.icons
            ) {
                options?.onRefused?.(
                    'registerTransportChrome needs an { id, icons, view, port, subscribe } chrome: a non-empty string id, an icon set, a view function, a command port and a subscribe function.',
                );
                return () => {};
            }

            // The prefix is everything before the FIRST colon, so a `<name>`
            // containing one is the plugin's business. An id with no colon has
            // no prefix, which no plugin id matches, so it lands here too.
            const separator = id.indexOf(':');
            const owner = separator > 0 ? id.slice(0, separator) : '';
            if (options?.isKnownPlugin && !options.isKnownPlugin(owner)) {
                options?.onRefused?.(
                    `registerTransportChrome ignored the chrome id "${id}": an id must be \`<pluginId>:<name>\` naming a plugin of this viewer, so the chrome is released when that plugin is.`,
                );
                return () => {};
            }

            for (const existing of held) {
                if (existing.id === id) {
                    options?.onRefused?.(
                        `registerTransportChrome ignored a second chrome with id "${id}"; ids are unique within a viewer.`,
                    );
                    return () => {};
                }
            }

            const registered: RegisteredTransportChrome = {
                id,
                icons: chrome.icons,
                view: chrome.view,
                port: chrome.port,
                subscribe: chrome.subscribe,
            };
            held.add(registered);
            rebuild();

            // Idempotent, and keyed on the record still being held rather than
            // on a "released" flag of its own: chrome already dropped by
            // `disposeOwnedBy` must make this a no-op too.
            return () => {
                if (!held.delete(registered)) return;
                rebuild();
            };
        },
    };
}
