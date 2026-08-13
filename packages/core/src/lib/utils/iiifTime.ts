/**
 * A `#t=` media fragment's span, in seconds. `endSeconds` is absent when the
 * fragment names only a start.
 *
 * This rides on `ViewerState.setCanvas` and `ContentStateTarget`, so it is a
 * public type. It lives apart from the `iiifTargets` parsers that produce it
 * because those are internal, and a public type would drag the whole module —
 * target normalization, selectors, `xywh=` — into the API contract with it.
 */
export type IiifTemporalFragment = {
    seconds: number;
    endSeconds?: number;
};
