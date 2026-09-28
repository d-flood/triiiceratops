/** `repeat` needs `auto-advance`; never a per-canvas loop. */

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
