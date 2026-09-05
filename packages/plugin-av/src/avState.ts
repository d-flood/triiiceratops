/**
 * **AVState** — the playback state this activation publishes (ADR 0018), and the
 * only way anything outside the plugin commands playback: a host reaches it
 * through `viewerState.getPluginState('av')`, and this plugin's own UI goes
 * through the same object rather than touching a media element directly.
 *
 * All times are **canvas time on the canvas timeline** (CONTEXT.md): `duration`
 * is the canvas's duration and `currentTime`/`seek` are canvas-time positions.
 * While one body plays one canvas that mapping is the identity, which is why
 * this module reads the element's clock — but nothing on the published surface
 * says so, so a sequencer can supply the mapping behind the same members.
 */

import type { PublishedState } from '@triiiceratops/plugin-sdk';

import { PLUGIN_META } from './identity';

/**
 * External control of playback. Commands address the **current canvas's**
 * media; multi-target addressing (`seek(canvasId, t)`) is a compatible future
 * extension, deliberately not v1.
 */
export interface AVState extends PublishedState {
    /** Play. A rejection by the browser's autoplay policy resolves into state, never a throw. */
    play(): void;
    pause(): void;
    /** Seek to a canvas-time position, clamped to `[0, duration]`. */
    seek(seconds: number): void;
    setMuted(muted: boolean): void;
    /** Set output volume, clamped to `[0, 1]`. */
    setVolume(volume: number): void;
    readonly paused: boolean;
    /**
     * The current canvas's duration on the canvas timeline, or `null` when
     * neither the manifest nor the media has stated one.
     */
    readonly duration: number | null;
    readonly buffering: boolean;
    /** The canvas whose media these commands address, or `null` when there is none. */
    readonly activeMediaCanvasId: string | null;
    /** Query-only: read it on the {@link subscribeFrame} cadence, never off `subscribe`. */
    readonly currentTime: number;
    subscribe(listener: () => void): () => void;
    /** The finer cadence: the playhead's own tick, not the batched one. */
    subscribeFrame(listener: () => void): () => void;
}

/**
 * The AV plugin's published state on this viewer, or `null` when the plugin is
 * not active on it (absent, failed, or retrying — the fail-closed lifecycle every
 * plugin capability has).
 *
 * The typed way to reach it: ViewerState remains the sole surface, so a host
 * asks the viewer for the state and imports only the TYPE from this package.
 *
 * ```ts
 * const av = getAVState(viewer.viewerState);
 * av?.seek(30);
 * ```
 */
export function getAVState(viewerState: {
    getPluginState(pluginId: string): unknown;
}): AVState | null {
    const published = viewerState.getPluginState(PLUGIN_META.uiId);
    // Structural, not `instanceof`: the object crossed a package boundary, and
    // what makes it AVState is the contract it answers to.
    return published !== null &&
        typeof published === 'object' &&
        typeof (published as AVState).play === 'function'
        ? (published as AVState)
        : null;
}
