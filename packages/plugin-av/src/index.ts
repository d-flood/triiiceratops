/**
 * `@triiiceratops/plugin-av` — ESM entry.
 *
 * ```ts
 * import { AvPlugin } from '@triiiceratops/plugin-av';
 *
 * // Svelte:  <TriiiceratopsViewer plugins={[AvPlugin]} />
 * // WC:      viewer.plugins = [AvPlugin];
 * ```
 *
 * This build leaves `svelte` external as an ordinary peer, so a consumer's
 * bundler dedupes it against core's copy.
 */

export { AvPlugin } from './plugin';

// External control (ADR 0018). The STATE is reached through the viewer —
// `getAVState(viewerState)` — never imported; only its type is.
export { getAVState } from './avState';
export type { AVState } from './avState';

export type {
    AvCanvasScan,
    AvMediaKind,
    AvPlacement,
    AvSource,
} from './sources';
export { scanCanvasForAv } from './sources';
