/**
 * The two playlist behaviors this plugin honours, read where IIIF Presentation
 * 3 defines them, and the one decision they make between them.
 *
 * `auto-advance` is valid on a Collection, a Manifest, a Canvas or a Range, and
 * says that reaching the end of one canvas's timeline moves on to the next.
 * `repeat` is valid on a Collection or a Manifest ONLY, does nothing on its own,
 * and — with `auto-advance` also in effect — returns to the first canvas instead
 * of stopping at the last. It is not a per-canvas loop, and it does not override
 * `auto-advance`: it depends on it.
 *
 * Only `behavior` is read. The Presentation 2 `viewingHint` vocabulary has no
 * term for either of these, so core's `getCanvasBehaviors` (which merges the
 * two, and is core-internal in any case) would answer nothing extra here.
 */

/** A resource's `behavior` terms, however the JSON spells them. */
export function readBehaviors(resource: unknown): readonly string[] {
    const behavior = (resource as { behavior?: unknown } | null)?.behavior;
    if (typeof behavior === 'string') return [behavior];
    if (Array.isArray(behavior))
        return behavior.filter(
            (term): term is string => typeof term === 'string',
        );
    return [];
}

/** What the manifest (or a canvas, for `autoAdvance`) asks of the playlist. */
export interface PlaylistBehaviors {
    readonly autoAdvance: boolean;
    /** Read off the Manifest and nowhere else — a Canvas cannot carry it. */
    readonly repeat: boolean;
}

export function playlistBehaviors(manifest: unknown): PlaylistBehaviors {
    const terms = readBehaviors(manifest);
    return {
        autoAdvance: terms.includes('auto-advance'),
        repeat: terms.includes('repeat'),
    };
}

/** What reaching the end of a canvas's timeline does. */
export type PlaylistAction = 'stop' | 'advance' | 'restart';

/**
 * @param autoAdvance in effect for this canvas — the canvas's own term or the
 * manifest's, since a manifest-level behavior governs the canvases inside it.
 * @param repeat the manifest's, and inert unless `autoAdvance` is in effect.
 * @param hasNext whether the viewer has a canvas after this one.
 */
export function endOfTimelineAction(
    autoAdvance: boolean,
    repeat: boolean,
    hasNext: boolean,
): PlaylistAction {
    if (!autoAdvance) return 'stop';
    if (hasNext) return 'advance';
    return repeat ? 'restart' : 'stop';
}
